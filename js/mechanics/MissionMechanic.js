/* =========================================
   MissionMechanic.js — Act 10 · RETURN_CONTROL (shared mission frame)

   Act 10 is not a test: six short missions teach real-life security
   habits while the clean system is handed back to its owner. A mission
   cannot be failed, has no timer and always earns 3 stars.

   A mission (subclass, js/mechanics/HandoverMissions.js) provides:
     start()          set up its first phase
     buttons()        the tappable controls right now:
                      [{ id, x, y, w, h, label, sub, tone, disabled, onTap }]
                      tone: 'primary' | 'safe' | 'danger' | 'neutral'
     drawScene(ctx)   everything else it draws
   and uses:
     this.task        the line telling the player what to do now
     this.teach(...)  event / teaching cards (Coach info bubbles)
     this.tell(text, good)  short feedback under the scene
     this.finish(remember)  three "REMEMBER" points, then MISSION COMPLETE

   A wrong choice is never punished: the mission explains why and lets
   the player try again. Buttons work with taps, clicks and the keyboard
   (Tab / arrows move the focus, SPACE / ENTER press).
   ========================================= */

const _MechanicBaseMS = (typeof Mechanic !== 'undefined') ? Mechanic : class {};

class MissionMechanic extends _MechanicBaseMS {
    constructor(options = {}) {
        super();
        this.rng = options.rng || Math.random;
        this.options = options;
        this.resultDuration = 1.6;
        this.stepDt = 1 / 60;
    }

    _int(n) { return Math.floor(this.rng() * n); }
    _shuffle(list) {
        for (let i = list.length - 1; i > 0; i--) {
            const j = this._int(i + 1);
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
    }

    init(context = {}) {
        this.active = true;
        this.result = null;
        this.width = context.width || 960;
        this.height = context.height || 640;
        this.time = 0;
        this.score = 0;
        this.task = '';
        this.feedback = null;      // { text, good, t }
        this.focus = -1;           // keyboard focus in buttons()
        this.remember = null;      // the closing card's points
        this.coach = typeof Coach !== 'undefined' ? new Coach(null) : null;
        this.start();
    }

    // ── For missions ──

    start() {}
    buttons() { return []; }
    drawScene() {}
    tick() {}

    /** Teaching / event cards: each one waits for a tap. */
    teach(...texts) {
        if (!this.coach) return;
        this.coach.push(...texts.map(t => (typeof t === 'string' || !t.kind) ? { kind: 'info', text: t } : t));
    }

    tell(text, good = true, t = 3.2) {
        this.feedback = { text, good, t };
        if (typeof Sound !== 'undefined') {
            if (good && Sound.playGood) Sound.playGood(MissionMechanic.SOUND);
            if (!good && Sound.playMiss) Sound.playMiss();
        }
    }

    /** All steps done: show the REMEMBER card; its button completes the mission. */
    finish(points) {
        this.remember = points;
        this.task = '';
        if (typeof Sound !== 'undefined' && Sound.playStamp) Sound.playStamp();
    }

    get busy() { return this.result !== null || (this.coach && this.coach.active); }

    // ── Shared layout ──

    area() { return { x: 30, y: 104, w: 900, h: 470 }; }

    rememberButton() { return { id: 'complete', x: 330, y: 470, w: 300, h: 56, label: 'MISSION COMPLETE ▸', tone: 'safe' }; }

    _controls() {
        if (this.remember) return [Object.assign(this.rememberButton(), { onTap: () => this._complete() })];
        return this.buttons().filter(b => b && !b.disabled);
    }

    _complete() {
        if (this.result !== null) return;
        this.result = 'success';
        this.score = this.computeScore();
    }

    computeScore() { return 1000; }

    /** Every mission earns 3 stars (CAMPAIGN.starRules.handover). */
    starStats() { return { done: true }; }

    update(dt) {
        if (!this.active) return;
        this.stepDt = dt || this.stepDt;
        const h = this.stepDt;
        this.time += h;
        if (this.coach) this.coach.update(h);
        if (this.feedback) { this.feedback.t -= h; if (this.feedback.t <= 0) this.feedback = null; }
        if (this.result === null && !(this.coach && this.coach.blocks)) this.tick(h);
    }

    // ── Input ──

    handlePointer(x, y, phase) {
        if (phase && phase !== 'down') return false;
        if (this.result !== null) return false;
        if (this.coach && this.coach.blocks) { this.coach.next(); return true; }
        const list = this._controls();
        const hit = list.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
        if (hit) {
            this.focus = -1;
            if (typeof Sound !== 'undefined' && Sound.playClick) Sound.playClick();
            hit.onTap();
        }
        return true;
    }

    handleKey(code) {
        if (this.result !== null) return false;
        if (this.coach && this.coach.blocks) {
            if (code === 'Space' || code === 'Enter') this.coach.next();
            return true;
        }
        const list = this._controls();
        if (!list.length) return false;
        const step = { Tab: 1, ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[code];
        if (step) {
            this.focus = this.focus < 0 ? 0 : (this.focus + step + list.length) % list.length;
            return true;
        }
        if (code === 'Space' || code === 'Enter') {
            const b = list[Math.max(0, Math.min(this.focus, list.length - 1))];
            if (this.focus < 0) { this.focus = 0; return true; }
            if (b) b.onTap();
            return true;
        }
        return false;
    }

    // ── Render ──

    render(ctx, W, H) {
        ctx.save();
        if (this.task && !this.remember) {
            ctx.fillStyle = '#5eead4';
            ctx.font = '700 15px Orbitron, OrbitronTR';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`TASK · ${MissionMechanic.text(this.task)}`, W / 2, 90, W - 80);
        }
        this.drawScene(ctx, W, H);
        const list = this._controls();
        if (!this.remember) list.forEach((b, i) => this.drawButton(ctx, b, i === this.focus));
        if (this.feedback) {
            ctx.globalAlpha = Math.min(1, this.feedback.t / 0.4);
            ctx.fillStyle = this.feedback.good ? '#4ade80' : '#fca5a5';
            ctx.font = '700 17px Rajdhani';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.feedback.text, W / 2, 592, W - 80);
            ctx.globalAlpha = 1;
        }
        if (this.remember) this._drawRemember(ctx, W, H, list[0]);
        if (this.result === 'success') {
            ctx.fillStyle = 'rgba(5,8,16,0.6)';
            ctx.fillRect(0, 0, W, H);
            ctx.fillStyle = '#2dd4bf';
            ctx.font = '900 30px Orbitron, OrbitronTR';
            ctx.textAlign = 'center';
            ctx.fillText('MISSION COMPLETE', W / 2, H / 2 - 90);
        }
        ctx.restore();
        if (this.coach && this.coach.active) this.coach.render(ctx, W, H, this.coachRects ? this.coachRects(this.coach.step) : [], { at: 'top', width: 680 });
    }

