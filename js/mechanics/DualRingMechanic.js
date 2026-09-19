/* =========================================
   DualRingMechanic.js — Energy Recovery (easter egg)

   Two rings with markers that leave the top target in opposite
   directions and reconverge once per cycle. Press / tap when BOTH
   markers are inside their target arcs.

   DIFFICULTY: speed scales with how EMPTY the energy is
   (lower energy → faster rings → harder), clamped to a playable range.

   REWARD: 1–3 energy based on how centered the press was.
   ========================================= */

const _MechanicBaseDR = (typeof Mechanic !== 'undefined') ? Mechanic : class {};

class DualRingMechanic extends _MechanicBaseDR {
    constructor(options = {}) {
        super();
        this.maxEnergy = options.maxEnergy || 6;
        this.currentEnergy = (options.currentEnergy !== undefined) ? options.currentEnergy : this.maxEnergy;

        this.time = 0;
        this.timeLimit = options.timeLimit || 20;
        this.resultDuration = 1.2;
        this.reward = 0;

        // Difficulty: 0 = full energy (easiest), 1 = empty (hardest)
        const t = Math.max(0, Math.min(1, (this.maxEnergy - this.currentEnergy) / this.maxEnergy));
        this.difficulty = t;

        // Playable clamped speed (deg/s)
        const speedMin = 100, speedMax = 205;
        this.speed = speedMin + t * (speedMax - speedMin);

        // Tolerance stays fair (deg half-width)
        const tolMax = 22, tolMin = 13;
        this.tolerance = tolMax - t * (tolMax - tolMin);

        this.targetAngle = 270; // top of the ring
        // Start markers away from the target so t=0 is not an instant win:
        // outer at the right, inner at the left; they converge at the top.
        this.outerBase = 0;
        this.innerBase = 180;
    }

    init() {
        this.active = true;
        this.result = null;
        this.reward = 0;
        this.time = 0;
    }

    update(dt) {
        if (!this.active || this.result !== null) return;
        this.time += dt;
        if (this.time >= this.timeLimit) {
            this.result = 'fail';
        }
    }

    outerAngleAt(t) { return (this.outerBase + this.speed * t) % 360; }
    innerAngleAt(t) { return (this.innerBase - this.speed * t + 7200) % 360; }

    /** press evaluation at a precise time; returns {success, quality, reward} */
    evaluate(t) {
        const dOuter = Collision.angleDistanceDeg(this.outerAngleAt(t), this.targetAngle) / this.tolerance;
        const dInner = Collision.angleDistanceDeg(this.innerAngleAt(t), this.targetAngle) / this.tolerance;
        const worst = Math.max(dOuter, dInner);
        if (worst > 1) return { success: false, quality: 0, reward: 0 };
        const quality = 1 - worst; // 0 boundary .. 1 dead center
        const reward = quality > 0.66 ? 3 : quality > 0.33 ? 2 : 1;
        return { success: true, quality, reward };
    }

    handleConfirm() {
        if (this.result !== null) return false;
        const r = this.evaluate(this.time);
        if (r.success) {
            this.result = 'success';
            this.reward = r.reward;
        } else {
            this.result = 'fail';
        }
        return true;
    }

    handleKey(code) {
        if (code === 'Space' || code === 'Enter') return this.handleConfirm();
        return false;
    }

    /** Tapping anywhere confirms (also makes desktop mouse clicks work). */
    handlePointer(/* x, y, phase */) {
        return this.handleConfirm();
    }

    // ── Render ──

    render(ctx, W, H) {
        const cx = W / 2;
        const cy = H / 2 + 10;
        const rOuter = 120;
        const rInner = 78;

        ctx.save();
        ctx.translate(cx, cy);

        // Rings
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, rOuter, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, rInner, 0, Math.PI * 2); ctx.stroke();

        // Target arcs (top) — glow when a marker is inside
        this._drawTargetArc(ctx, rOuter, this.tolerance, '#22c55e');
        this._drawTargetArc(ctx, rInner, this.tolerance, '#3b82f6');

        // Markers
        const oa = Utils.degToRad(this.outerAngleAt(this.time));
        const ia = Utils.degToRad(this.innerAngleAt(this.time));
        this._drawMarker(ctx, Math.cos(oa) * rOuter, Math.sin(oa) * rOuter, '#22c55e', 'O');
        this._drawMarker(ctx, Math.cos(ia) * rInner, Math.sin(ia) * rInner, '#3b82f6', 'I');

        // Center core
        ctx.fillStyle = '#0b1220';
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, 26, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#f59e0b';
        ctx.font = '700 20px Orbitron';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚡', 0, 1);

        ctx.restore();

        // Time bar
        const barW = 260, barH = 5;
        const bx = cx - barW / 2, by = cy + rOuter + 44;
        const frac = Math.max(0, 1 - this.time / this.timeLimit);
        ctx.fillStyle = '#1e293b';
        Utils.roundRect(ctx, bx, by, barW, barH, 2); ctx.fill();
        ctx.fillStyle = frac < 0.25 ? '#ef4444' : '#f59e0b';
        Utils.roundRect(ctx, bx, by, barW * frac, barH, 2); ctx.fill();

        if (this.result !== null) {
            const ok = this.result === 'success';
            ctx.fillStyle = ok ? '#22c55e' : '#ef4444';
            ctx.font = '700 22px Orbitron';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ok ? `+${this.reward} ENERGY` : 'RECOVERY FAILED', cx, cy - rOuter - 34);
        }
    }

    _drawTargetArc(ctx, radius, tolDeg, color) {
        const a0 = Utils.degToRad(this.targetAngle - tolDeg);
        const a1 = Utils.degToRad(this.targetAngle + tolDeg);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(0, 0, radius, a0, a1);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    _drawMarker(ctx, x, y, color, label) {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 12;
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#0b1220';
        ctx.font = '700 10px Rajdhani';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x, y + 1);
        ctx.restore();
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = DualRingMechanic;
