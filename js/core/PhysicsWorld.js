/* =========================================
   PhysicsWorld.js — Matter.js Rigid-Body Wrapper

   Scope: reserved for FUTURE physics-based bonus minigames only.
   The core timing bar and lockpick deliberately do NOT use this —
   their hit timing must stay deterministic and independent of any
   rigid-body solver.

   Usage:
     const world = new PhysicsWorld({ gravity: 1 });
     world.addBody(body);
     world.step(fixedDt);
     world.clear();
   ========================================= */

class PhysicsWorld {
    constructor(options = {}) {
        const M = (typeof Matter !== 'undefined') ? Matter : null;
        if (!M) {
            throw new Error('PhysicsWorld: Matter.js is not loaded (vendor/matter.min.js)');
        }
        this.M = M;
        this.engine = M.Engine.create();
        this.engine.gravity.y = options.gravity !== undefined ? options.gravity : 1;
        this.engine.gravity.x = options.gravityX || 0;
        this._fixedDt = options.fixedDt || 1 / 60;
        // Matter expects a millisecond delta.
        this._deltaMs = this._fixedDt * 1000;

        this.runner = null;
    }

    addBody(body) { this.M.Composite.add(this.engine.world, body); }

    removeBody(body) { this.M.Composite.remove(this.engine.world, body); }

    /** Advance exactly one fixed simulation step. */
    step(/* fixedDt */) {
        this.M.Engine.update(this.engine, this._deltaMs);
    }

    clear() {
        this.M.Composite.clear(this.engine.world, false, true);
    }

    get world() { return this.engine.world; }
}

if (typeof module !== 'undefined' && module.exports) module.exports = PhysicsWorld;
