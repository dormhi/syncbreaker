/* =========================================
   PhysicsWorld.js — Matter.js Rigid-Body Wrapper

   Scope: physics-based bonus minigames (e.g. Stack Overflow).
   The core timing bar and lockpick deliberately do NOT use this —
   their hit timing must stay deterministic and independent of any
   rigid-body solver.

   Guarantees:
   - Fixed timestep. Matter always advances in exact `fixedDt` steps;
     any dt handed to step() is absorbed by an internal accumulator, so
     the simulation never depends on the caller's frame rate.
   - Render interpolation. The pose of every body before the last step
     is kept, so render can blend prev -> current with the loop's alpha
     (no judder on 120/144 Hz displays).
   - Per-second units at the API boundary: velocities in px/s, gravity
     in px/s^2. Matter's internal "px per 16.67 ms" units stay hidden.
   - Collision callbacks resolve compound parts to their parent body.

   Usage:
     const world = new PhysicsWorld({ gravity: 1200 });
     world.addBody(body);
     world.onCollision((a, b, pair) => { ... });
     world.step(fixedDt);
     const pose = world.interpolate(body, alpha);
     world.destroy();
   ========================================= */

class PhysicsWorld {
    constructor(options = {}) {
        const M = (typeof Matter !== 'undefined') ? Matter : null;
        if (!M) {
            throw new Error('PhysicsWorld: Matter.js is not loaded (vendor/matter.min.js)');
        }
        this.M = M;

        this.fixedDt = options.fixedDt || 1 / 60;
        // Matter expects a millisecond delta.
        this._deltaMs = this.fixedDt * 1000;
        this._accumulator = 0;
        this.time = 0;
        this.steps = 0;

        this.engine = M.Engine.create({
            enableSleeping: options.enableSleeping !== undefined ? options.enableSleeping : false,
            // Stacking needs more solver passes than Matter's defaults (6/4).
            positionIterations: options.positionIterations || 10,
            velocityIterations: options.velocityIterations || 8
        });
        this.setGravity(options.gravity !== undefined ? options.gravity : 1000, options.gravityX || 0);

        this._prev = new Map();          // body.id -> { x, y, angle }
        this._collisionHandlers = [];
        this._onCollisionStart = (e) => this._dispatchCollisions(e.pairs);
        M.Events.on(this.engine, 'collisionStart', this._onCollisionStart);
    }

    // ── Units ──

    /** Gravity in px/s^2 (positive y is down). */
    setGravity(y, x = 0) {
        // Matter: acceleration (px/ms^2) = gravity.{x,y} * gravity.scale.
        this.engine.gravity.scale = 1e-6; // 1 px/s^2 = 1e-6 px/ms^2
        this.engine.gravity.x = x;
        this.engine.gravity.y = y;
    }

    /** Set a body's velocity in px/s. */
    setVelocity(body, vx, vy) {
        const k = PhysicsWorld.BASE_DELTA_MS / 1000;
        this.M.Body.setVelocity(body, { x: vx * k, y: vy * k });
    }

    /** A body's velocity in px/s. */
    getVelocity(body) {
        const k = 1000 / PhysicsWorld.BASE_DELTA_MS;
        return { x: body.velocity.x * k, y: body.velocity.y * k };
    }

    /** Linear speed in px/s. */
    speedOf(body) {
        return body.speed * 1000 / PhysicsWorld.BASE_DELTA_MS;
    }

    // ── Bodies ──

    addBody(body) {
        this.M.Composite.add(this.engine.world, body);
        this._snapshot(body);
        return body;
    }

    removeBody(body) {
        this.M.Composite.remove(this.engine.world, body);
        this._prev.delete(body.id);
    }

    get bodies() { return this.M.Composite.allBodies(this.engine.world); }

    get world() { return this.engine.world; }

    // ── Simulation ──

    /**
     * Advance the simulation. With no argument exactly one fixed step is
     * taken; with a dt the time is accumulated and consumed in fixed steps.
     * @returns {number} number of fixed steps taken
     */
    step(dt) {
        if (dt === undefined) {
            this._fixedStep();
            return 1;
        }
        if (!(dt > 0) || !isFinite(dt)) return 0;
        this._accumulator += dt;
        let n = 0;
        // Epsilon so a 1/60 loop feeding a 1/60 world never drops a step
        // to floating-point round-off.
        const eps = 1e-9;
        while (this._accumulator + eps >= this.fixedDt) {
            this._accumulator -= this.fixedDt;
            this._fixedStep();
            n++;
        }
        if (this._accumulator < 0) this._accumulator = 0;
        return n;
    }

    _fixedStep() {
        for (const b of this.bodies) this._snapshot(b);
        this.M.Engine.update(this.engine, this._deltaMs);
        this.time += this.fixedDt;
        this.steps++;
    }

    _snapshot(body) {
        this._prev.set(body.id, { x: body.position.x, y: body.position.y, angle: body.angle });
    }

    /**
     * Body pose blended between the previous and current fixed step.
     * `alpha` is the loop's interpolation factor in [0, 1).
     */
    interpolate(body, alpha = 1) {
        const p = this._prev.get(body.id);
        const a = Math.max(0, Math.min(1, alpha));
        if (!p) return { x: body.position.x, y: body.position.y, angle: body.angle };
        return {
            x: p.x + (body.position.x - p.x) * a,
            y: p.y + (body.position.y - p.y) * a,
            angle: p.angle + (body.angle - p.angle) * a
        };
    }

    // ── Collisions ──

    /** handler(bodyA, bodyB, pair) — called for every new contact pair. */
    onCollision(handler) {
        this._collisionHandlers.push(handler);
        return () => {
            const i = this._collisionHandlers.indexOf(handler);
            if (i >= 0) this._collisionHandlers.splice(i, 1);
        };
    }

    _dispatchCollisions(pairs) {
        if (!this._collisionHandlers.length) return;
        for (const pair of pairs) {
            const a = pair.bodyA.parent || pair.bodyA;
            const b = pair.bodyB.parent || pair.bodyB;
            for (const h of this._collisionHandlers) h(a, b, pair);
        }
    }

    // ── Lifecycle ──

    clear() {
        this.M.Composite.clear(this.engine.world, false, true);
        this.M.Engine.clear(this.engine);
        this._prev.clear();
        this._accumulator = 0;
    }

    destroy() {
        this.clear();
        this.M.Events.off(this.engine, 'collisionStart', this._onCollisionStart);
        this._collisionHandlers = [];
    }
}

// Matter's velocity unit is "px per base delta" (1000/60 ms).
PhysicsWorld.BASE_DELTA_MS = 1000 / 60;

if (typeof module !== 'undefined' && module.exports) module.exports = PhysicsWorld;
