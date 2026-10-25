/* =========================================
   ChecksumGridMechanic.js — Act 9 · FINAL_AUDIT

   A nonogram. The core's memory map is a grid; every row (left) and
   column (top) has a CHECKSUM: the lengths of its blocks of filled cells,
   in order. Rebuild the map so every checksum matches; a symmetric emblem
   appears. No timer, no lives, no way to lose.

   GOAL, always on screen: turn every number grey. A number greys out
   when its row / column matches it; all grey = the stage is cleared.

   Every puzzle has one solution and needs no guessing: the generator
   keeps a picture only when the line solver (each row / column on its
   own, repeated) solves it completely. Difficulty = how many solver
   sweeps it takes (`minSweeps`): longer chains of reasoning.

   Controls: pick FILL or ✕ (MARK) and tap a cell; tapping a cell that
   already holds that mark clears it. Dragging repeats the action along
   the row or column of the first move. Desktop right click is always ✕.
   UNDO takes back the last stroke. AUDIT lights wrong cells red; an
   audit that finds a mistake counts as an audit error (stars).
   Keyboard: arrows, SPACE fill, X mark, Z / Backspace undo, Enter audit.

   RULES box (right panel): rotating reminders of how the game works
   (TipBar.RULES.checksum), always on screen; a tap shows the next one.

   wantsDrag: the host sends 'down' / 'move' / 'up' / 'cancel'.

   Lesson (Coach, useCoach): the first stage explains the checksums, then
   asks for one fill and one ✕, then grey checksums, UNDO and AUDIT.
   Shown once (sb_coach_checksum).
   ========================================= */

const _MechanicBaseCG = (typeof Mechanic !== 'undefined') ? Mechanic : class {};

const CG_EMPTY = 0, CG_FILL = 1, CG_MARK = 2;

class ChecksumGridMechanic extends _MechanicBaseCG {
    constructor(options = {}) {
        super();
        this.rng = options.rng || Math.random;

        this.rows = options.rows || 8;
        this.cols = options.cols || this.rows;
        this.density = options.density || 0.55;        // share of filled cells before smoothing
        this.smooth = options.smooth !== undefined ? options.smooth : 1;   // blob passes (0 = raw)
        this.minSweeps = options.minSweeps || 3;       // line-solver sweeps the puzzle needs
        this.maxSweeps = options.maxSweeps || 99;
        this.wantsDrag = true;
        this.coachStore = null;
        this.firstStage = false;

        this.resultDuration = 2.2;
        this.stepDt = 1 / 60;
    }

    useCoach(store, firstStage) {
        this.coachStore = store || null;
        this.firstStage = !!firstStage;
    }

    init(context = {}) {
        this.active = true;
        this.result = null;
        this.width = context.width || 960;
        this.height = context.height || 640;
        this.time = 0;
        this.score = 0;
        this.auditErrors = 0;
        this.audited = null;          // { cells: Set, t } — red flash after an audit
        this.message = null;
        this.mode = 'fill';
        this.undo = [];
        this.stroke = null;
        this.cursor = { r: 0, c: 0 };
        this.kbd = false;
        this.reveal = 0;
        this.rules = null;
        if (typeof TipBar !== 'undefined' && TipBar.RULES) {
            this.rules = new TipBar();
            this.rules.hold = 9;
            this.rules.setTips('checksum', TipBar.RULES.checksum);
        }
        this._newPuzzle();
        this.coach = null;
        if (this.coachStore && this.firstStage && !this.coachStore.seen('tutorial') && typeof Coach !== 'undefined') {
            this.coach = new Coach(this.coachStore).push(
                { kind: 'info', rects: 'clues', text: 'Rebuild the clean memory map. The numbers are CHECKSUMS: they list the blocks of filled cells in each row (left) and each column (top), in order.' },
                { kind: 'info', rects: 'clues', text: '"3 1" means: a block of 3 filled cells, at least one empty cell, then a block of 1. Read rows and columns together — you never need to guess.' },
                { kind: 'info', rects: 'goal', text: 'HOW TO WIN: a number turns GREY when its row or column matches it. Turn EVERY number grey and the audit passes. This bar shows how far you are.' },
                { kind: 'fill', rects: 'fill', text: { desktop: 'Pick FILL and click a cell you are SURE is filled. Drag to fill several in a row.', touch: 'Pick FILL and tap a cell you are SURE is filled. Drag to fill several in a row.' } },
                { kind: 'mark', rects: 'mark', text: { desktop: 'Mark a cell you KNOW is empty with ✕: pick ✕ and click it, or just right click.', touch: 'Mark a cell you KNOW is empty: pick ✕ and tap it.' } },
                { kind: 'info', rects: 'tools', text: 'UNDO takes back a move. Stuck? AUDIT shows wrong cells — but every audit that finds a mistake costs a star.' },
                { kind: 'info', key: 'tutorial', rects: 'goal', text: 'No timer, no lives: take all the time you need. Turn every number grey to pass the audit.' }
            );
        }
    }

