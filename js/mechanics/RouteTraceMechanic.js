/* =========================================
   RouteTraceMechanic.js — Act 5 · TRACE_LOGS

   A grid of network tiles (straight / corner / tee pieces). Rotate tiles
   to build an unbroken line from YOUR node (left edge) to the ATTACKER's
   node (right edge). Every tile connected to your node lights up, so the
   player always sees how far the trace reaches. A completed line is one
   trace; a fresh, scrambled grid follows. Trace `traces` routes before
   the timer runs out. No lives.

   Every puzzle is solvable by construction: a random self-avoiding path
   is carved first, its tiles are given the right pieces, decoys fill the
   rest, then every free tile is rotated at random.

   Harder tiers: bigger grids, longer winding paths, locked tiles (fixed
   rotation) and "scrambles" — a few tiles flicker, then rotate by
   themselves.

   Controls: tap / click a tile to rotate it clockwise; or move the cursor
   with arrows / WASD and rotate with SPACE / ENTER.

   revive(): the recovery protocol adds `reviveTime` seconds; the same run
   (and the same grid) continues.
   ========================================= */

const _MechanicBaseRT = (typeof Mechanic !== 'undefined') ? Mechanic : class {};

// Direction bits: N=1, E=2, S=4, W=8.
const RT_DX = [0, 1, 0, -1];
const RT_DY = [-1, 0, 1, 0];
const RT_BASE = { empty: 0, straight: 5, corner: 3, tee: 7 };

class RouteTraceMechanic extends _MechanicBaseRT {
    constructor(options = {}) {
        super();
        this.rng = options.rng || Math.random;

        this.size = options.size || 4;                  // grid is size x size
        this.traces = options.traces || 2;
        this.timeLimit = options.timeLimit || 60;
        this.minPath = options.minPath || this.size;    // shortest acceptable route
        this.maxPath = options.maxPath || this.size * this.size; // longest acceptable route
        this.decoyRate = options.decoyRate !== undefined ? options.decoyRate : 0.6;
        this.teeRate = options.teeRate !== undefined ? options.teeRate : 0.2;
        this.lockRate = options.lockRate || 0;          // share of tiles that cannot rotate
        this.scrambleMin = options.scrambleMin || 0;    // s between scrambles (0 = none)
        this.scrambleMax = options.scrambleMax || 0;
        this.scrambleCount = options.scrambleCount || 2;
        this.scrambleWarn = 0.7;
        this.reviveTime = options.reviveTime || 20;
        this.solvedPause = 0.7;                          // s to enjoy a solved trace

        this.resultDuration = 1.2;
        this.stepDt = 1 / 60;
    }

    _rand(min, max) { return min + this.rng() * (max - min); }
    _int(n) { return Math.floor(this.rng() * n); }

    static rotate(mask, times) {
        let m = mask;
        for (let i = 0; i < ((times % 4) + 4) % 4; i++) m = ((m << 1) | (m >> 3)) & 15;
        return m;
    }

    init(context = {}) {
        this.active = true;
        this.result = null;
        this.width = context.width || 960;
        this.height = context.height || 640;

        this.time = 0;
        this.timeLeft = this.timeLimit;
        this.solved = 0;
        this.score = 0;
        this.pause = 0;
        this.flash = 0;
        this.cursor = { x: 0, y: 0 };
        this._newPuzzle();
    }

    revive() {
        this.timeLeft += this.reviveTime;
        this.result = null;
        this.active = true;
    }

    // ── Puzzle generation ──

