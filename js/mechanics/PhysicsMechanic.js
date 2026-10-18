/* =========================================
   PhysicsMechanic.js — Base for Physics Minigames

   Shared plumbing for minigames built on PhysicsWorld (Matter.js), so a
   concrete game (see StackOverflowMechanic) only has to:
     1) build bodies in _setupBodies(context)
     2) decide success/failure in _evaluate(dt)
     3) draw in _renderScene(ctx, W, H, alpha)

   It plugs into the generic S.MINIGAME host in GameManager:
     render(ctx, W, H, gameTime, alpha)
     handleKey(code, inputOffset) / handlePointer(x, y, phase, inputOffset)
   ========================================= */

const _MechanicBaseP = (typeof Mechanic !== 'undefined') ? Mechanic : class {};

class PhysicsMechanic extends _MechanicBaseP {
    constructor(options = {}) {
        super();
        this.options = options;
        this.world = null;
        this.bodies = [];
        this.time = 0;
        this.stepDt = options.fixedDt || 1 / 60;
        this.resultDuration = 1.2;
    }

    init(context = {}) {
        this.active = true;
        this.result = null;
        this.time = 0;
        if (this.world) this.world.destroy();
        this.world = new PhysicsWorld({
            gravity: this.options.gravity !== undefined ? this.options.gravity : 1000,
            fixedDt: this.stepDt,
            enableSleeping: this.options.enableSleeping
        });
        this.bodies = [];
        this._setupBodies(context);
    }

    _setupBodies(/* context */) {
        // Subclasses create and add bodies here.
    }

    update(dt) {
        if (!this.active || !this.world) return;
        this.stepDt = dt || this.stepDt;
        this.time += this.stepDt;
        // The world owns the fixed step; it consumes exactly `dt`.
        this.world.step(this.stepDt);
        if (this.result === null) this._evaluate(this.stepDt);
    }

    _evaluate(/* dt */) {
        // Subclasses decide success/failure and set this.result.
    }

    /**
     * Time that is on screen right now. Bodies are drawn interpolated
     * between the previous and current step, so analytic motion (cranes,
     * sliders) must use the same clock to stay in sync with them.
     */
    renderTime(alpha = 1) {
        return this.time - this.stepDt * (1 - Math.max(0, Math.min(1, alpha)));
    }

    render(ctx, W, H, gameTime, alpha = 1) {
        this._renderScene(ctx, W, H, alpha);
    }

    _renderScene(/* ctx, W, H, alpha */) {}

    /** Draw a rectangle body at its interpolated pose. */
    drawBox(ctx, body, w, h, alpha, draw) {
        const p = this.world.interpolate(body, alpha);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        draw(ctx, w, h);
        ctx.restore();
    }

    reset() {
        super.reset();
        if (this.world) this.world.destroy();
        this.world = null;
        this.bodies = [];
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = PhysicsMechanic;