    static text(t) {
        if (typeof Coach !== 'undefined') return Coach.text(t);
        return typeof t === 'string' ? t : (t && t.desktop) || '';
    }

    drawButton(ctx, b, focused) {
        const tones = {
            primary: ['rgba(45,212,191,0.18)', '#2dd4bf'],
            safe: ['rgba(34,197,94,0.18)', '#22c55e'],
            danger: ['rgba(239,68,68,0.16)', '#ef4444'],
            neutral: ['rgba(15,23,42,0.9)', 'rgba(148,163,184,0.7)']
        };
        const [fill, stroke] = tones[b.tone || 'neutral'] || tones.neutral;
        UITheme.panel(ctx, b.x, b.y, b.w, b.h, { chamfer: 8, fill, stroke, lineWidth: focused ? 3 : 1.6, glow: focused ? '#facc15' : null });
        ctx.fillStyle = '#f1f5f9';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `700 ${b.small ? 13 : 15}px Orbitron, OrbitronTR`;
        ctx.fillText(MissionMechanic.text(b.label), b.x + b.w / 2, b.y + b.h / 2 - (b.sub ? 8 : 0) + 1, b.w - 12);
        if (b.sub) {
            ctx.fillStyle = '#94a3b8';
            ctx.font = '600 13px Rajdhani';
            ctx.fillText(MissionMechanic.text(b.sub), b.x + b.w / 2, b.y + b.h / 2 + 12, b.w - 12);
        }
        if (focused) {
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 4]);
            ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
            ctx.setLineDash([]);
        }
    }

    /** Wrapped text from (x, y); returns the y after the last line. */
    wrap(ctx, text, x, y, w, lh) {
        let line = '';
        for (const word of MissionMechanic.text(text).split(' ')) {
            const t = line ? line + ' ' + word : word;
            const m = ctx.measureText(t).width;
            if ((typeof m === 'number' ? m : t.length * 8) > w && line) { ctx.fillText(line, x, y); y += lh; line = word; } else line = t;
        }
        if (line) ctx.fillText(line, x, y);
        return y + lh;
    }

    _drawRemember(ctx, W, H, button) {
        ctx.fillStyle = 'rgba(5,8,16,0.72)';
        ctx.fillRect(0, 0, W, H);
        const x = 170, y = 120, w = 620, h = 420;
        UITheme.panel(ctx, x, y, w, h, { chamfer: 16, fill: 'rgba(10,20,26,0.97)', stroke: '#2dd4bf', lineWidth: 2, glow: '#2dd4bf' });
        ctx.fillStyle = '#2dd4bf';
        ctx.font = '800 22px Orbitron, OrbitronTR';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('REMEMBER', W / 2, y + 40);
        ctx.textAlign = 'left';
        let ty = y + 92;
        this.remember.forEach((p, i) => {
            ctx.fillStyle = '#2dd4bf';
            ctx.font = '800 20px Orbitron, OrbitronTR';
            ctx.fillText(String(i + 1), x + 34, ty);
            ctx.fillStyle = '#e2e8f0';
            ctx.font = '600 19px Rajdhani';
            ty = this.wrap(ctx, p, x + 66, ty, w - 100, 24) + 14;
        });
        if (button) this.drawButton(ctx, button, this.focus === 0);
    }
}

MissionMechanic.SOUND = { soundFreq: 700, soundType: 'triangle' };

if (typeof module !== 'undefined' && module.exports) module.exports = MissionMechanic;
