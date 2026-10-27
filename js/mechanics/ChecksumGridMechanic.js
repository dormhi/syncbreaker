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
   HINT (beta feedback 2026-10-27: players did not get how to play) lights
   a row or column that can be solved from what is known, the cells it
   decides, and why ("5 of 5 cells", "a block of 4 in 6 covers the
   middle" …). Free in the campaign; in Endless it costs time like an
   audit (the host counts `hints`).
   Keyboard: arrows, SPACE fill, X mark, Z / Backspace undo, Enter audit.

   RULES box (right panel): rotating reminders of how the game works
   (TipBar.RULES.checksum), always on screen; a tap shows the next one.

   wantsDrag: the host sends 'down' / 'move' / 'up' / 'cancel'.

   Lesson (Coach, useCoach): the first time stage 1 is played, a
   hand-made 5 × 5 map comes first and is solved step by step: each step
   lights one row or column, says why its cells are decided and waits
   until the player has done it (a move against the map is taken back).
   Then the stage's real map starts. Shown once (sb_coach_checksum).
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
        this.endless = !!options.endless;              // Endless: a time pool, audit errors cost time
        this.auditPenalty = options.auditPenalty || 0;
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
        this.hint = null;             // { lines, cells: [{ i, v }], text, vars } — the HINT shown
        this.hints = 0;
        this.rules = null;
        if (typeof TipBar !== 'undefined' && TipBar.RULES) {
            this.rules = new TipBar();
            this.rules.hold = 9;
            this.rules.setTips('checksum', TipBar.RULES.checksum);
        }
        this.coach = null;
        this.lesson = !!(this.coachStore && this.firstStage && !this.coachStore.seen('tutorial') && typeof Coach !== 'undefined');
        if (this.lesson) {
            this._lessonMap();
            this.coach = new Coach(this.coachStore).push(...ChecksumGridMechanic.LESSON);
        } else {
            this._newPuzzle();
        }
    }

    /** The lesson's hand-made 5 × 5 map (a shield); the stage's size waits. */
    _lessonMap() {
        this._stageSize = { rows: this.rows, cols: this.cols };
        this.rows = 5;
        this.cols = 5;
        this.solution = ChecksumGridMechanic.LESSON_MAP.join('').split('').map(ch => (ch === '#' ? 1 : 0));
        const { R, C } = this._clues(this.solution);
        this.rowClues = R;
        this.colClues = C;
        this.sweeps = 0;
        this.cells = new Array(25).fill(CG_EMPTY);
    }

    /** The lesson map is done: the stage's real map starts. */
    _endLesson() {
        this.lesson = false;
        this.rows = this._stageSize.rows;
        this.cols = this._stageSize.cols;
        this.undo = [];
        this.hint = null;
        this.cursor = { r: 0, c: 0 };
        this._newPuzzle();
        if (this.coach) this.coach.push({ kind: 'info', rects: 'goal', text: 'Lesson complete! Now a real map: no timer, no lives. Work line by line the same way — and press HINT whenever you are stuck.' });
    }

    /** A lesson step waiting for moves on the map: passed once its cells are right. */
    _lessonCheck() {
        const step = this.coach && this.coach.step;
        if (!step || !step.goal) return;
        const done = step.goal.every(([r, c, v]) => this.cells[r * this.cols + c] === (v ? CG_FILL : CG_MARK));
        if (done) this.coach.event(step.kind);
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
        // Lesson: a move against the map is taken back with a nudge.
        if (this.lesson && s.changes.some(ch => this._wrong(ch.i))) {
            for (let k = s.changes.length - 1; k >= 0; k--) this.cells[s.changes[k].i] = s.changes[k].was;
            this.message = { text: 'Not that cell — follow the lit row or column.', color: '#fbbf24', t: 2.5 };
            if (typeof Sound !== 'undefined' && Sound.playMiss) Sound.playMiss();
            return;
        }
        if (s.changes.length) {
            this.undo.push(s.changes);
            this.hint = null;
            if (typeof Sound !== 'undefined' && Sound.playClick) Sound.playClick();
        }
        if (this.lesson) this._lessonCheck();
        this._checkDone();
    }

    /** Does cell i hold something the solution disagrees with? */
    _wrong(i) {
        const v = this.cells[i];
        return (v === CG_FILL && !this.solution[i]) || (v === CG_MARK && this.solution[i]);
    }

    undoLast() {
        if (this.busy) return false;
        const changes = this.undo.pop();
        if (!changes) return false;
        for (let k = changes.length - 1; k >= 0; k--) this.cells[changes[k].i] = changes[k].was;
        this.hint = null;
        return true;
    }

    // ── Hint ──

    /**
     * HINT: a row or column whose cells follow from what is already on the
     * map, the cells it decides and why. With a wrong cell on the map it
     * only says so (AUDIT finds it). Fills come first: they are what wins.
     */
    giveHint() {
        if (this.busy) return false;
        this.hints++;
        if (this.cells.some((v, i) => this._wrong(i))) {
            this.hint = { lines: [], cells: [], text: 'Something does not add up: a cell on the map is wrong. UNDO your last moves, or use AUDIT to find it.' };
            return true;
        }
        const know = this.cells.map(v => (v === CG_FILL ? 1 : v === CG_MARK ? 0 : -1));
        let best = null;
        const consider = (kind, k, idx) => {
            const clue = kind === 'row' ? this.rowClues[k] : this.colClues[k];
            const line = idx.map(i => know[i]);
            const out = ChecksumGridMechanic.solveLine(clue, line);
            if (!out) return;
            const cells = [];
            out.forEach((v, x) => { if (line[x] === -1 && v >= 0) cells.push({ i: idx[x], v }); });
            if (!cells.length) return;
            const fills = cells.filter(c => c.v === 1).length;
            const score = fills * 100 + cells.length;
            if (!best || score > best.score) best = { kind, k, idx, clue, line, cells, score };
        };
        for (let r = 0; r < this.rows; r++) consider('row', r, Array.from({ length: this.cols }, (_, c) => r * this.cols + c));
        for (let c = 0; c < this.cols; c++) consider('col', c, Array.from({ length: this.rows }, (_, r) => r * this.cols + c));
        if (!best) return false;
        this.hint = Object.assign({ lines: [[best.kind, best.k]], cells: best.cells }, ChecksumGridMechanic.hintReason(best));
        return true;
    }

    /** "Row 3" / "Column 3", in the player's language. */
    static lineName(kind, k) {
        return UITheme.t(kind === 'row' ? 'Row {n}' : 'Column {n}', { n: k + 1 });
    }

    /** Why a line's cells are decided: { text, vars } for the HINT box. */
    static hintReason(h) {
        const L = h.line.length, clue = h.clue;
        const vars = { line: ChecksumGridMechanic.lineName(h.kind, h.k), clue: clue.length ? clue.join(' ') : '0', len: L };
        const need = clue.reduce((a, b) => a + b, 0) + Math.max(0, clue.length - 1);
        const got = ChecksumGridMechanic.runs(h.line.map(v => (v === 1 ? 1 : 0)));
        const known = h.line.some(v => v >= 0);
        if (!clue.length) return { text: '{line} says 0: none of its cells is filled. Mark them all ✕.', vars };
        if (got.length === clue.length && got.every((v, x) => v === clue[x])) {
            return { text: '{line} already has all its blocks ({clue}). Every other cell in it is empty: mark them ✕.', vars };
        }
        if (clue.length === 1 && clue[0] === L) {
            return { text: '{line} says {clue} and has only {len} cells: every one of them is filled.', vars };
        }
        if (need === L) {
            return { text: '{line} says {clue}. The blocks plus one empty cell between each need {len} cells — the whole line. There is only one way: fill and ✕ exactly as lit.', vars: Object.assign(vars, { len: need }) };
        }
        if (clue.length === 1 && !known) {
            return { text: '{line} has one block of {clue} in {len} cells. Wherever it starts, it always covers the lit middle cells: fill them.', vars };
        }
        if (!known) {
            return { text: '{line} says {clue}. Push its blocks as far left as they go, then as far right: the lit cells are filled both times, so they are filled whatever happens.', vars };
        }
        return { text: '{line} says {clue}. Try every way those blocks fit with the cells you already know: the lit cells come out the same every time.', vars };
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
            this.message = { text: UITheme.t(wrong.size > 1 ? 'AUDIT: {n} WRONG CELLS' : 'AUDIT: {n} WRONG CELL', { n: wrong.size }), color: '#ef4444', t: 2.5 };
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
        if (this.lesson) { this._endLesson(); return; }
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
            undo: { x, y: 170, w: w / 2 - 6, h: 52 },
            hint: { x: x + w / 2 + 6, y: 170, w: w / 2 - 6, h: 52 },
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
        if (inside(B.hint)) { this.giveHint(); return true; }
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
        // HINT: the line in amber, its decided cells outlined (✕ ghosts for empties).
        if (this.hint && !done) {
            const pulse = 0.55 + 0.45 * Math.sin(this.time * 6);
            ctx.fillStyle = 'rgba(250,204,21,0.10)';
            for (const [t, k] of this.hint.lines) {
                if (t === 'row') ctx.fillRect(L.x - L.clueW, L.y + k * L.cell, L.w + L.clueW, L.cell);
                else ctx.fillRect(L.x + k * L.cell, L.y - L.clueH, L.cell, L.h + L.clueH);
            }
            ctx.strokeStyle = `rgba(250,204,21,${pulse})`;
            ctx.lineWidth = 2.5;
            for (const { i, v } of this.hint.cells) {
                const x = L.x + (i % this.cols) * L.cell, y = L.y + Math.floor(i / this.cols) * L.cell, s = L.cell;
                if (v === 1) ctx.strokeRect(x + 3, y + 3, s - 6, s - 6);
                else {
                    const m = s * 0.32;
                    ctx.beginPath();
                    ctx.moveTo(x + m, y + m); ctx.lineTo(x + s - m, y + s - m);
                    ctx.moveTo(x + s - m, y + m); ctx.lineTo(x + m, y + s - m);
                    ctx.stroke();
                }
            }
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
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // Half-width buttons (UNDO, HINT): shrink a long label to fit.
            for (let fs = 17; fs >= 11; fs--) {
                ctx.font = `700 ${fs}px Orbitron, OrbitronTR`;
                const m = ctx.measureText(label).width;
                if (!(typeof m === 'number') || m <= b.w - 14) break;
            }
            ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1);
        };
        ctx.save();
        button(B.fill, UITheme.t('■ FILL'), this.mode === 'fill', '#38bdf8');
        button(B.mark, '✕', this.mode === 'mark', '#94a3b8');
        button(B.undo, UITheme.t('↶ UNDO'), false, '#94a3b8');
        button(B.hint, UITheme.t('💡 HINT'), !!this.hint, '#facc15');
        button(B.audit, 'AUDIT', false, '#f59e0b');
        // GOAL: the win rule and how far along it is
        const G = B.goal, total = this.rows + this.cols, ok = this.linesOk;
        UITheme.panel(ctx, G.x, G.y, G.w, G.h, { chamfer: 8, fill: 'rgba(250,204,21,0.07)', stroke: 'rgba(250,204,21,0.55)' });
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#facc15';
        ctx.font = '700 13px Orbitron, OrbitronTR';
        const tag = UITheme.t('GOAL');
        ctx.fillText(tag, G.x + 12, G.y + 15);
        const tagW = ctx.measureText(tag).width;
        ctx.fillStyle = '#fde68a';
        const goalX = G.x + Math.max(64, 22 + (typeof tagW === 'number' ? tagW : 40));
        const goal = UITheme.t('Turn EVERY number grey');
        UITheme.fitFont(ctx, goal, G.x + G.w - 10 - goalX, 'body', 700);
        ctx.fillText(goal, goalX, G.y + 15);
        ctx.fillStyle = 'rgba(15,23,42,0.9)';
        ctx.fillRect(G.x + 12, G.y + 32, G.w - 24, 12);
        ctx.fillStyle = ok >= total ? '#22c55e' : '#facc15';
        ctx.fillRect(G.x + 12, G.y + 32, (G.w - 24) * ok / total, 12);
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '600 14px Rajdhani';
        ctx.fillText(UITheme.t('{ok} / {total} rows + columns match', { ok, total }), G.x + 12, G.y + 59);
        const x = G.x, y = G.y + G.h + 18;
        ctx.fillStyle = this.auditErrors ? '#fca5a5' : '#94a3b8';
        ctx.font = '700 14px Rajdhani';
        const errors = this.endless
            ? UITheme.t('AUDIT ERRORS {n}  ·  an audit or a hint −{s} s', { n: this.auditErrors, s: this.auditPenalty })
            : UITheme.t('AUDIT ERRORS {n}  ·  no timer, no lives', { n: this.auditErrors });
        UITheme.fitFont(ctx, errors, G.w, 'body', 700);
        ctx.fillText(errors, x, y);
        this._renderRules(ctx, B.rules);
        if (this.message) {
            ctx.fillStyle = this.message.color;
            ctx.font = '700 16px Orbitron, OrbitronTR';
            const words = UITheme.t(this.message.text).split(' ');
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
        if (this.hint && this.result === null) { this._renderHint(ctx, b); return; }
        const t = this.rules;
        if (!t || this.result !== null) return;
        const mode = typeof Coach !== 'undefined' ? Coach.inputMode() : 'desktop';
        const text = t.current(mode);
        UITheme.panel(ctx, b.x, b.y, b.w, b.h, { chamfer: 8, fill: 'rgba(15,23,42,0.85)', stroke: 'rgba(59,130,246,0.5)' });
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#3b82f6';
        ctx.font = '700 13px Orbitron, OrbitronTR';
        ctx.fillText(UITheme.t('RULES'), b.x + 12, b.y + 16);
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

    /** The HINT box (in place of RULES while a hint is up): why the lit cells are decided. */
    _renderHint(ctx, b) {
        const h = this.hint;
        UITheme.panel(ctx, b.x, b.y, b.w, b.h, { chamfer: 8, fill: 'rgba(30,24,6,0.9)', stroke: 'rgba(250,204,21,0.6)' });
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#facc15';
        ctx.font = '700 13px Orbitron, OrbitronTR';
        ctx.fillText(UITheme.t('💡 HINT'), b.x + 12, b.y + 16);
        ctx.fillStyle = '#fde68a';
        // The line's name is translated while drawn, like every other text.
        const vars = h.lines.length ? Object.assign({}, h.vars, { line: ChecksumGridMechanic.lineName(h.lines[0][0], h.lines[0][1]) }) : h.vars;
        const text = UITheme.t(h.text, vars);
        // Long explanations get a smaller size so they stay inside the box.
        for (const [fs, lh] of [[16, 19], [15, 17], [14, 16], [13, 15]]) {
            ctx.font = `600 ${fs}px Rajdhani`;
            const lines = [];
            let line = '';
            for (const w of text.split(' ')) {
                const s = line ? line + ' ' + w : w;
                const m = ctx.measureText(s).width;
                if ((typeof m === 'number' ? m : s.length * 7) > b.w - 24 && line) { lines.push(line); line = w; } else line = s;
            }
            lines.push(line);
            if (34 + lines.length * lh <= b.h || fs === 13) {
                lines.forEach((l, k) => ctx.fillText(l, b.x + 12, b.y + 40 + k * lh));
                break;
            }
        }
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
        if (kind === 'tools') return [pad(B.undo), pad(B.hint), pad(B.audit)];
        // A lesson step: { lines: [['row' | 'col', k], …] } — the lines and their checksums.
        if (kind && kind.lines) {
            return kind.lines.map(([t, k]) => (t === 'row'
                ? { x: L.x - L.clueW, y: L.y + k * L.cell, w: L.w + L.clueW, h: L.cell }
                : { x: L.x + k * L.cell, y: L.y - L.clueH, w: L.cell, h: L.h + L.clueH }));
        }
        if (kind === 'goal') return [pad(B.goal), clueRow, clueCol];
        return [];
    }
}

