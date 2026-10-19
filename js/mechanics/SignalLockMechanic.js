/* =========================================
   SignalLockMechanic.js — Act 4 · RESET_CREDS

   An oscilloscope shows the target signal (amber, dashed) and the
   player's signal (blue). HOLD (Space / mouse / finger) to raise the
   player's frequency, RELEASE to let it fall — with a little inertia.
   While the two frequencies are within `tol`, the SYNC meter fills;
   a full meter locks one credential key and a new target appears.
   Lock `keys` keys before the timer runs out. No lives.

   Harder tiers: narrower tolerance, a draining meter, a drifting target
   and "glitches" (the target jumps; it flickers first as a warning).

   revive(): the recovery protocol adds `reviveTime` seconds and the same
   run continues (locked keys are kept).

   Motion is integrated in fixed steps (frame-rate independent); render
   interpolates the previous/current frequency with alpha.
   ========================================= */

const _MechanicBaseSL = (typeof Mechanic !== 'undefined') ? Mechanic : class {};

class SignalLockMechanic extends _MechanicBaseSL {
    constructor(options = {}) {
        super();
        this.rng = options.rng || Math.random;

        this.keys = options.keys || 3;
        this.timeLimit = options.timeLimit || 45;
        this.tol = options.tol || 0.3;                  // |f - target| to count as in sync
        this.syncTime = options.syncTime || 1.2;        // s of sync to lock a key
        this.drain = options.drain !== undefined ? options.drain : 0;  // meter loss per s out of sync (x fill rate)
        this.driftAmp = options.driftAmp || 0;          // target wobble (freq units)
        this.driftSpeed = options.driftSpeed || 0;      // rad/s
        this.glitchMin = options.glitchMin || 0;        // s between glitches (0 = none)
        this.glitchMax = options.glitchMax || 0;
        this.glitchWarn = 0.6;
        this.reviveTime = options.reviveTime || 20;

        // Player signal physics (same in every tier).
        this.fMin = 1;
        this.fMax = 5;
        this.accel = options.accel || 4.0;              // freq units / s^2 while held / released
        this.damping = options.damping || 3.0;          // 1/s
        this.resultDuration = 1.2;
        this.stepDt = 1 / 60;
        // Hold-to-play: the host routes key-up / pointer-up here and must not
        // turn the desktop click that follows a mouse hold into a new press.
        this.wantsHold = true;
    }

    _rand(min, max) { return min + this.rng() * (max - min); }

    init(context = {}) {
        this.active = true;
        this.result = null;
        this.width = context.width || 960;
        this.height = context.height || 640;
        this.scope = { x: 120, y: 120, w: 640, h: 300 };

        this.time = 0;
        this.timeLeft = this.timeLimit;
        this.locked = 0;
        this.sync = 0;
        this.score = 0;
        this.f = 1.6;
        this.fPrev = this.f;
        this.v = 0;
        this.holdKey = false;
        this.holdPointer = false;
        this.flash = 0;
        this.lockFlash = 0;
        this.base = 0;
        this._newTarget();
    }

    revive() {
        this.timeLeft += this.reviveTime;
        this.result = null;
        this.active = true;
        this.holdKey = false;
        this.holdPointer = false;
    }

    get holding() { return this.holdKey || this.holdPointer; }

    // ── Target ──

    _pickBase(awayFrom) {
        let b;
        let tries = 0;
        do {
            b = this._rand(1.6, 4.4);
            tries++;
        } while (awayFrom !== null && Math.abs(b - awayFrom) < 0.9 && tries < 20);
        return b;
    }

    _newTarget() {
        this.base = this._pickBase(this.locked > 0 ? this.target : null);
        this.phase = this.rng() * Math.PI * 2;
        this._scheduleGlitch();
    }

    _scheduleGlitch() {
        this.glitchAt = this.glitchMin > 0 ? this.time + this._rand(this.glitchMin, this.glitchMax) : Infinity;
    }

    targetAt(t) {
        const f = this.base + this.driftAmp * Math.sin(this.driftSpeed * t + this.phase);
        return Math.max(this.fMin + 0.2, Math.min(this.fMax - 0.2, f));
    }

    get target() { return this.targetAt(this.time); }

    /** True during the warning flicker before a glitch. */
    glitchWarning(t = this.time) {
        return isFinite(this.glitchAt) && t >= this.glitchAt - this.glitchWarn && t < this.glitchAt;
    }

    // ── Simulation ──

