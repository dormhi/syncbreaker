/* =========================================
   Coach.js — Guided lessons for games that teach themselves

   A queue of steps shown as a bubble over a dimmed scene; the parts a
   step talks about stay bright and outlined.
   - kind 'info': waits for a tap / click / SPACE / ENTER. The game should
     freeze meanwhile.
   - any other kind ('hit', 'drop', …): waits for that move. The game runs
     (usually with its timer held) and calls event(kind) when the player
     makes it.
   A step with a `key` marks that key seen in the store when it is passed,
   so lessons and one-time tips show once (localStorage sb_coach_<game>).

   Text may be a plain string or { desktop, touch }; Coach.inputMode()
   picks the variant (the host points it at InputManager.mode).

   Used by Acts 1-5. Acts 6-8 have their own lesson code from before.
   ========================================= */

class Coach {
    constructor(store) {
        this.store = store || null;
        this.queue = [];
        this.step = null;
        this.time = 0;
    }

    push(...steps) {
        this.queue.push(...steps);
        if (!this.step) this.next();
        return this;
    }

    next() {
        if (this.step && this.step.key && this.store) this.store.mark(this.step.key);
        this.step = this.queue.shift() || null;
    }

    get active() { return !!this.step; }

    /** An info bubble is up: the game waits for a tap. */
    get blocks() { return !!this.step && this.step.kind === 'info'; }

    /** The player made a move; passes the step that waits for it. */
    event(kind) {
        if (!this.step || this.step.kind !== kind) return false;
        this.next();
        return true;
    }

    seen(key) { return !!(this.store && this.store.seen(key)); }

    update(dt) { this.time += dt || 0; }

    /** The step text for this input mode, in the player's language (I18n). */
    static text(t) {
        const s = (!t || typeof t === 'string') ? (t || '')
            : (Coach.inputMode() === 'touch' ? t.touch : t.desktop) || t.desktop || t.touch || '';
        return typeof I18n !== 'undefined' ? I18n.t(s) : s;
    }

    /**
     * Draw the bubble. `rects` = what the step points at (kept bright);
     * opts.at = 'top' | 'bottom', opts.width, opts.cx.
     */
    render(ctx, W, H, rects = [], opts = {}) {
        const c = this.step;
        if (!c) return;
        const info = c.kind === 'info';
        ctx.save();
        ctx.fillStyle = info ? 'rgba(5,8,16,0.62)' : 'rgba(5,8,16,0.35)';
        ctx.beginPath();
        ctx.rect(0, 0, W, H);
        for (const r of rects) ctx.rect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
        ctx.fill('evenodd');
        const glow = 0.6 + 0.4 * Math.sin(this.time * 6);
        ctx.strokeStyle = `rgba(250,204,21,${glow})`;
        ctx.lineWidth = 3;
        for (const r of rects) ctx.strokeRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);

        const bw = opts.width || 600;
        ctx.font = '600 18px Rajdhani';
        const lines = [];
        let line = '';
        for (const w of Coach.text(c.text).split(' ')) {
            const t = line ? line + ' ' + w : w;
            const m = ctx.measureText(t).width;
            if ((typeof m === 'number' ? m : t.length * 8) > bw - 36 && line) { lines.push(line); line = w; } else line = t;
        }
        if (line) lines.push(line);
        const bh = 22 + lines.length * 23 + (info ? 24 : 4);
        const bx = (opts.cx !== undefined ? opts.cx : W / 2) - bw / 2;
        const by = opts.at === 'bottom' ? H - bh - 6 : 6;
        UITheme.panel(ctx, bx, by, bw, bh, { chamfer: 12, stroke: '#facc15', lineWidth: 1.6, fill: 'rgba(15,23,42,0.97)', glow: '#facc15' });
        ctx.fillStyle = '#e2e8f0';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        lines.forEach((l, k) => ctx.fillText(l, bx + 18, by + 22 + k * 23));
        ctx.fillStyle = '#facc15';
        ctx.font = '700 14px Rajdhani';
        ctx.textAlign = 'right';
        if (info) ctx.fillText(Coach.text(Coach.inputMode() === 'touch' ? 'TAP TO CONTINUE ▸' : 'CLICK OR SPACE ▸'), bx + bw - 16, by + bh - 14);
        ctx.restore();
    }
}

// The host points this at its input mode ('desktop' | 'touch').
Coach.inputMode = () => 'desktop';

if (typeof module !== 'undefined' && module.exports) module.exports = Coach;
