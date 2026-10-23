/* =========================================
   StateManager.js — Finite State Machine
   ========================================= */

class StateManager {
    constructor() {
        // Define the available application states
        this.STATES = {
            MENU: 'MENU',
            HUB: 'HUB',
            ACT: 'ACT',
            GUIDE: 'GUIDE',
            LEVEL: 'LEVEL',
            LOCKPICK: 'LOCKPICK',
            MINIGAME: 'MINIGAME',
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
        if (typeof Sound !== 'undefined' && Sound.playWhoosh) Sound.playWhoosh();
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

        if (this.transitioning) this._renderTransition(ctx);
    }

    /**
     * Screen change: shutters close in from alternating sides with a scan
     * line and a short glitch, then open on the new screen. With reduced
     * motion it is a plain fade.
     */
    _renderTransition(ctx) {
        const p = this.transitionProgress;
        const cover = p < 0.5 ? p * 2 : (1 - p) * 2;
        const W = VIEW.W, H = VIEW.H;
        ctx.save();
        if (typeof UITheme === 'undefined' || UITheme.reducedMotion) {
            ctx.fillStyle = `rgba(10, 14, 23, ${cover})`;
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
            return;
        }
        const bands = 8, bh = H / bands;
        ctx.fillStyle = '#0a0e17';
        for (let k = 0; k < bands; k++) {
            // Staggered bands: all closed exactly at the midpoint.
            const w = W * Utils.clamp(cover * 1.25 - (k % 3) * 0.08, 0, 1);
            if (k % 2) ctx.fillRect(W - w, k * bh, w, bh + 1);
            else ctx.fillRect(0, k * bh, w, bh + 1);
        }
        ctx.fillStyle = 'rgba(56,189,248,0.55)';
        ctx.fillRect(0, p * H, W, 2);
        UITheme.glitch(ctx, W, H, Math.sin(p * Math.PI) * 0.7, p * 3);
        ctx.restore();
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
