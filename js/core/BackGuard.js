/* =========================================
   BackGuard.js — Keep "back" inside the game

   Android's back button, iOS' edge swipe, the desktop back button and
   Safari's two-finger swipe all navigate the browser history. Without a
   guard they would leave the site mid-game.

   The guard keeps one extra history entry on top of the page. A back
   gesture pops it (a `popstate` event, no page load); `onBack()` then
   decides: true = handled inside the game (the guard is pushed again),
   false = really leave (we step back once more, off the site).

   Chrome skips history entries added without user interaction, so the
   guard is first pushed on the player's first tap / key press.
   ========================================= */

class BackGuard {
    /**
     * @param {Window} win
     * @param {() => boolean} onBack  true to stay, false to leave the page
     */
    constructor(win, onBack) {
        this.win = win;
        this.onBack = onBack;
        this.armed = false;
        this.leaving = false;
        this._onPop = () => this._handlePop();
        this._arm = () => this.arm();
        win.addEventListener('popstate', this._onPop);
        win.addEventListener('pointerdown', this._arm, true);
        win.addEventListener('keydown', this._arm, true);
    }

    /** Push the guard entry (once per back gesture). */
    arm() {
        if (this.armed || this.leaving) return;
        try {
            this.win.history.pushState({ sbGuard: true }, '');
            this.armed = true;
        } catch (e) { /* history unavailable (sandboxed iframe, file://) */ }
    }

    _handlePop() {
        if (this.leaving || !this.armed) return;
        // The guard entry was just popped.
        this.armed = false;
        let stay = true;
        try { stay = this.onBack() !== false; } catch (e) { stay = true; }
        if (stay) {
            this.arm();
        } else {
            this.leaving = true;
            this.win.history.back();
        }
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = BackGuard;
