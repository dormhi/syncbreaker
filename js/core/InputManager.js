/* =========================================
   InputManager.js — Unified Input Layer

   Goals:
   - one place for keyboard + pointer handling
   - ignore OS key auto-repeat (e.repeat) so holding Space can't spam hits
   - unify touch/pen (pointer events) without the old touchstart + synth
     click double-fire
   - keep desktop mouse semantics (hover + UI click) unchanged
   - prevent page scroll/zoom over the canvas

   Callbacks (provided by GameManager):
     hitTestUI(x, y)               -> boolean (UI consumed the press)
     onMove(x, y)
     onPress(pointerType, ts)      -> gameplay confirm (touch/pen only)
     onSwipe(direction, ts)        -> 'up' | 'down' | 'left' | 'right'
     onKey(action)                 -> { code, timestamp }
   ========================================= */

class InputManager {
    constructor(canvas, handlers) {
        this.canvas = canvas;
        this.handlers = handlers;
        this._touch = null;
        this._suppressClickUntil = 0;
        this._setup();
    }

    _coords(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (clientX - rect.left) * (this.canvas.width / rect.width),
            y: (clientY - rect.top) * (this.canvas.height / rect.height)
        };
    }

    _now(ts) {
        return (typeof ts === 'number' && ts > 0) ? ts : performance.now();
    }

    _setup() {
        const canvas = this.canvas;
        const H = this.handlers;

        // Kill scroll / pinch-zoom gestures over the game surface.
        canvas.style.touchAction = 'none';

        canvas.addEventListener('mousemove', (e) => {
            const { x, y } = this._coords(e.clientX, e.clientY);
            H.onMove(x, y);
        });

        // Desktop: UI-only click (gameplay confirm stays on the keyboard).
        canvas.addEventListener('click', (e) => {
            if (performance.now() < this._suppressClickUntil) return;
            const { x, y } = this._coords(e.clientX, e.clientY);
            H.hitTestUI(x, y);
        });

        // Touch / pen: pointer events unify tap + swipe, no synth click.
        canvas.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse') return;
            const { x, y } = this._coords(e.clientX, e.clientY);
            this._touch = {
                startX: e.clientX,
                startY: e.clientY,
                id: e.pointerId,
                ui: false
            };

            if (H.hitTestUI(x, y)) {
                this._touch.ui = true;
                e.preventDefault();
                return;
            }

            e.preventDefault();
            this._suppressClickUntil = performance.now() + 700;
            H.onPress(e.pointerType, this._now(e.timeStamp));
        }, { passive: false });

        canvas.addEventListener('pointerup', (e) => {
            if (e.pointerType === 'mouse' || !this._touch || this._touch.id !== e.pointerId) return;

            const t = this._touch;
            this._touch = null;
            if (t.ui) return;

            const dx = e.clientX - t.startX;
            const dy = e.clientY - t.startY;
            const threshold = 30;
            if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;

            e.preventDefault();
            let dir;
            if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left';
            else dir = dy > 0 ? 'down' : 'up';
            H.onSwipe(dir, this._now(e.timeStamp));
        }, { passive: false });

        canvas.addEventListener('pointercancel', () => { this._touch = null; });

        document.addEventListener('keydown', (e) => {
            const isGameKey = e.code === 'Space' ||
                e.code === 'ArrowUp' || e.code === 'ArrowDown' ||
                e.code === 'ArrowLeft' || e.code === 'ArrowRight';
            if (isGameKey) e.preventDefault();

            // Never treat OS auto-repeat as a fresh press.
            if (e.repeat) return;

            H.onKey({ code: e.code, key: e.key, timestamp: this._now(e.timeStamp) });
        });
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = InputManager;
