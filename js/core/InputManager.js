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
     onKeyUp(action)               -> { code }       (hold-to-play games)
     onMouseDown(x, y)             -> mouse press on the canvas (hold start)
     onPointerUp()                 -> any mouse / touch release (hold end)
     onBlur()                      -> window lost focus: drop every hold
     onWheel(delta)                -> wheel / trackpad scroll (act map)
   ========================================= */

class InputManager {
    constructor(canvas, handlers) {
        this.canvas = canvas;
        this.handlers = handlers;
        this._touch = null;
        this._suppressClickUntil = 0;
        // 'touch' | 'desktop' — last kind of input used (drives on-screen hints).
        this.mode = InputManager.detectMode();
        this._setup();
    }

    static detectMode() {
        try {
            if (typeof window !== 'undefined' && window.matchMedia &&
                window.matchMedia('(pointer: coarse)').matches) return 'touch';
        } catch (e) { }
        return 'desktop';
    }

    _coords(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (clientX - rect.left) * (VIEW.W / rect.width),
            y: (clientY - rect.top) * (VIEW.H / rect.height)
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

        canvas.addEventListener('wheel', (e) => {
            if (!H.onWheel) return;
            e.preventDefault();
            const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
            H.onWheel(d);
        }, { passive: false });

        canvas.addEventListener('mousemove', (e) => {
            const { x, y } = this._coords(e.clientX, e.clientY);
            H.onMove(x, y);
        });

        // Desktop: UI-only click (gameplay confirm stays on the keyboard).
        canvas.addEventListener('click', (e) => {
            if (performance.now() < this._suppressClickUntil) return;
            const { x, y } = this._coords(e.clientX, e.clientY);
            H.hitTestUI(x, y, 'click');
        });

        // Touch / pen: pointer events unify tap + swipe, no synth click.
        canvas.addEventListener('pointerdown', (e) => {
            this.mode = e.pointerType === 'mouse' ? 'desktop' : 'touch';
            if (e.pointerType === 'mouse') {
                if (e.button === 0 && H.onMouseDown) {
                    const p = this._coords(e.clientX, e.clientY);
                    H.onMouseDown(p.x, p.y);
                }
                return;
            }
            const { x, y } = this._coords(e.clientX, e.clientY);
            this._touch = {
                startX: e.clientX,
                startY: e.clientY,
                id: e.pointerId,
                ui: false,
                drag: false
            };

            // The host may claim this touch as a drag (e.g. the HUB carousel).
            // Then UI taps are resolved on release, if the finger barely moved.
            if (H.onDragStart && H.onDragStart(x, y)) {
                this._touch.drag = true;
                e.preventDefault();
                return;
            }

            if (H.hitTestUI(x, y, 'touch')) {
                this._touch.ui = true;
                e.preventDefault();
                return;
            }

            e.preventDefault();
            this._suppressClickUntil = performance.now() + 700;
            H.onPress(e.pointerType, this._now(e.timeStamp));
        }, { passive: false });

        // Any release ends a hold. Mouse releases are caught on the window so
        // letting go outside the canvas cannot leave a hold stuck on.
        if (typeof window !== 'undefined' && window.addEventListener) {
            window.addEventListener('pointerup', (e) => {
                if (e.pointerType === 'mouse' && H.onPointerUp) H.onPointerUp();
            });
            window.addEventListener('blur', () => { if (H.onBlur) H.onBlur(); });
        }

        canvas.addEventListener('pointermove', (e) => {
            const t = this._touch;
            if (!t || !t.drag || t.id !== e.pointerId || !H.onDragMove) return;
            const { x, y } = this._coords(e.clientX, e.clientY);
            H.onDragMove(x, y);
        });

        canvas.addEventListener('pointerup', (e) => {
            if (e.pointerType !== 'mouse' && H.onPointerUp) H.onPointerUp();
            if (e.pointerType === 'mouse' || !this._touch || this._touch.id !== e.pointerId) return;

            const t = this._touch;
            this._touch = null;
            if (t.ui) return;

            const dx = e.clientX - t.startX;
            const dy = e.clientY - t.startY;
            if (t.drag) {
                // Under ~10 CSS px of travel the drag was really a tap.
                e.preventDefault();
                const { x, y } = this._coords(e.clientX, e.clientY);
                H.onDragEnd(x, y, Math.abs(dx) < 10 && Math.abs(dy) < 10);
                return;
            }
            const threshold = 30;
            if (Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;

            e.preventDefault();
            let dir;
            if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left';
            else dir = dy > 0 ? 'down' : 'up';
            H.onSwipe(dir, this._now(e.timeStamp));
        }, { passive: false });

        canvas.addEventListener('pointercancel', () => {
            if (this._touch && this._touch.drag && H.onDragEnd) H.onDragEnd(0, 0, false);
            this._touch = null;
            if (H.onPointerUp) H.onPointerUp();
        });

        document.addEventListener('keyup', (e) => {
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
            if (H.onKeyUp) H.onKeyUp({ code: e.code });
        });

        document.addEventListener('keydown', (e) => {
            // Typing in a form field (operator profile) is not gameplay.
            const t = e.target;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
            this.mode = 'desktop';
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