    // ── Puzzle ──

    /** Block lengths of a line of 0/1 values. */
    static runs(line) {
        const out = [];
        let n = 0;
        for (const v of line) {
            if (v === 1) n++;
            else if (n) { out.push(n); n = 0; }
        }
        if (n) out.push(n);
        return out;
    }

    /**
     * One line on its own: cells -1 unknown, 0 empty, 1 filled. Returns the
     * cells every fitting placement of the clue agrees on, or null when the
     * clue cannot fit at all.
     */
    static solveLine(clue, cells) {
        const L = cells.length, k = clue.length;
        const memo = new Map();
        const placements = (i, j, cb) => {
            const len = clue[j];
            for (let s = i; s + len <= L; s++) {
                if (s > i && cells[s - 1] === 1) break;          // a filled cell left uncovered
                let ok = true;
                for (let x = s; x < s + len; x++) if (cells[x] === 0) { ok = false; break; }
                if (!ok || (s + len < L && cells[s + len] === 1)) continue;
                cb(s, Math.min(L, s + len + 1));
            }
        };
        const fits = (i, j) => {
            const key = i * (k + 1) + j;
            if (memo.has(key)) return memo.get(key);
            let r = false;
            if (j === k) {
                r = true;
                for (let x = i; x < L; x++) if (cells[x] === 1) { r = false; break; }
            } else {
                placements(i, j, (s, next) => { if (!r && fits(next, j + 1)) r = true; });
            }
            memo.set(key, r);
            return r;
        };
        if (!fits(0, 0)) return null;
        const can1 = new Array(L).fill(false), can0 = new Array(L).fill(false);
        const seen = new Set();
        const walk = (i, j) => {
            const key = i * (k + 1) + j;
            if (seen.has(key)) return;
            seen.add(key);
            if (j === k) { for (let x = i; x < L; x++) can0[x] = true; return; }
            placements(i, j, (s, next) => {
                if (!fits(next, j + 1)) return;
                for (let x = i; x < s; x++) can0[x] = true;
                for (let x = s; x < s + clue[j]; x++) can1[x] = true;
                if (s + clue[j] < L) can0[s + clue[j]] = true;
                walk(next, j + 1);
            });
        };
        walk(0, 0);
        return cells.map((v, x) => v >= 0 ? v : (can1[x] && !can0[x]) ? 1 : (can0[x] && !can1[x]) ? 0 : -1);
    }

    /** Line solver over the whole grid: { solved, sweeps, grid } or null on a contradiction. */
    static solve(rows, cols, rowClues, colClues) {
        const g = new Array(rows * cols).fill(-1);
        let sweeps = 0, changed = true;
        while (changed) {
            changed = false;
            sweeps++;
            for (let r = 0; r < rows; r++) {
                const out = ChecksumGridMechanic.solveLine(rowClues[r], g.slice(r * cols, r * cols + cols));
                if (!out) return null;
                out.forEach((v, c) => { if (g[r * cols + c] !== v) { g[r * cols + c] = v; changed = true; } });
            }
            for (let c = 0; c < cols; c++) {
                const line = [];
                for (let r = 0; r < rows; r++) line.push(g[r * cols + c]);
                const out = ChecksumGridMechanic.solveLine(colClues[c], line);
                if (!out) return null;
                out.forEach((v, r) => { if (g[r * cols + c] !== v) { g[r * cols + c] = v; changed = true; } });
            }
        }
        return { solved: g.every(v => v >= 0), sweeps: sweeps - 1, grid: g };
    }

