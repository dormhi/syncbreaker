/* =========================================
   PacketPurgeMechanic.js — The gate between ACT I and ACT II

   Easy reaction game: packets stream across the field. Click/tap the
   infected (red) packets before they reach the right edge. Clean (blue)
   packets must be left alone.

   Difficulty AND duration are fully randomized, but bounded to keep it
   forgiving ("yapılması kolay olsun").
   ========================================= */

const _MechanicBasePP = (typeof Mechanic !== 'undefined') ? Mechanic : class {};

class PacketPurgeMechanic extends _MechanicBasePP {
    constructor(options = {}) {
        super();
        this.rng = options.rng || Math.random;
        this.resultDuration = 1.2;
    }

    _rand(min, max) { return min + this.rng() * (max - min); }

    init(context = {}) {
        this.active = true;
        this.result = null;
        this.time = 0;

        this.width = context.width || 960;
        this.height = context.height || 640;
        this.field = this._fieldFor(this.width, this.height);

        // Random but easy
        this.duration = this._rand(12, 18);
        this.speed = this._rand(85, 135);        // px/s
        this.spawnInterval = this._rand(0.9, 1.5); // s
        this.badRatio = this._rand(0.55, 0.7);

        this.health = 3;
        this.maxHealth = 3;
        this.packets = [];
        this.spawnTimer = 0;
        this.hits = 0;      // cleared bad packets
        this.mistakes = 0;  // clicked clean / missed bad

        this._nextId = 1;
    }

    _fieldFor(W, H) {
        return { x: W * 0.1, y: H * 0.24, w: W * 0.8, h: H * 0.5 };
    }

    update(dt) {
        if (this.result !== null) return;
        this.time += dt;

        // Spawn
        this.spawnTimer += dt;
        if (this.spawnTimer >= this.spawnInterval) {
            this.spawnTimer -= this.spawnInterval;
            this._spawn();
        }

        // Move + resolve
        const right = this.field.x + this.field.w;
        for (let i = this.packets.length - 1; i >= 0; i--) {
            const p = this.packets[i];
            p.x += this.speed * dt;
            if (p.x - p.w / 2 > right) {
                // Reached the core
                if (p.bad) { this.health--; this.mistakes++; }
                this.packets.splice(i, 1);
            }
        }

        if (this.health <= 0) {
            this.result = 'fail';
            return;
        }
        if (this.time >= this.duration) {
            this.result = 'success';
        }
    }

    _spawn() {
        const bad = this.rng() < this.badRatio;
        const w = 46, h = 30;
        const yMin = this.field.y + h / 2 + 4;
        const yMax = this.field.y + this.field.h - h / 2 - 4;
        this.packets.push({
            id: this._nextId++,
            x: this.field.x + w / 2,
            y: this._rand(yMin, yMax),
            w, h, bad,
            age: 0,
            dead: false
        });
    }

    handlePointer(x, y, phase) {
        if (this.result !== null) return false;
        if (phase && phase !== 'down') return false;
        for (const p of this.packets) {
            if (x >= p.x - p.w / 2 && x <= p.x + p.w / 2 &&
                y >= p.y - p.h / 2 && y <= p.y + p.h / 2) {
                if (p.bad) {
                    p.dead = true;
                    this.hits++;
                } else {
                    this.mistakes++;
                    this.health--;
                }
                // Remove the packet either way
                const idx = this.packets.indexOf(p);
                if (idx >= 0) this.packets.splice(idx, 1);
                if (this.health <= 0) this.result = 'fail';
                return true;
            }
        }
        return false;
    }

    handleKey(/* code */) { return false; }

    // ── Render ──

    render(ctx, W, H) {
        // Field
        const fx = this.field.x, fy = this.field.y;
        const fw = this.field.w, fh = this.field.h;

        ctx.save();
        ctx.strokeStyle = 'rgba(59,130,246,0.25)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 8]);
        Utils.roundRect(ctx, fx, fy, fw, fh, 8);
        ctx.stroke();
        ctx.setLineDash([]);

        // Core line on the right
        ctx.strokeStyle = 'rgba(239,68,68,0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(fx + fw, fy);
        ctx.lineTo(fx + fw, fy + fh);
        ctx.stroke();

        // Packets
        for (const p of this.packets) {
            ctx.save();
            const color = p.bad ? '#ef4444' : '#3b82f6';
            ctx.fillStyle = p.bad ? 'rgba(239,68,68,0.18)' : 'rgba(59,130,246,0.18)';
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            Utils.roundRect(ctx, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 6);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = color;
            ctx.font = '600 15px Rajdhani';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(p.bad ? '☠' : '◆', p.x, p.y + 1);
            ctx.restore();
        }

        ctx.restore();

        // HUD: health
        const hx = W / 2 - 60;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = '18px sans-serif';
        for (let i = 0; i < this.maxHealth; i++) {
            ctx.fillStyle = i < this.health ? '#ef4444' : 'rgba(239,68,68,0.2)';
            ctx.fillText('♥', hx + i * 26, H * 0.82);
        }
        ctx.fillStyle = '#64748b';
        ctx.font = '400 13px Rajdhani';
        ctx.textAlign = 'right';
        ctx.fillText(`Cleared: ${this.hits}`, W / 2 + 150, H * 0.82);

        // Time bar
        const barW = 300, barH = 5;
        const bx = W / 2 - barW / 2, by = H * 0.86;
        const frac = Math.max(0, 1 - this.time / this.duration);
        ctx.fillStyle = '#1e293b';
        Utils.roundRect(ctx, bx, by, barW, barH, 2); ctx.fill();
        ctx.fillStyle = '#f59e0b';
        Utils.roundRect(ctx, bx, by, barW * frac, barH, 2); ctx.fill();

        if (this.result !== null) {
            const ok = this.result === 'success';
            ctx.fillStyle = ok ? '#22c55e' : '#ef4444';
            ctx.font = '700 22px Orbitron';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(ok ? 'ACCESS GRANTED' : 'PURGE FAILED', W / 2, H * 0.18);
        }
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = PacketPurgeMechanic;