    update(dt) {
        if (!this.active) return;
        this.stepDt = dt || this.stepDt;
        const h = this.stepDt;
        if (this.flash > 0) this.flash -= h;
        if (this.lockFlash > 0) this.lockFlash -= h;
        if (this.result !== null) return;

        this.time += h;
        this.timeLeft = Math.max(0, this.timeLeft - h);

        // Player signal: hold pushes up, release pulls down, with damping.
        this.fPrev = this.f;
        this.v += (this.holding ? this.accel : -this.accel) * h;
        this.v *= Math.exp(-this.damping * h);
        this.f += this.v * h;
        if (this.f <= this.fMin) { this.f = this.fMin; if (this.v < 0) this.v = 0; }
        if (this.f >= this.fMax) { this.f = this.fMax; if (this.v > 0) this.v = 0; }

        // Glitch: the target jumps after a short flicker.
        if (this.time >= this.glitchAt) {
            this.base = this._pickBase(this.target);
            this.flash = 0.25;
            this._scheduleGlitch();
        }

        // Sync meter
        if (Math.abs(this.f - this.target) <= this.tol) {
            this.sync += h / this.syncTime;
        } else {
            this.sync = Math.max(0, this.sync - this.drain * h / this.syncTime);
        }

        if (this.sync >= 1) {
            this.locked++;
            this.sync = 0;
            this.lockFlash = 0.5;
            if (typeof Sound !== 'undefined' && Sound.playGood) Sound.playGood(SignalLockMechanic.SOUND);
            if (this.locked >= this.keys) {
                this.result = 'success';
                this.score = this.computeScore();
                return;
            }
            this._newTarget();
        }

        if (this.timeLeft <= 0) {
            this.result = 'fail';
            if (typeof Sound !== 'undefined' && Sound.playMiss) Sound.playMiss();
        }
    }

    computeScore() {
        return this.locked * 300 + Math.floor(this.timeLeft) * 20;
    }

    // ── Input (hold / release) ──

    handleKey(code) {
        if (code === 'Space') { this.holdKey = true; return true; }
        return false;
    }

    handleKeyUp(code) {
        if (code === 'Space') { this.holdKey = false; return true; }
        return false;
    }

    handlePointer(x, y, phase) {
        if (phase === 'up') { this.holdPointer = false; return true; }
        this.holdPointer = true;
        return true;
    }

    /** Drop every hold (window blur, pause prompt, pointer cancel). */
    releaseAll() {
        this.holdKey = false;
        this.holdPointer = false;
    }

    // ── Render ──

    render(ctx, W, H, gameTime, alpha = 1) {
        const a = Math.max(0, Math.min(1, alpha));
        const f = this.fPrev + (this.f - this.fPrev) * a;
        const t = this.time - this.stepDt * (1 - a);
        const target = this.targetAt(t);
        const S = this.scope;
        const mid = S.y + S.h / 2;
        const amp = S.h * 0.32;
        const cyan = '#22d3ee';
        const amber = '#f59e0b';
        const inSync = Math.abs(f - target) <= this.tol;

        ctx.save();

        // Scope frame + grid
        ctx.fillStyle = 'rgba(8,12,20,0.85)';
        ctx.strokeStyle = inSync ? 'rgba(34,211,238,0.6)' : 'rgba(71,85,105,0.6)';
        ctx.lineWidth = 1.5;
        Utils.roundRect(ctx, S.x, S.y, S.w, S.h, 10);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(71,85,105,0.18)';
        ctx.lineWidth = 1;
        for (let gx = 1; gx < 8; gx++) {
            ctx.beginPath(); ctx.moveTo(S.x + gx * S.w / 8, S.y); ctx.lineTo(S.x + gx * S.w / 8, S.y + S.h); ctx.stroke();
        }
        for (let gy = 1; gy < 4; gy++) {
            ctx.beginPath(); ctx.moveTo(S.x, S.y + gy * S.h / 4); ctx.lineTo(S.x + S.w, S.y + gy * S.h / 4); ctx.stroke();
        }

        // Both waves scroll with the same phase, so equal frequencies overlap.
        const scroll = t * 2.2;
        const wave = (freq, color, width, dashed, jitter) => {
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.setLineDash(dashed ? [8, 6] : []);
            ctx.beginPath();
            for (let i = 0; i <= 160; i++) {
                const u = i / 160;
                const x = S.x + u * S.w;
                const j = jitter ? Math.sin(i * 7.3 + t * 40) * jitter : 0;
                const y = mid - Math.sin((u * freq + scroll / (Math.PI * 2)) * Math.PI * 2) * amp + j;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.stroke();
            ctx.setLineDash([]);
        };
        const warn = this.glitchWarning(t);
        wave(target, warn ? '#fbbf24' : amber, 2, true, warn ? 6 : 0);
        ctx.shadowColor = cyan;
        ctx.shadowBlur = inSync ? 12 : 4;
        wave(f, cyan, 2.5, false, 0);
        ctx.shadowBlur = 0;

        // Frequency gauge (right of the scope): target band + your marker.
        const gx = S.x + S.w + 30, gy = S.y, gh = S.h;
        const yOf = (freq) => gy + gh - ((freq - this.fMin) / (this.fMax - this.fMin)) * gh;
        ctx.fillStyle = 'rgba(15,23,42,0.9)';
        Utils.roundRect(ctx, gx - 8, gy, 16, gh, 8);
        ctx.fill();
        ctx.fillStyle = inSync ? 'rgba(34,211,238,0.35)' : 'rgba(245,158,11,0.3)';
        const bandTop = yOf(Math.min(this.fMax, target + this.tol));
        const bandBot = yOf(Math.max(this.fMin, target - this.tol));
        ctx.fillRect(gx - 8, bandTop, 16, bandBot - bandTop);
        ctx.fillStyle = cyan;
        ctx.beginPath();
        ctx.moveTo(gx - 14, yOf(f));
        ctx.lineTo(gx - 4, yOf(f) - 6);
        ctx.lineTo(gx - 4, yOf(f) + 6);
        ctx.closePath();
        ctx.fill();

        ctx.restore();

        if (this.flash > 0) {
            ctx.save();
            ctx.globalAlpha = Math.min(1, this.flash / 0.25) * 0.12;
            ctx.fillStyle = amber;
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        }

        this._renderHud(ctx, W, H, inSync);
    }

    /** Small vector key (no emoji: the game fonts lack key glyphs). */
    _drawKeyIcon(ctx, x, y, color) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.arc(x - 4, y, 3.2, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - 0.8, y); ctx.lineTo(x + 6, y);
        ctx.moveTo(x + 3.5, y); ctx.lineTo(x + 3.5, y + 3);
        ctx.moveTo(x + 6, y); ctx.lineTo(x + 6, y + 3.5);
        ctx.stroke();
        ctx.restore();
    }