ChecksumGridMechanic.SOUND = { soundFreq: 620, soundType: 'triangle' };

// The lesson's map: a shield, solved one line at a time (rows / columns 1-based in the text).
ChecksumGridMechanic.LESSON_MAP = ['.###.', '#####', '#.#.#', '#####', '..#..'];

// Each map step lights its lines and waits until its `goal` cells hold
// [row, col, 1 = filled | 0 = ✕]; the last one marks the lesson seen.
ChecksumGridMechanic.LESSON = [
    { kind: 'info', rects: 'clues', text: 'Rebuild the clean memory map. Each number is a CHECKSUM: the sizes of the filled blocks in that row (left) or column (top), in order. This small map shows you how, one step at a time.' },
    { kind: 'info', rects: 'clues', text: '"1 1 1" means: a block of 1, then a block of 1, then a block of 1. Between two blocks there is ALWAYS at least one empty cell.' },
    { kind: 'g1', rects: { lines: [['row', 1]] }, goal: [[1, 0, 1], [1, 1, 1], [1, 2, 1], [1, 3, 1], [1, 4, 1]],
        text: { desktop: 'Row 2 says 5, and it has only 5 cells: all of them are filled. Pick FILL and drag across the row.', touch: 'Row 2 says 5, and it has only 5 cells: all of them are filled. Pick FILL and drag your finger across the row.' } },
    { kind: 'g2', rects: { lines: [['row', 3]] }, goal: [[3, 0, 1], [3, 1, 1], [3, 2, 1], [3, 3, 1], [3, 4, 1]],
        text: 'Row 4 says 5 too: fill it the same way.' },
    { kind: 'g3', rects: { lines: [['col', 2]] }, goal: [[0, 2, 1], [2, 2, 1], [4, 2, 1]],
        text: 'Column 3 says 5: fill it from top to bottom.' },
    { kind: 'info', rects: 'goal', text: 'See? The numbers of finished rows and columns turned GREY. That is the goal: turn EVERY number grey.' },
    { kind: 'g4', rects: { lines: [['row', 2]] }, goal: [[2, 0, 1], [2, 4, 1], [2, 1, 0], [2, 3, 0]],
        text: { desktop: 'Row 3 says 1 1 1: three blocks and the two gaps between them need 1+1+1+2 = 5 cells — the whole row. So it must be ■ ✕ ■ ✕ ■. Fill the two ends, then mark the gaps ✕ (pick ✕, or right click).', touch: 'Row 3 says 1 1 1: three blocks and the two gaps between them need 1+1+1+2 = 5 cells — the whole row. So it must be ■ ✕ ■ ✕ ■. Fill the two ends, then pick ✕ and mark the gaps.' } },
    { kind: 'g5', rects: { lines: [['col', 0], ['col', 4]] }, goal: [[0, 0, 0], [4, 0, 0], [0, 4, 0], [4, 4, 0]],
        text: 'Columns 1 and 5 say 3 and already have their 3: they are done (grey). Their other cells must be empty — mark the top and bottom cell of both with ✕.' },
    { kind: 'info', rects: 'tools', text: 'Stuck on a real map? HINT lights a row or column you can solve and tells you why. AUDIT shows wrong cells, but every audit that finds a mistake costs a star. UNDO takes back a move.' },
    { kind: 'g6', key: 'tutorial', rects: { lines: [['row', 0]] }, goal: [[0, 1, 1], [0, 2, 1], [0, 3, 1]],
        text: 'Last one. Row 1 says 3, and both of its ends are ✕ now: the 3 fits only in the middle. Fill it — and every number turns grey.' }
];

if (typeof module !== 'undefined' && module.exports) module.exports = ChecksumGridMechanic;