    _newPuzzle() {
        const n = this.size;
        let path = null;
        for (let tries = 0; tries < 300 && !path; tries++) {
            const p = this._carvePath(this._int(n), this._int(n));
            if (p && p.length >= this.minPath && p.length <= this.maxPath) path = p;
        }
        if (!path) path = this._carvePath(this._int(n), this._int(n), true);

        this.srcRow = path[0].y;
        this.dstRow = path[path.length - 1].y;
        this.solution = path;

        // Tiles: path pieces first, decoys elsewhere.
        const grid = [];
        for (let y = 0; y < n; y++) {
            grid.push([]);
            for (let x = 0; x < n; x++) grid[y].push({ type: 'empty', rot: 0, locked: false, onPath: false, need: 0 });
        }
        path.forEach((c, k) => {
            const inSide = k === 0 ? 3 : this._dirTo(c, path[k - 1]);
            const outSide = k === path.length - 1 ? 1 : this._dirTo(c, path[k + 1]);
            const need = (1 << inSide) | (1 << outSide);
            const t = grid[c.y][c.x];
            t.type = (need === 5 || need === 10) ? 'straight' : 'corner';
            t.need = need;
            t.onPath = true;
            t.rot = this._rotFor(t.type, need);
        });
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const t = grid[y][x];
                if (t.onPath || this.rng() >= this.decoyRate) continue;
                t.type = this.rng() < this.teeRate ? 'tee' : (this.rng() < 0.5 ? 'straight' : 'corner');
                t.rot = this._int(4);
            }
        }
        // Locks: some path tiles frozen in the RIGHT rotation (a foothold),
        // some decoys frozen as obstacles.
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const t = grid[y][x];
                if (t.type !== 'empty' && this.rng() < this.lockRate) t.locked = true;
            }
        }
        // Scramble every free tile.
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const t = grid[y][x];
                if (!t.locked && t.type !== 'empty') t.rot = this._int(4);
            }
        }
        this.grid = grid;
        this._ensureUnsolved();
        this.lit = this._reach().lit;
        this.cursor = { x: 0, y: this.srcRow };
        this._scheduleScramble();
    }

    /** Never hand out a grid that is already solved: break the route once. */
    _ensureUnsolved() {
        if (!this._reach().solved) return;
        const route = this.solution.map(c => this.grid[c.y][c.x]);
        const t = route.find(x => !x.locked && x.type === 'corner') || route.find(x => !x.locked) || route[0];
        t.locked = false;
        for (let k = 0; k < 3 && this._reach().solved; k++) t.rot = (t.rot + 1) % 4;
    }

    /** Randomised self-avoiding walk from (0, sr) to any cell on the right edge. */
    _carvePath(sr, tr, anyEnd) {
        const n = this.size;
        const seen = new Set();
        const path = [];
        const key = (x, y) => y * n + x;
        const budget = { steps: 4000 };
        const walk = (x, y) => {
            if (budget.steps-- <= 0) return false;
            path.push({ x, y });
            seen.add(key(x, y));
            if (x === n - 1 && (anyEnd || y === tr) && path.length >= (anyEnd ? 1 : this.minPath)) return true;
            if (!anyEnd && path.length >= this.maxPath) { path.pop(); seen.delete(key(x, y)); return false; }
            const order = [0, 1, 2, 3].sort(() => this.rng() - 0.5);
            for (const d of order) {
                const nx = x + RT_DX[d], ny = y + RT_DY[d];
                if (nx < 0 || ny < 0 || nx >= n || ny >= n || seen.has(key(nx, ny))) continue;
                if (walk(nx, ny)) return true;
            }
            path.pop();
            seen.delete(key(x, y));
            return false;
        };
        return walk(0, sr) ? path.slice() : null;
    }

    _dirTo(a, b) {
        for (let d = 0; d < 4; d++) if (a.x + RT_DX[d] === b.x && a.y + RT_DY[d] === b.y) return d;
        return 0;
    }

    _rotFor(type, need) {
        for (let r = 0; r < 4; r++) {
            if ((RouteTraceMechanic.rotate(RT_BASE[type], r) & need) === need) return r;
        }
        return 0;
    }

    mask(x, y) {
        const t = this.grid[y][x];
        return RouteTraceMechanic.rotate(RT_BASE[t.type], t.rot);
    }

    /** Flood from your node; solved when the attacker's node is reached. */
    _reach() {
        const n = this.size;
        const lit = new Set();
        if (!(this.mask(0, this.srcRow) & 8)) return { lit, solved: false };
        const stack = [[0, this.srcRow]];
        lit.add(this.srcRow * n);
        while (stack.length) {
            const [x, y] = stack.pop();
            const m = this.mask(x, y);
            for (let d = 0; d < 4; d++) {
                if (!(m & (1 << d))) continue;
                const nx = x + RT_DX[d], ny = y + RT_DY[d];
                if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
                const k = ny * n + nx;
                if (lit.has(k) || !(this.mask(nx, ny) & (1 << ((d + 2) % 4)))) continue;
                lit.add(k);
                stack.push([nx, ny]);
            }
        }
        const end = this.dstRow * n + (n - 1);
        return { lit, solved: lit.has(end) && !!(this.mask(n - 1, this.dstRow) & 2) };
    }

    /** Minimum clockwise turns to solve along the carved route (balance tool). */
    requiredTurns() {
        let total = 0;
        for (const c of this.solution) {
            const t = this.grid[c.y][c.x];
            if (t.locked) continue;
            for (let k = 0; k < 4; k++) {
                if ((RouteTraceMechanic.rotate(RT_BASE[t.type], t.rot + k) & t.need) === t.need) { total += k; break; }
            }
        }
        return total;
    }

    _scheduleScramble() {
        this.scrambleAt = this.scrambleMin > 0 ? this.time + this._rand(this.scrambleMin, this.scrambleMax) : Infinity;
        this.scrambleTiles = [];
    }

    scrambleWarning(t = this.time) {
        return isFinite(this.scrambleAt) && t >= this.scrambleAt - this.scrambleWarn && t < this.scrambleAt;
    }

    // ── Simulation ──

    update(dt) {
        if (!this.active) return;
        this.stepDt = dt || this.stepDt;
        const h = this.stepDt;
        if (this.flash > 0) this.flash -= h;
        if (this.result !== null) return;
        this.time += h;

        // Short pause after a solved trace (the timer stops too).
        if (this.pause > 0) {
            this.pause -= h;
            if (this.pause <= 0) this._newPuzzle();
            return;
        }

        this.timeLeft = Math.max(0, this.timeLeft - h);

        // Scramble: pick tiles at the start of the warning, turn them at the end.
        if (isFinite(this.scrambleAt)) {
            if (this.scrambleWarning() && !this.scrambleTiles.length) {
                const free = [];
                for (let y = 0; y < this.size; y++) {
                    for (let x = 0; x < this.size; x++) {
                        const t = this.grid[y][x];
                        if (!t.locked && t.type !== 'empty') free.push({ x, y });
                    }
                }
                free.sort(() => this.rng() - 0.5);
                this.scrambleTiles = free.slice(0, this.scrambleCount);
            }
            if (this.time >= this.scrambleAt) {
                for (const c of this.scrambleTiles) this.grid[c.y][c.x].rot = (this.grid[c.y][c.x].rot + 1 + this._int(3)) % 4;
                this._afterChange();
                this._scheduleScramble();
            }
        }

        if (this.timeLeft <= 0 && this.result === null) {
            this.result = 'fail';
            if (typeof Sound !== 'undefined' && Sound.playMiss) Sound.playMiss();
        }
    }

    _afterChange() {
        const r = this._reach();
        this.lit = r.lit;
        if (!r.solved) return;
        this.solved++;
        this.flash = 0.5;
        if (typeof Sound !== 'undefined' && Sound.playGood) Sound.playGood(RouteTraceMechanic.SOUND);
        if (this.solved >= this.traces) {
            this.result = 'success';
            this.score = this.computeScore();
            return;
        }
        this.pause = this.solvedPause;
        this.scrambleAt = Infinity;
    }

    computeScore() {
        return this.solved * 400 + Math.floor(this.timeLeft) * 20;
    }

    rotateTile(x, y) {
        if (this.result !== null || this.pause > 0) return false;
        if (x < 0 || y < 0 || x >= this.size || y >= this.size) return false;
        const t = this.grid[y][x];
        this.cursor = { x, y };
        if (t.locked || t.type === 'empty') return false;
        t.rot = (t.rot + 1) % 4;
        this._afterChange();
        return true;
    }

    // ── Input ──

    boardRect() {
        const n = this.size;
        const tile = Math.floor(Math.min(440, this.height - 220) / n);
        const w = tile * n;
        return { x: Math.round(this.width / 2 - w / 2), y: 98, tile, w };
    }

    handleKey(code) {
        const c = this.cursor;
        const n = this.size;
        if (code === 'ArrowLeft' || code === 'KeyA') { c.x = Math.max(0, c.x - 1); return true; }
        if (code === 'ArrowRight' || code === 'KeyD') { c.x = Math.min(n - 1, c.x + 1); return true; }
        if (code === 'ArrowUp' || code === 'KeyW') { c.y = Math.max(0, c.y - 1); return true; }
        if (code === 'ArrowDown' || code === 'KeyS') { c.y = Math.min(n - 1, c.y + 1); return true; }
        if (code === 'Space' || code === 'Enter') { this.rotateTile(c.x, c.y); return true; }
        return false;
    }

    handlePointer(x, y, phase) {
        if (phase && phase !== 'down') return false;
        const B = this.boardRect();
        const gx = Math.floor((x - B.x) / B.tile), gy = Math.floor((y - B.y) / B.tile);
        if (gx < 0 || gy < 0 || gx >= this.size || gy >= this.size) return true;
        this.rotateTile(gx, gy);
        return true;
    }

    // ── Render ──

    render(ctx, W, H) {
        const B = this.boardRect();
        const n = this.size;
        const green = '#22c55e';
        const warn = this.scrambleWarning();
        const flick = 0.5 + 0.5 * Math.sin(this.time * 30);

        ctx.save();
        ctx.fillStyle = 'rgba(8,12,20,0.85)';
        ctx.strokeStyle = 'rgba(71,85,105,0.6)';
        ctx.lineWidth = 1.5;
        Utils.roundRect(ctx, B.x - 8, B.y - 8, B.w + 16, B.w + 16, 10);
        ctx.fill();
        ctx.stroke();

        // Your node (left) and the attacker's node (right)
        const nodeY = (row) => B.y + row * B.tile + B.tile / 2;
        const drawNode = (x, y, color, label) => {
            ctx.fillStyle = 'rgba(15,23,42,0.95)';
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = color;
            ctx.font = '700 10px Orbitron';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, x, y + 26);
        };
        const srcLit = this.lit.has(this.srcRow * n);
        ctx.strokeStyle = srcLit ? green : '#3b82f6';
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(B.x - 34, nodeY(this.srcRow)); ctx.lineTo(B.x, nodeY(this.srcRow)); ctx.stroke();
        drawNode(B.x - 40, nodeY(this.srcRow), '#3b82f6', 'YOU');
        const dstLit = this.lit.has(this.dstRow * n + n - 1) && (this.mask(n - 1, this.dstRow) & 2);
        ctx.strokeStyle = dstLit ? green : 'rgba(239,68,68,0.6)';
        ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(B.x + B.w, nodeY(this.dstRow)); ctx.lineTo(B.x + B.w + 34, nodeY(this.dstRow)); ctx.stroke();
        drawNode(B.x + B.w + 40, nodeY(this.dstRow), '#ef4444', 'ATTACKER');

        // Tiles
        const pipe = Math.max(5, B.tile * 0.16);
        for (let y = 0; y < n; y++) {
            for (let x = 0; x < n; x++) {
                const t = this.grid[y][x];
                const tx = B.x + x * B.tile, ty = B.y + y * B.tile;
                const cx = tx + B.tile / 2, cy = ty + B.tile / 2;
                const isLit = this.lit.has(y * n + x);
                const jitter = warn && this.scrambleTiles.some(c => c.x === x && c.y === y);

                ctx.fillStyle = t.locked ? 'rgba(30,41,59,0.95)' : 'rgba(15,23,42,0.9)';
                ctx.strokeStyle = jitter ? `rgba(251,191,36,${0.4 + 0.6 * flick})` : 'rgba(51,65,85,0.7)';
                ctx.lineWidth = jitter ? 2 : 1;
                Utils.roundRect(ctx, tx + 2, ty + 2, B.tile - 4, B.tile - 4, 6);
                ctx.fill();
                ctx.stroke();

                if (t.type !== 'empty') {
                    const m = this.mask(x, y);
                    ctx.strokeStyle = isLit ? green : (t.locked ? '#475569' : '#64748b');
                    ctx.lineWidth = pipe;
                    ctx.lineCap = 'round';
                    if (isLit) { ctx.shadowColor = green; ctx.shadowBlur = 10; }
                    ctx.beginPath();
                    for (let d = 0; d < 4; d++) {
                        if (!(m & (1 << d))) continue;
                        ctx.moveTo(cx, cy);
                        ctx.lineTo(cx + RT_DX[d] * (B.tile / 2 - 2), cy + RT_DY[d] * (B.tile / 2 - 2));
                    }
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                    ctx.fillStyle = isLit ? green : '#475569';
                    ctx.beginPath(); ctx.arc(cx, cy, pipe * 0.75, 0, Math.PI * 2); ctx.fill();
                }
                if (t.locked) {
                    ctx.strokeStyle = '#94a3b8';
                    ctx.lineWidth = 1.4;
                    const lx = tx + B.tile - 14, ly = ty + 9;
                    ctx.beginPath(); ctx.arc(lx + 3.5, ly + 2, 2.6, Math.PI, 0); ctx.stroke();
                    Utils.roundRect(ctx, lx, ly + 2, 7, 6, 1.5);
                    ctx.stroke();
                }
            }
        }

        // Keyboard cursor
        const c = this.cursor;
        ctx.strokeStyle = 'rgba(226,232,240,0.85)';
        ctx.lineWidth = 2;
        Utils.roundRect(ctx, B.x + c.x * B.tile + 1, B.y + c.y * B.tile + 1, B.tile - 2, B.tile - 2, 7);
        ctx.stroke();
        ctx.restore();

        if (this.flash > 0) {
            ctx.save();
            ctx.globalAlpha = Math.min(1, this.flash / 0.5) * 0.12;
            ctx.fillStyle = green;
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        }
        this._renderHud(ctx, W, H);
    }

    _renderHud(ctx, W, H) {
        const y = H - 40;
        ctx.save();
        ctx.textBaseline = 'middle';
        for (let i = 0; i < this.traces; i++) {
            const done = i < this.solved;
            ctx.fillStyle = done ? 'rgba(34,197,94,0.3)' : 'rgba(15,23,42,0.6)';
            ctx.strokeStyle = done ? '#22c55e' : '#475569';
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(W / 2 - 180 + i * 30, y, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        const low = this.timeLeft < 10;
        ctx.fillStyle = low ? '#ef4444' : '#94a3b8';
        ctx.font = '700 20px Rajdhani';
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.ceil(this.timeLeft)}s · TRACES ${this.solved}/${this.traces}`, W / 2 + 250, y);

        // Status line between the board and the HUD.
        if (this.result !== null || this.pause > 0) {
            const B = this.boardRect();
            const ok = this.result === 'success' || this.pause > 0;
            ctx.fillStyle = ok ? '#22c55e' : '#ef4444';
            ctx.font = '700 22px Orbitron';
            ctx.textAlign = 'center';
            const text = this.result === 'success' ? `ATTACKER TRACED · SCORE ${this.score}`
                : this.result === 'fail' ? 'TRACE LOST' : 'ROUTE FOUND';
            ctx.fillText(text, W / 2, B.y + B.w + 30);
        }
        ctx.restore();
    }
}

// Trace "ping" voice for Sound.playGood(theme).
RouteTraceMechanic.SOUND = { soundFreq: 700, soundType: 'triangle' };

if (typeof module !== 'undefined' && module.exports) module.exports = RouteTraceMechanic;