    _renderHud(ctx, W, H, inSync) {
        const S = this.scope;
        ctx.save();
        ctx.textBaseline = 'middle';

        // SYNC meter under the scope
        const bw = S.w, bh = 10, bx = S.x, by = S.y + S.h + 22;
        ctx.fillStyle = '#1e293b';
        Utils.roundRect(ctx, bx, by, bw, bh, 4); ctx.fill();
        ctx.fillStyle = this.lockFlash > 0 ? '#22c55e' : (inSync ? '#22d3ee' : 'rgba(34,211,238,0.5)');
        Utils.roundRect(ctx, bx, by, bw * Math.min(1, this.sync), bh, 4); ctx.fill();
        ctx.fillStyle = '#94a3b8';
        ctx.font = '700 13px Orbitron';
        ctx.textAlign = 'left';
        ctx.fillText(inSync ? 'SYNCING' : 'SYNC', bx, by - 12);

        // Keys + timer
        const y = H - 40;
        for (let i = 0; i < this.keys; i++) {
            const done = i < this.locked;
            ctx.strokeStyle = done ? '#22c55e' : '#475569';
            ctx.fillStyle = done ? 'rgba(34,197,94,0.3)' : 'rgba(15,23,42,0.6)';
            ctx.lineWidth = 1.5;
            Utils.roundRect(ctx, W / 2 - 200 + i * 34, y - 11, 26, 22, 4);
            ctx.fill();
            ctx.stroke();
            this._drawKeyIcon(ctx, W / 2 - 187 + i * 34, y, done ? '#22c55e' : '#64748b');
        }

        const low = this.timeLeft < 10;
        ctx.fillStyle = low ? '#ef4444' : '#94a3b8';
        ctx.font = '700 20px Rajdhani';
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.ceil(this.timeLeft)}s · KEYS ${this.locked}/${this.keys}`, W / 2 + 250, y);

        if (this.result !== null) {
            const ok = this.result === 'success';
            ctx.fillStyle = ok ? '#22c55e' : '#ef4444';
            ctx.font = '700 28px Orbitron';
            ctx.textAlign = 'center';
            ctx.fillText(ok ? 'CREDENTIALS RESET' : 'SIGNAL LOST', S.x + S.w / 2, S.y + S.h / 2);
            if (ok) {
                ctx.fillStyle = '#94a3b8';
                ctx.font = '600 20px Rajdhani';
                ctx.fillText(`SCORE ${this.score}`, S.x + S.w / 2, S.y + S.h / 2 + 34);
            }
        }
        ctx.restore();
    }
}

// Lock "chime" voice for Sound.playGood(theme).
SignalLockMechanic.SOUND = { soundFreq: 660, soundType: 'sine' };

if (typeof module !== 'undefined' && module.exports) module.exports = SignalLockMechanic;