    /** A mirrored random picture, optionally smoothed into blobs. */
    _picture() {
        const rows = this.rows, cols = this.cols;
        let g = new Array(rows * cols).fill(0);
        const half = Math.ceil(cols / 2);
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < half; c++) {
                const v = this.rng() < this.density ? 1 : 0;
                g[r * cols + c] = v;
                g[r * cols + cols - 1 - c] = v;
            }
        }
        for (let k = 0; k < this.smooth; k++) {
            const n = g.slice();
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    let sum = 0, all = 0;
                    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
                        const rr = r + dr, cc = c + dc;
                        if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
                        all++;
                        sum += g[rr * cols + cc];
                    }
                    n[r * cols + c] = sum * 2 > all ? 1 : sum * 2 < all ? 0 : g[r * cols + c];
                }
            }
            g = n;
        }
        return g;
    }

    _clues(g) {
        const rows = this.rows, cols = this.cols;
        const R = [], C = [];
        for (let r = 0; r < rows; r++) R.push(ChecksumGridMechanic.runs(g.slice(r * cols, r * cols + cols)));
        for (let c = 0; c < cols; c++) {
            const line = [];
            for (let r = 0; r < rows; r++) line.push(g[r * cols + c]);
            C.push(ChecksumGridMechanic.runs(line));
        }
        return { R, C };
    }

    _newPuzzle() {
        let best = null;
        for (let tries = 0; tries < 20000; tries++) {
            const g = this._picture();
            const share = g.reduce((a, b) => a + b, 0) / g.length;
            if (share < 0.35 || share > 0.7) continue;
            const { R, C } = this._clues(g);
            const s = ChecksumGridMechanic.solve(this.rows, this.cols, R, C);
            if (!s || !s.solved) continue;
            if (!best || s.sweeps > best.sweeps) best = { g, R, C, sweeps: s.sweeps };
            if (s.sweeps >= this.minSweeps && s.sweeps <= this.maxSweeps) { best = { g, R, C, sweeps: s.sweeps }; break; }
        }
        this.solution = best.g;
        this.rowClues = best.R;
        this.colClues = best.C;
        this.sweeps = best.sweeps;
        this.cells = new Array(this.rows * this.cols).fill(CG_EMPTY);
    }

    // ── Rules ──

    _line(kind, k) {
        const out = [];
        if (kind === 'row') for (let c = 0; c < this.cols; c++) out.push(this.cells[k * this.cols + c] === CG_FILL ? 1 : 0);
        else for (let r = 0; r < this.rows; r++) out.push(this.cells[r * this.cols + k] === CG_FILL ? 1 : 0);
        return out;
    }

    /** Does this row / column match its checksum right now? */
    lineOk(kind, k) {
        const want = kind === 'row' ? this.rowClues[k] : this.colClues[k];
        const got = ChecksumGridMechanic.runs(this._line(kind, k));
        return got.length === want.length && got.every((v, i) => v === want[i]);
    }

    get linesOk() {
        let n = 0;
        for (let r = 0; r < this.rows; r++) if (this.lineOk('row', r)) n++;
        for (let c = 0; c < this.cols; c++) if (this.lineOk('col', c)) n++;
        return n;
    }

    get busy() { return this.result !== null || (this.coach && this.coach.blocks); }

    /** Put `state` on cell i (part of the current stroke). */
    _set(i, state) {
        const was = this.cells[i];
        if (was === state) return;
        if (this.stroke) this.stroke.changes.push({ i, was });
        this.cells[i] = state;
        if (state === CG_FILL && this.coach) this.coach.event('fill');
        if (state === CG_MARK && this.coach) this.coach.event('mark');
    }

    /** Start a stroke on a cell: the action follows the mode and what the cell holds. */
    _begin(r, c, mark) {
        const i = r * this.cols + c;
        const want = mark ? CG_MARK : CG_FILL;
        const from = this.cells[i];
        const to = from === want ? CG_EMPTY : want;
        this.stroke = { r, c, from, to, axis: null, changes: [] };
        this._set(i, to);
        this.cursor = { r, c };
    }

    /** Extend the stroke to (r, c) along its row or column. */
    _extend(r, c) {
        const s = this.stroke;
        if (!s) return;
        if (!s.axis) {
            if (r === s.r && c === s.c) return;
            s.axis = Math.abs(c - s.c) >= Math.abs(r - s.r) ? 'row' : 'col';
        }
        if (s.axis === 'row') r = s.r; else c = s.c;
        const a = s.axis === 'row' ? Math.min(c, s.c) : Math.min(r, s.r);
        const b = s.axis === 'row' ? Math.max(c, s.c) : Math.max(r, s.r);
        for (let k = a; k <= b; k++) {
            const i = s.axis === 'row' ? s.r * this.cols + k : k * this.cols + s.c;
            if (this.cells[i] === s.from) this._set(i, s.to);
        }
        this.cursor = { r, c };
    }

    _end() {
        const s = this.stroke;
        this.stroke = null;
        if (!s) return;
        if (s.changes.length) {
            this.undo.push(s.changes);
            if (typeof Sound !== 'undefined' && Sound.playClick) Sound.playClick();
        }
        this._checkDone();
    }

    undoLast() {
        if (this.busy) return false;
        const changes = this.undo.pop();
        if (!changes) return false;
        for (let k = changes.length - 1; k >= 0; k--) this.cells[changes[k].i] = changes[k].was;
        return true;
    }

    /** Light wrong cells; an audit that finds any counts as an audit error. */
    audit() {
        if (this.busy) return false;
        const wrong = new Set();
        this.cells.forEach((v, i) => {
            if (v === CG_FILL && !this.solution[i]) wrong.add(i);
            if (v === CG_MARK && this.solution[i]) wrong.add(i);
        });
        if (wrong.size) {
            this.auditErrors++;
            this.audited = { cells: wrong, t: 2.5 };
            this.message = { text: `AUDIT: ${wrong.size} WRONG CELL${wrong.size > 1 ? 'S' : ''}`, color: '#ef4444', t: 2.5 };
            if (typeof Sound !== 'undefined' && Sound.playMiss) Sound.playMiss();
        } else {
            this.audited = null;
            this.message = { text: 'AUDIT: NO MISTAKES SO FAR', color: '#22c55e', t: 2 };
            if (typeof Sound !== 'undefined' && Sound.playGood) Sound.playGood(ChecksumGridMechanic.SOUND);
        }
        return true;
    }

    _checkDone() {
        if (this.result !== null) return;
        if (this.linesOk < this.rows + this.cols) return;
        this.result = 'success';
        this.score = this.computeScore();
        this.reveal = 0.001;
        this.message = { text: 'AUDIT PASSED — THE CORE IS CLEAN', color: '#22c55e', t: 99 };
        if (typeof Sound !== 'undefined' && Sound.playStamp) Sound.playStamp();
    }

    computeScore() { return Math.max(250, 1000 - this.auditErrors * 150); }

    /** End-of-stage numbers for the star rules (draft, pending approval). */
    starStats() { return { auditErrors: this.auditErrors }; }

    update(dt) {
        if (!this.active) return;
        this.stepDt = dt || this.stepDt;
        const h = this.stepDt;
        this.time += h;
        if (this.coach) { this.coach.update(h); if (!this.coach.active) this.coach = null; }
        if (this.message) { this.message.t -= h; if (this.message.t <= 0) this.message = null; }
        if (this.audited) { this.audited.t -= h; if (this.audited.t <= 0) this.audited = null; }
        if (this.reveal > 0 && this.reveal < 1) this.reveal = Math.min(1, this.reveal + h * 1.5);
        if (this.rules) this.rules.update(h);
    }

    // ── Layout ──

    layout() {
        const maxRow = Math.max(1, ...this.rowClues.map(c => c.length));
        const maxCol = Math.max(1, ...this.colClues.map(c => c.length));
        const clueW = maxRow * 22 + 14, clueH = maxCol * 20 + 10;
        const left = 82, right = 662, top = 84, bottom = 628;   // top clears the host subtitle
        const cell = Math.floor(Math.min((right - left - clueW) / this.cols, (bottom - top - clueH) / this.rows, 46));
        const w = cell * this.cols, h = cell * this.rows;
        const x = left + clueW + (right - left - clueW - w) / 2;
        const y = top + clueH + (bottom - top - clueH - h) / 2;
        return { x, y, w, h, cell, clueW, clueH };
    }

    buttons() {
        const x = 690, w = 230;
        return {
            fill: { x, y: 96, w: w / 2 - 6, h: 60 },
            mark: { x: x + w / 2 + 6, y: 96, w: w / 2 - 6, h: 60 },
            undo: { x, y: 170, w, h: 52 },
            audit: { x, y: 236, w, h: 60 },
            goal: { x, y: 308, w, h: 76 },
            rules: { x, y: 470, w, h: 134 }
        };
    }

    cellAt(x, y) {
        const L = this.layout();
        const c = Math.floor((x - L.x) / L.cell), r = Math.floor((y - L.y) / L.cell);
        if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) return null;
        return { r, c };
    }

    // ── Input ──

    handlePointer(x, y, phase) {
        if (phase === 'move') {
            if (this.stroke) {
                const L = this.layout();
                const c = Math.max(0, Math.min(this.cols - 1, Math.floor((x - L.x) / L.cell)));
                const r = Math.max(0, Math.min(this.rows - 1, Math.floor((y - L.y) / L.cell)));
                this._extend(r, c);
            }
            return true;
        }
        if (phase === 'up' || phase === 'cancel') { this._end(); return true; }
        if (phase && phase !== 'down') return false;
        if (this.result !== null) return false;
        this.kbd = false;
        if (this.coach && this.coach.blocks) { this.coach.next(); return true; }
        const B = this.buttons();
        const inside = (b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
        if (inside(B.fill)) { this.mode = 'fill'; return true; }
        if (inside(B.mark)) { this.mode = 'mark'; return true; }
        if (inside(B.undo)) { this.undoLast(); return true; }
        if (inside(B.audit)) { this.audit(); return true; }
        if (inside(B.rules)) { this.nextRule(); return true; }
        const at = this.cellAt(x, y);
        if (at) this._begin(at.r, at.c, this.mode === 'mark');
        return true;
    }

    /** The RULES box: show the next reminder now. */
    nextRule() {
        const t = this.rules;
        if (!t || !t.tips.length) return false;
        t.index = (t.index + 1) % t.tips.length;
        t.timer = t.fade;   // fully visible at once
        return true;
    }

    /** Right click: always ✕ on that cell. */
    handleAltPointer(x, y) {
        if (this.busy) return false;
        const at = this.cellAt(x, y);
        if (!at) return false;
        this._begin(at.r, at.c, true);
        this._end();
        return true;
    }

    releaseAll() { this._end(); }

    handleKey(code) {
        if (this.result !== null) return false;
        if (this.coach && this.coach.blocks) {
            if (code === 'Space' || code === 'Enter') this.coach.next();
            return true;
        }
        this.kbd = true;
        const k = this.cursor;
        const moves = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
        if (moves[code]) {
            k.r = Math.max(0, Math.min(this.rows - 1, k.r + moves[code][0]));
            k.c = Math.max(0, Math.min(this.cols - 1, k.c + moves[code][1]));
            return true;
        }
        if (code === 'Space' || code === 'KeyX') { this._begin(k.r, k.c, code === 'KeyX'); this._end(); return true; }
        if (code === 'KeyZ' || code === 'Backspace') { this.undoLast(); return true; }
        if (code === 'Enter') { this.audit(); return true; }
        return false;
    }

    // ── Render ──

    render(ctx, W, H) {
        const L = this.layout();
        const done = this.result === 'success';
        ctx.save();
        UITheme.panel(ctx, L.x - L.clueW - 10, L.y - L.clueH - 10, L.w + L.clueW + 20, L.h + L.clueH + 20, { chamfer: 14, fill: 'rgba(8,12,20,0.88)', stroke: 'rgba(56,189,248,0.45)', lineWidth: 1.4 });

        // Cursor row / column wash (keyboard) and the stroke's line
        const focus = this.stroke || (this.kbd ? this.cursor : null);
        if (focus && !done) {
            ctx.fillStyle = 'rgba(56,189,248,0.08)';
            ctx.fillRect(L.x - L.clueW, L.y + focus.r * L.cell, L.w + L.clueW, L.cell);
            ctx.fillRect(L.x + focus.c * L.cell, L.y - L.clueH, L.cell, L.h + L.clueH);
        }

        // Checksums: grey once the line matches
        ctx.textBaseline = 'middle';
        ctx.font = `700 ${Math.min(18, Math.round(L.cell * 0.55))}px Rajdhani`;
        for (let r = 0; r < this.rows; r++) {
            const ok = this.lineOk('row', r);
            ctx.fillStyle = ok ? 'rgba(100,116,139,0.6)' : '#e2e8f0';
            ctx.textAlign = 'right';
            const clue = this.rowClues[r].length ? this.rowClues[r] : [0];
            ctx.fillText(clue.join('  '), L.x - 10, L.y + (r + 0.5) * L.cell + 1);
        }
        ctx.textAlign = 'center';
        for (let c = 0; c < this.cols; c++) {
            const ok = this.lineOk('col', c);
            ctx.fillStyle = ok ? 'rgba(100,116,139,0.6)' : '#e2e8f0';
            const clue = this.colClues[c].length ? this.colClues[c] : [0];
            clue.forEach((v, k) => ctx.fillText(String(v), L.x + (c + 0.5) * L.cell, L.y - 10 - (clue.length - 1 - k) * 20));
        }

        // Cells
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const i = r * this.cols + c;
                const x = L.x + c * L.cell, y = L.y + r * L.cell, s = L.cell;
                const v = this.cells[i];
                ctx.fillStyle = 'rgba(30,41,59,0.6)';
                ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
                if (v === CG_FILL) {
                    ctx.fillStyle = done ? `rgba(34,211,238,${0.6 + 0.4 * this.reveal})` : '#38bdf8';
                    if (done) { ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 10 * this.reveal; }
                    ctx.fillRect(x + 2, y + 2, s - 4, s - 4);
                    ctx.shadowBlur = 0;
                } else if (v === CG_MARK && !done) {
                    ctx.strokeStyle = 'rgba(148,163,184,0.75)';
                    ctx.lineWidth = 2;
                    const m = s * 0.3;
                    ctx.beginPath();
                    ctx.moveTo(x + m, y + m); ctx.lineTo(x + s - m, y + s - m);
                    ctx.moveTo(x + s - m, y + m); ctx.lineTo(x + m, y + s - m);
                    ctx.stroke();
                }
                if (this.audited && this.audited.cells.has(i)) {
                    ctx.strokeStyle = `rgba(239,68,68,${0.5 + 0.5 * Math.sin(this.time * 10)})`;
                    ctx.lineWidth = 3;
                    ctx.strokeRect(x + 2, y + 2, s - 4, s - 4);
                }
            }
        }
        // Grid lines, a bolder one every 5 cells to help counting
        for (let k = 0; k <= this.cols; k++) {
            ctx.strokeStyle = k % 5 === 0 ? 'rgba(148,163,184,0.55)' : 'rgba(71,85,105,0.35)';
            ctx.lineWidth = k % 5 === 0 ? 1.6 : 1;
            ctx.beginPath(); ctx.moveTo(L.x + k * L.cell, L.y); ctx.lineTo(L.x + k * L.cell, L.y + L.h); ctx.stroke();
        }
        for (let k = 0; k <= this.rows; k++) {
            ctx.strokeStyle = k % 5 === 0 ? 'rgba(148,163,184,0.55)' : 'rgba(71,85,105,0.35)';
            ctx.lineWidth = k % 5 === 0 ? 1.6 : 1;
            ctx.beginPath(); ctx.moveTo(L.x, L.y + k * L.cell); ctx.lineTo(L.x + L.w, L.y + k * L.cell); ctx.stroke();
        }
        if (this.kbd && !done) {
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 2.5;
            ctx.strokeRect(L.x + this.cursor.c * L.cell + 1, L.y + this.cursor.r * L.cell + 1, L.cell - 2, L.cell - 2);
        }
        ctx.restore();
        this._renderTools(ctx);
        if (this.coach && this.coach.active) this.coach.render(ctx, W, H, this._coachRects(this.coach.step.rects), { at: 'bottom', cx: 805, width: 270 });
    }

    _renderTools(ctx) {
        const B = this.buttons();
        const button = (b, label, on, color) => {
            UITheme.panel(ctx, b.x, b.y, b.w, b.h, { chamfer: 8, fill: on ? 'rgba(56,189,248,0.2)' : 'rgba(15,23,42,0.9)', stroke: on ? color : 'rgba(100,116,139,0.6)', lineWidth: on ? 2 : 1.2 });
            ctx.fillStyle = on ? '#f8fafc' : '#cbd5e1';
            ctx.font = '700 17px Orbitron';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1);
        };
        ctx.save();
        button(B.fill, '■ FILL', this.mode === 'fill', '#38bdf8');
        button(B.mark, '✕', this.mode === 'mark', '#94a3b8');
        button(B.undo, '↶ UNDO', false, '#94a3b8');
        button(B.audit, 'AUDIT', false, '#f59e0b');
        // GOAL: the win rule and how far along it is
        const G = B.goal, total = this.rows + this.cols, ok = this.linesOk;
        UITheme.panel(ctx, G.x, G.y, G.w, G.h, { chamfer: 8, fill: 'rgba(250,204,21,0.07)', stroke: 'rgba(250,204,21,0.55)' });
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#facc15';
        ctx.font = '700 13px Orbitron';
        ctx.fillText('GOAL', G.x + 12, G.y + 15);
        ctx.fillStyle = '#fde68a';
        ctx.font = '700 16px Rajdhani';
        ctx.fillText('Turn EVERY number grey', G.x + 64, G.y + 15);
        ctx.fillStyle = 'rgba(15,23,42,0.9)';
        ctx.fillRect(G.x + 12, G.y + 32, G.w - 24, 12);
        ctx.fillStyle = ok >= total ? '#22c55e' : '#facc15';
        ctx.fillRect(G.x + 12, G.y + 32, (G.w - 24) * ok / total, 12);
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '600 14px Rajdhani';
        ctx.fillText(`${ok} / ${total} rows + columns match`, G.x + 12, G.y + 59);
        const x = G.x, y = G.y + G.h + 18;
        ctx.fillStyle = this.auditErrors ? '#fca5a5' : '#94a3b8';
        ctx.font = '700 14px Rajdhani';
        ctx.fillText(`AUDIT ERRORS ${this.auditErrors}  ·  no timer, no lives`, x, y);
        this._renderRules(ctx, B.rules);
        if (this.message) {
            ctx.fillStyle = this.message.color;
            ctx.font = '700 16px Orbitron';
            const words = this.message.text.split(' ');
            let line = '', ly = y + 24;
            for (const w of words) {
                const t = line ? line + ' ' + w : w;
                const m = ctx.measureText(t).width;
                if ((typeof m === 'number' ? m : t.length * 10) > 230 && line) { ctx.fillText(line, x, ly); ly += 22; line = w; } else line = t;
            }
            ctx.fillText(line, x, ly);
        }
        ctx.restore();
    }

    /** Rotating rule reminder in a framed box; a tap moves to the next one. */
    _renderRules(ctx, b) {
        const t = this.rules;
        if (!t || this.result !== null) return;
        const mode = typeof Coach !== 'undefined' ? Coach.inputMode() : 'desktop';
        const text = t.current(mode);
        UITheme.panel(ctx, b.x, b.y, b.w, b.h, { chamfer: 8, fill: 'rgba(15,23,42,0.85)', stroke: 'rgba(59,130,246,0.5)' });
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#3b82f6';
        ctx.font = '700 13px Orbitron';
        ctx.fillText('RULES', b.x + 12, b.y + 16);
        ctx.fillStyle = '#64748b';
        ctx.font = '600 12px Rajdhani';
        ctx.textAlign = 'right';
        ctx.fillText(`${t.index + 1}/${t.tips.length}  ▸`, b.x + b.w - 12, b.y + 16);
        ctx.textAlign = 'left';
        ctx.globalAlpha = Math.max(0.15, t.alpha);
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '600 16px Rajdhani';
        let line = '', y = b.y + 40;
        for (const w of text.split(' ')) {
            const s = line ? line + ' ' + w : w;
            const m = ctx.measureText(s).width;
            if ((typeof m === 'number' ? m : s.length * 7) > b.w - 24 && line) { ctx.fillText(line, b.x + 12, y); y += 19; line = w; } else line = s;
        }
        ctx.fillText(line, b.x + 12, y);
        ctx.globalAlpha = 1;
    }

    _coachRects(kind) {
        const L = this.layout(), B = this.buttons();
        const pad = (b) => ({ x: b.x, y: b.y, w: b.w, h: b.h });
        const clueRow = { x: L.x - L.clueW, y: L.y, w: L.clueW - 4, h: L.h };
        const clueCol = { x: L.x, y: L.y - L.clueH, w: L.w, h: L.clueH - 4 };
        const board = { x: L.x, y: L.y, w: L.w, h: L.h };
        if (kind === 'clues') return [clueRow, clueCol];
        if (kind === 'fill') return [board, pad(B.fill)];
        if (kind === 'mark') return [board, pad(B.mark)];
        if (kind === 'tools') return [pad(B.undo), pad(B.audit)];
        if (kind === 'goal') return [pad(B.goal), clueRow, clueCol];
        return [];
    }
}

ChecksumGridMechanic.SOUND = { soundFreq: 620, soundType: 'triangle' };

if (typeof module !== 'undefined' && module.exports) module.exports = ChecksumGridMechanic;
