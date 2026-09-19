/* =========================================
   GameLoop.js — Fixed-Timestep Game Loop

   Why: variable dt made the timing bar frame-rate dependent and the
   old main.js clamped dt to 1/30, which put the whole game into slow
   motion on slow devices. This loop decouples simulation from render:

     - simulation always advances in exact `fixedDt` steps (default 1/60)
     - an accumulator absorbs real frame time and catches up
     - a bounded number of sub-steps prevents the "spiral of death"
     - render receives an interpolation `alpha` in [0, 1)
   ========================================= */

class GameLoop {
    constructor(options) {
        this.update = options.update;               // (fixedDt) => void
        this.render = options.render;               // (alpha, fixedDt) => void
        this.fixedDt = options.fixedDt || 1 / 60;
        this.maxSubSteps = options.maxSubSteps || 5;
        this.maxFrameTime = options.maxFrameTime || 0.25;

        this.accumulator = 0;
        this.lastTime = null;
        this.simulatedTime = 0;
        this._running = false;
        this._raf = null;
        this._frame = this._frame.bind(this);
    }

    start() {
        if (this._running) return;
        this._running = true;
        this._raf = requestAnimationFrame(this._frame);
    }

    stop() {
        this._running = false;
        if (this._raf !== null) cancelAnimationFrame(this._raf);
        this._raf = null;
    }

    _frame(timestamp) {
        if (this.lastTime === null) this.lastTime = timestamp;

        let frameTime = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;
        if (frameTime < 0) frameTime = 0;
        if (frameTime > this.maxFrameTime) frameTime = this.maxFrameTime;

        this.accumulator += frameTime;

        let steps = 0;
        while (this.accumulator >= this.fixedDt && steps < this.maxSubSteps) {
            this.update(this.fixedDt);
            this.simulatedTime += this.fixedDt;
            this.accumulator -= this.fixedDt;
            steps++;
        }

        // Under heavy lag, drop the leftover backlog so we never spiral.
        if (steps >= this.maxSubSteps && this.accumulator >= this.fixedDt) {
            this.accumulator = this.accumulator % this.fixedDt;
        }

        const alpha = this.accumulator / this.fixedDt;
        this.render(alpha, this.fixedDt);

        if (this._running) this._raf = requestAnimationFrame(this._frame);
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = GameLoop;
