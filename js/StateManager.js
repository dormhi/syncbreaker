/* =========================================
   StateManager.js — Finite State Machine
   ========================================= */

class StateManager {
    constructor() {
        // Define the available application states
        this.STATES = {
            MENU: 'MENU',
            HUB: 'HUB',
            LEVEL: 'LEVEL',
            LOCKPICK: 'LOCKPICK',
            GAME_OVER: 'GAME_OVER',
            ENDLESS: 'ENDLESS',
            ENDLESS_OVER: 'ENDLESS_OVER',
            CONGRATS: 'CONGRATS',
            PROFILE_SETUP: 'PROFILE_SETUP',
            LEADERBOARD: 'LEADERBOARD'
        };

        this.currentState = this.STATES.MENU;
        this.previousState = null;
        this._handlers = {};

        // State transition animation variables
        this.transitioning = false;
        this.transitionProgress = 0;
        this.transitionDuration = 0.3;
        this.transitionTimer = 0;
        this.pendingState = null;
        this.pendingContext = null;
    }

    // Registers a state with its lifecycle hooks (enter, update, render, exit, onKey)
    register(state, handlers) {
        this._handlers[state] = {
            enter: handlers.enter || function() {},
            update: handlers.update || function() {},
            render: handlers.render || function() {},
            exit: handlers.exit || function() {},
            onKey: handlers.onKey || function() {}
        };
    }

    change(newState, context = null) {
        if (this.transitioning) return;
        if (!this.STATES[newState]) return;

        this.pendingState = newState;
        this.pendingContext = context;
        this.transitioning = true;
        this.transitionTimer = 0;
        this.transitionProgress = 0;
    }

    update(dt) {
        if (this.transitioning) {
            this.transitionTimer += dt;
            this.transitionProgress = Utils.clamp(
                this.transitionTimer / this.transitionDuration, 0, 1
            );

            if (this.transitionProgress >= 0.5 && this.pendingState) {
                this._executeTransition();
            }

            if (this.transitionProgress >= 1) {
                this.transitioning = false;
            }
            return;
        }

        const h = this._handlers[this.currentState];
        if (h) h.update(dt);
    }

    render(ctx, alpha) {
        const h = this._handlers[this.currentState];
        if (h) h.render(ctx, alpha);

        if (this.transitioning) {
            let alpha = this.transitionProgress < 0.5
                ? this.transitionProgress * 2
                : (1 - this.transitionProgress) * 2;
            ctx.save();
            ctx.fillStyle = `rgba(10, 14, 23, ${alpha})`;
            ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.restore();
        }
    }

    handleKey(e) {
        if (this.transitioning) return;
        const h = this._handlers[this.currentState];
        if (h) h.onKey(e);
    }

    _executeTransition() {
        const oldH = this._handlers[this.currentState];
        if (oldH) oldH.exit();

        this.previousState = this.currentState;
        this.currentState = this.pendingState;
        const ctx = this.pendingContext;
        this.pendingState = null;
        this.pendingContext = null;

        const newH = this._handlers[this.currentState];
        if (newH) newH.enter(ctx);
    }
}
