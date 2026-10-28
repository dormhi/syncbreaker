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
   A row or column that turns grey with a stroke gets ✕ in its empty cells
   by itself (part of that stroke, so UNDO takes them back too); a line
   that was grey already is left alone. Right click marks ✕ and, held,
   drags along a line like FILL (`wantsAltDrag`; beta feedback 2026-10-28).
   HINT (beta feedback 2026-10-27: players did not get how to play) works
   in two presses (2026-10-28): the first lights a row or column that can
   be solved from what is known and lets the player look for the cells;
   the second outlines the cells it decides and says why ("5 of 5 cells",
   "a block of 4 in 6 covers the middle" …), sliding its blocks to both
   ends when that is the reason. Free in the campaign; in Endless each new
   hint costs time like an audit (the host counts `hints`).
   Left alone for a while on a campaign map, the HINT button glows and the
   RULES box says HINT is there (`nudge`).
   Keyboard: arrows, SPACE fill, X mark, Z / Backspace undo, Enter audit.

   RULES box (right panel): rotating reminders of how the game works
   (TipBar.RULES.checksum, some with a small drawn example `pic`), always
   on screen; a tap shows the next one.

   wantsDrag: the host sends 'down' / 'move' / 'up' / 'cancel'.

   Lesson (Coach, useCoach; rebuilt 2026-10-28 for players who never saw a
   nonogram): four chapters, each on its own small map (CHAPTERS):
   reading the numbers (single rows), sure cells (a block slid to both
   ends, `slide`), rows and columns helping each other, and a small map on
   your own (HINT allowed). Each step lights a line and waits until the
   player has done it; a move against the step is taken back. Shown once
   on stage 1 (sb_coach_checksum); the LESSON button replays it any time
   in the campaign (the map waits as it was), the GOAL box flips between
   chapters and ✕ EXIT leaves it.
   ========================================= */

const _MechanicBaseCG = (typeof Mechanic !== 'undefined') ? Mechanic : class {};

const CG_EMPTY = 0, CG_FILL = 1, CG_MARK = 2;

class ChecksumGridMechanic extends _MechanicBaseCG {
    constructor(options = {}) {
        super();
        this.rng = options.rng || Math.random;

        this.rows = options.rows || 8;
        this.cols = options.cols || this.rows;
        this.stageSize = { rows: this.rows, cols: this.cols };
        this.density = options.density || 0.55;        // share of filled cells before smoothing
        this.smooth = options.smooth !== undefined ? options.smooth : 1;   // blob passes (0 = raw)
        this.minSweeps = options.minSweeps || 3;       // line-solver sweeps the puzzle needs
        this.maxSweeps = options.maxSweeps || 99;
        this.endless = !!options.endless;              // Endless: a time pool, audit errors cost time
        this.auditPenalty = options.auditPenalty || 0;
        this.wantsDrag = true;
        this.wantsAltDrag = true;      // right button held: ✕ along a line
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
        this.solution = null;
        this.idle = 0;                // seconds without a move (campaign maps): the HINT nudge
        this.nudge = false;
        this.rowsOnly = false;        // lesson drills: rows only, the column numbers hidden
        this.coach = null;
        this.lesson = null;           // { ch, saved } while the lesson runs
        if (this.coachStore && this.firstStage && !this.coachStore.seen('tutorial')) this.startLesson(0);
        if (!this.lesson) this._newPuzzle();
    }

    // ── Lesson ──

    /** Open the lesson at chapter `ch`; a map in play waits as it is. */
    startLesson(ch = 0) {
        if (this.endless || this.result !== null || typeof Coach === 'undefined') return false;
        if (!this.lesson) {
            const keep = this.solution ? {
                rows: this.rows, cols: this.cols, solution: this.solution, rowClues: this.rowClues, colClues: this.colClues,
                sweeps: this.sweeps, cells: this.cells.slice(), undo: this.undo, mode: this.mode
            } : null;
            this.lesson = { ch: 0, saved: keep };
        }
        this._chapter(ch);
        return true;
    }

    /** Set up one chapter: its map (hand-made, or a small generated one) and its steps. */
    _chapter(n) {
        const def = ChecksumGridMechanic.CHAPTERS[n];
        this.lesson.ch = n;
        this.stroke = null;
        this.undo = [];
        this.hint = null;
        this.audited = null;
        this.message = null;
        this.mode = 'fill';
        this.cursor = { r: 0, c: 0 };
        this.rowsOnly = !!def.rowsOnly;
        if (def.map) {
            this.rows = def.map.length;
            this.cols = def.map[0].length;
            this.solution = def.map.join('').split('').map(ch => (ch === '#' ? 1 : 0));
            const { R, C } = this._clues(this.solution);
            this.rowClues = R;
            this.colClues = C;
            this.sweeps = 0;
            this.cells = new Array(this.rows * this.cols).fill(CG_EMPTY);
        } else {
            const keep = { minSweeps: this.minSweeps, maxSweeps: this.maxSweeps, density: this.density, smooth: this.smooth };
            this.rows = this.cols = def.size;
            Object.assign(this, def.puzzle);
            this._newPuzzle();
            Object.assign(this, keep);
        }
        this.coach = new Coach(this.coachStore).push(...def.steps);
    }

    /** A chapter's last step passed: the next chapter, or the end of the lesson. */
    _chapterDone() {
        if (this.lesson.ch + 1 < ChecksumGridMechanic.CHAPTERS.length) this._chapter(this.lesson.ch + 1);
        else this._endLesson();
    }

    /** Leave the lesson (done or ✕ EXIT): back to the waiting map, or the stage's first map. */
    _endLesson() {
        const saved = this.lesson.saved;
        this.lesson = null;
        this.rowsOnly = false;
        if (this.coachStore) this.coachStore.mark('tutorial');
        this.stroke = null;
        this.hint = null;
        this.audited = null;
        this.message = null;
        this.cursor = { r: 0, c: 0 };
        this.idle = 0;
        if (saved) {
            Object.assign(this, saved);
        } else {
            this.rows = this.stageSize.rows;
            this.cols = this.stageSize.cols;
            this.undo = [];
            this.mode = 'fill';
            this._newPuzzle();
        }
        this.coach = new Coach(this.coachStore).push({ kind: 'info', rects: 'goal', text: saved
            ? 'Back to your map — everything is as you left it. Press HINT whenever you are stuck.'
            : 'Lesson complete! Now a real map: no timer, no lives. Work line by line the same way — and press HINT whenever you are stuck.' });
    }

    /** A lesson step waiting for moves on the map: passed once its cells are right. */
    _lessonCheck() {
        const step = this.coach && this.coach.step;
        if (step && step.kind === 'solved' && this.linesOk >= this.lineCount) { this.coach.event('solved'); return; }
        if (!step || !step.goal) return;
        const done = step.goal.every(([r, c, v]) => this.cells[r * this.cols + c] === (v ? CG_FILL : CG_MARK));
        if (done) this.coach.event(step.kind);
    }

    /** A lesson move that is taken back: against the map, or (an `only` step) outside the lit cells. */
    _lessonWrong(i) {
        const step = this.coach && this.coach.step;
        const v = this.cells[i];
        if (step && step.only && step.goal) {
            if (v === CG_EMPTY) return false;
            const g = step.goal.find(([r, c]) => r * this.cols + c === i);
            return !g || v !== (g[2] ? CG_FILL : CG_MARK);
        }
        return this._wrong(i);
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

    /**
     * The blocks of a line pushed as far left and as far right as they go
     * with the known cells: { left, right } start cells per block, or null.
     * In every fitting placement block j starts between the two, so the
     * cells it covers in both are filled (the lesson's and HINT's slide).
     */
    static extremes(clue, cells) {
        const first = (cl, ce) => {
            const L = ce.length, k = cl.length, dead = new Set();
            const go = (i, j) => {
                if (j === k) {
                    for (let x = i; x < L; x++) if (ce[x] === 1) return null;
                    return [];
                }
                const key = i * (k + 1) + j;
                if (dead.has(key)) return null;
                const len = cl[j];
                for (let s = i; s + len <= L; s++) {
                    if (s > i && ce[s - 1] === 1) break;
                    let ok = true;
                    for (let x = s; x < s + len; x++) if (ce[x] === 0) { ok = false; break; }
                    if (!ok || (s + len < L && ce[s + len] === 1)) continue;
                    const rest = go(Math.min(L, s + len + 1), j + 1);
                    if (rest) return [s].concat(rest);
                }
                dead.add(key);
                return null;
            };
            return go(0, 0);
        };
        const L = cells.length, k = clue.length;
        const left = first(clue, cells);
        const back = first(clue.slice().reverse(), cells.slice().reverse());
        if (!left || !back) return null;
        const right = back.map((s, j) => L - s - clue[k - 1 - j]).reverse();
        return { left, right };
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
        if (kind === 'col' && this.rowsOnly) return false;
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

    /** How many lines must match: every row and column (lesson drills: rows only). */
    get lineCount() { return this.rowsOnly ? this.rows : this.rows + this.cols; }

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
        // Lines grey before the stroke: only the ones it turns grey get auto ✕.
        const okBefore = new Set();
        for (let k = 0; k < this.rows; k++) if (this.lineOk('row', k)) okBefore.add('r' + k);
        for (let k = 0; k < this.cols; k++) if (this.lineOk('col', k)) okBefore.add('c' + k);
        this.stroke = { r, c, from, to, axis: null, changes: [], okBefore };
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
        // Lesson: a move against the step is taken back with a nudge.
        if (this.lesson && s.changes.some(ch => this._lessonWrong(ch.i))) {
            for (let k = s.changes.length - 1; k >= 0; k--) this.cells[s.changes[k].i] = s.changes[k].was;
            const step = this.coach && this.coach.step;
            this.message = { text: (step && step.nudge) || ChecksumGridMechanic.CHAPTERS[this.lesson.ch].nudge, color: '#fbbf24', t: 3 };
            if (typeof Sound !== 'undefined' && Sound.playMiss) Sound.playMiss();
            return;
        }
        if (s.changes.length) {
            this._autoMark(s);
            this.undo.push(s.changes);
            this.hint = null;
            this.idle = 0;
            if (typeof Sound !== 'undefined' && Sound.playClick) Sound.playClick();
        }
        if (this.lesson) this._lessonCheck();
        this._checkDone();
    }

    /** Lines this stroke turned grey: their empty cells get ✕ (in the stroke, for UNDO). */
    _autoMark(s) {
        const mark = (i) => {
            if (this.cells[i] !== CG_EMPTY) return;
            s.changes.push({ i, was: CG_EMPTY });
            this.cells[i] = CG_MARK;
        };
        for (let r = 0; r < this.rows; r++) {
            if (!s.okBefore.has('r' + r) && this.lineOk('row', r)) for (let c = 0; c < this.cols; c++) mark(r * this.cols + c);
        }
        for (let c = 0; c < this.cols; c++) {
            if (!s.okBefore.has('c' + c) && this.lineOk('col', c)) for (let r = 0; r < this.rows; r++) mark(r * this.cols + c);
        }
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
        this.idle = 0;
        return true;
    }

    // ── Hint ──

    /**
     * HINT: a row or column whose cells follow from what is already on the
     * map. The first press only lights the line (step 1: the player looks
     * for the cells); pressing again with the map unchanged shows the
     * cells it decides and why (step 2). With a wrong cell on the map it
     * only says so (AUDIT finds it). Fills come first: they are what wins.
     */
    giveHint() {
        if (this.busy) return false;
        if (this.lesson && !ChecksumGridMechanic.CHAPTERS[this.lesson.ch].free) {
            this.message = { text: 'In the lesson, follow the lit line. HINT works on maps you solve yourself.', color: '#fbbf24', t: 3 };
            return false;
        }
        this.idle = 0;
        const sig = this.cells.join('');
        if (this.hint && this.hint.step === 1 && this.hint.sig === sig) { this.hint.step = 2; return true; }
        this.hints++;
        if (this.cells.some((v, i) => this._wrong(i))) {
            this.hint = { step: 2, sig, lines: [], cells: [], text: 'Something does not add up: a cell on the map is wrong. UNDO your last moves, or use AUDIT to find it.' };
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
        if (!this.rowsOnly) for (let c = 0; c < this.cols; c++) consider('col', c, Array.from({ length: this.rows }, (_, r) => r * this.cols + c));
        if (!best) return false;
        const why = ChecksumGridMechanic.hintReason(best);
        this.hint = { step: 1, sig, lines: [[best.kind, best.k]], cells: best.cells, text: why.text, vars: why.vars,
            slide: why.slide && best.cells.some(c => c.v === 1) ? [best.kind, best.k] : null };
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
        // The overlap reasons slide the blocks on the map (step 2).
        if (clue.length === 1 && !known) {
            return { text: '{line} has one block of {clue} in {len} cells. Watch it slide: wherever it starts, it always covers the yellow middle cells. Fill them.', vars, slide: true };
        }
        if (!known) {
            return { text: '{line} says {clue}. Watch its blocks pushed as far left as they go, then as far right: the yellow cells are filled both times, so they are filled whatever happens.', vars, slide: true };
        }
        return { text: '{line} says {clue}. Try every way those blocks fit with the cells you already know: the lit cells come out the same every time. Watch the slide.', vars, slide: true };
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
        if (this.linesOk < this.lineCount) return;
        if (this.lesson) {
            if (ChecksumGridMechanic.CHAPTERS[this.lesson.ch].free) this._chapterDone();
            else this._lessonCheck();
            return;
        }
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
        if (this.coach) {
            this.coach.update(h);
            if (!this.coach.active) {
                this.coach = null;
                // A guided chapter ends with its steps; a free one when its map is solved.
                if (this.lesson && !ChecksumGridMechanic.CHAPTERS[this.lesson.ch].free) this._chapterDone();
            }
        }
        if (this.lesson && !this.stroke) this._lessonCheck();
        // Nudge: a campaign map left alone for a while points at HINT.
        if (!this.lesson && !this.endless && this.result === null && !this.hint && !this.stroke && !(this.coach && this.coach.active)) this.idle += h;
        else if (this.lesson) this.idle = 0;
        this.nudge = this.idle >= ChecksumGridMechanic.NUDGE_AFTER;
        if (this.message) { this.message.t -= h; if (this.message.t <= 0) this.message = null; }
        if (this.audited) { this.audited.t -= h; if (this.audited.t <= 0) this.audited = null; }
        if (this.reveal > 0 && this.reveal < 1) this.reveal = Math.min(1, this.reveal + h * 1.5);
        if (this.rules) this.rules.update(h);
    }

    // ── Layout ──

    layout() {
        const maxRow = Math.max(1, ...this.rowClues.map(c => c.length));
        const maxCol = Math.max(1, ...this.colClues.map(c => c.length));
        const clueW = maxRow * 22 + 14, clueH = this.rowsOnly ? 6 : maxCol * 20 + 10;
        const left = 82, right = 662, top = 84, bottom = 628;   // top clears the host subtitle
        const cell = Math.floor(Math.min((right - left - clueW) / this.cols, (bottom - top - clueH) / this.rows, 46));
        const w = cell * this.cols, h = cell * this.rows;
        const x = left + clueW + (right - left - clueW - w) / 2;
        const y = top + clueH + (bottom - top - clueH - h) / 2;
        return { x, y, w, h, cell, clueW, clueH };
    }

    buttons() {
        const x = 690, w = 230, half = w / 2 - 6;
        return {
            fill: { x, y: 96, w: half, h: 60 },
            mark: { x: x + w / 2 + 6, y: 96, w: half, h: 60 },
            undo: { x, y: 170, w: half, h: 52 },
            hint: { x: x + w / 2 + 6, y: 170, w: half, h: 52 },
            // LESSON replays the lesson (campaign only; Endless keeps AUDIT full width).
            audit: { x, y: 236, w: this.endless ? w : half, h: 60 },
            lesson: this.endless ? null : { x: x + w / 2 + 6, y: 236, w: half, h: 60 },
            goal: { x, y: 308, w, h: 76 },
            rules: { x, y: 458, w, h: 146 }
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
        const B = this.buttons();
        const inside = (b) => !!b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
        // LESSON / ✕ EXIT and the chapter arrows work even while a lesson card is up.
        if (inside(B.lesson)) { if (this.lesson) this._endLesson(); else this.startLesson(0); return true; }
        if (this.lesson && inside(B.goal)) {
            const n = this.lesson.ch, part = (x - B.goal.x) / B.goal.w;
            if (part < 0.34 && n > 0) this._chapter(n - 1);
            else if (part > 0.66 && n + 1 < ChecksumGridMechanic.CHAPTERS.length) this._chapter(n + 1);
            return true;
        }
        if (this.coach && this.coach.blocks) { this.coach.next(); return true; }
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

    /**
     * Right click: always ✕ on that cell. With `phase` 'down' (right button
     * held, from the host) the stroke stays open and moves extend it.
     */
    handleAltPointer(x, y, phase) {
        if (this.busy) return false;
        const at = this.cellAt(x, y);
        if (!at) return false;
        this.kbd = false;
        this._begin(at.r, at.c, true);
        if (phase !== 'down') this._end();
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
        for (let c = 0; c < (this.rowsOnly ? 0 : this.cols); c++) {
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
        // Slide: a lesson step's line, or the line of a HINT's second step.
        const step = this.coach && this.coach.active ? this.coach.step : null;
        const slide = (step && step.slide) || (this.hint && this.hint.step === 2 && this.hint.slide);
        if (slide && !done) this._renderSlide(ctx, L, slide[0], slide[1]);
        // HINT: the line in amber; on the second press its decided cells outlined (✕ ghosts for empties).
        if (this.hint && !done) {
            const pulse = 0.55 + 0.45 * Math.sin(this.time * 6);
            ctx.fillStyle = this.hint.step === 1 ? 'rgba(250,204,21,0.16)' : 'rgba(250,204,21,0.10)';
            for (const [t, k] of this.hint.lines) {
                if (t === 'row') ctx.fillRect(L.x - L.clueW, L.y + k * L.cell, L.w + L.clueW, L.cell);
                else ctx.fillRect(L.x + k * L.cell, L.y - L.clueH, L.cell, L.h + L.clueH);
            }
            ctx.strokeStyle = `rgba(250,204,21,${pulse})`;
            ctx.lineWidth = 2.5;
            if (this.hint.step === 1) {
                for (const [t, k] of this.hint.lines) {
                    if (t === 'row') ctx.strokeRect(L.x - L.clueW + 2, L.y + k * L.cell + 1, L.w + L.clueW - 2, L.cell - 2);
                    else ctx.strokeRect(L.x + k * L.cell + 1, L.y - L.clueH + 2, L.cell - 2, L.h + L.clueH - 2);
                }
            }
            for (const { i, v } of (this.hint.step === 2 ? this.hint.cells : [])) {
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

    /**
     * A line's blocks sliding from as far left (up) as they go to as far
     * right (down) and back; the cells a block covers at both ends glow
     * yellow: they are filled wherever the blocks really are. Reduced
     * motion: the two ends swap without moving.
     */
    _renderSlide(ctx, L, kind, k) {
        const clue = kind === 'row' ? this.rowClues[k] : this.colClues[k];
        if (!clue || !clue.length) return;
        const n = kind === 'row' ? this.cols : this.rows;
        const idx = Array.from({ length: n }, (_, x) => (kind === 'row' ? k * this.cols + x : x * this.cols + k));
        const ex = ChecksumGridMechanic.extremes(clue, idx.map(i => (this.cells[i] === CG_FILL ? 1 : this.cells[i] === CG_MARK ? 0 : -1)));
        if (!ex) return;
        const p = (this.time % 3.6) / 3.6;
        const ease = (t) => t * t * (3 - 2 * t);
        const u = UITheme.reducedMotion ? (p < 0.5 ? 0 : 1)
            : p < 0.15 ? 0 : p < 0.45 ? ease((p - 0.15) / 0.3) : p < 0.65 ? 1 : p < 0.95 ? 1 - ease((p - 0.65) / 0.3) : 0;
        const at = (x) => (kind === 'row' ? { x: L.x + x * L.cell, y: L.y + k * L.cell } : { x: L.x + k * L.cell, y: L.y + x * L.cell });
        ctx.save();
        ctx.fillStyle = 'rgba(250,204,21,0.55)';
        clue.forEach((len, j) => {
            for (let x = ex.right[j]; x < ex.left[j] + len; x++) { const q = at(x); ctx.fillRect(q.x + 3, q.y + 3, L.cell - 6, L.cell - 6); }
        });
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 3;
        clue.forEach((len, j) => {
            const q = at(ex.left[j] + (ex.right[j] - ex.left[j]) * u);
            const w = kind === 'row' ? len * L.cell : L.cell, h = kind === 'row' ? L.cell : len * L.cell;
            ctx.strokeRect(q.x + 1.5, q.y + 1.5, w - 3, h - 3);
        });
        ctx.restore();
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
        const guided = this.lesson && !ChecksumGridMechanic.CHAPTERS[this.lesson.ch].free;
        if (guided) ctx.globalAlpha = 0.45;
        button(B.hint, UITheme.t('💡 HINT'), !!this.hint || this.nudge, '#facc15');
        ctx.globalAlpha = 1;
        if (this.nudge) {
            // Left alone for a while: HINT glows (steady with reduced motion).
            const glow = UITheme.reducedMotion ? 1 : 0.55 + 0.45 * Math.sin(this.time * 4);
            ctx.strokeStyle = `rgba(250,204,21,${glow})`;
            ctx.lineWidth = 3;
            ctx.strokeRect(B.hint.x - 3, B.hint.y - 3, B.hint.w + 6, B.hint.h + 6);
        }
        button(B.audit, 'AUDIT', false, '#f59e0b');
        if (B.lesson) button(B.lesson, UITheme.t(this.lesson ? '✕ EXIT' : '? LESSON'), !!this.lesson, '#2dd4bf');
        const G = B.goal;
        if (this.lesson) this._renderLessonNav(ctx, G);
        else this._renderGoal(ctx, G);
        const x = G.x, y = G.y + G.h + 18;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = this.auditErrors && !this.lesson ? '#fca5a5' : '#94a3b8';
        ctx.font = '700 14px Rajdhani';
        const errors = this.lesson ? UITheme.t('LESSON  ·  mistakes here cost nothing')
            : this.endless
                ? UITheme.t('AUDIT ERRORS {n}  ·  an audit or a hint −{s} s', { n: this.auditErrors, s: this.auditPenalty })
                : UITheme.t('AUDIT ERRORS {n}  ·  no timer, no lives', { n: this.auditErrors });
        UITheme.fitFont(ctx, errors, G.w, 'body', 700);
        ctx.fillText(errors, x, y);
        this._renderRules(ctx, B.rules);
        if (this.message) {
            // Two lines at most, between the audit line and the RULES box.
            ctx.fillStyle = this.message.color;
            const text = UITheme.t(this.message.text);
            for (const fs of [17, 16, 15, 14, 13]) {
                ctx.font = `700 ${fs}px Rajdhani`;
                const lines = [];
                let line = '';
                for (const w of text.split(' ')) {
                    const t = line ? line + ' ' + w : w;
                    const m = ctx.measureText(t).width;
                    if ((typeof m === 'number' ? m : t.length * 8) > G.w && line) { lines.push(line); line = w; } else line = t;
                }
                lines.push(line);
                if (lines.length <= 2 || fs === 13) { lines.slice(0, 2).forEach((l, k) => ctx.fillText(l, x, y + 22 + k * 18)); break; }
            }
        }
        ctx.restore();
    }

    /** GOAL: the win rule and how far along it is. */
    _renderGoal(ctx, G) {
        const total = this.lineCount, ok = this.linesOk;
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
    }

    /** The GOAL box during the lesson: the chapter, its place among the four, ‹ › to flip. */
    _renderLessonNav(ctx, G) {
        const n = this.lesson.ch, all = ChecksumGridMechanic.CHAPTERS.length;
        UITheme.panel(ctx, G.x, G.y, G.w, G.h, { chamfer: 8, fill: 'rgba(45,212,191,0.08)', stroke: 'rgba(45,212,191,0.6)' });
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#2dd4bf';
        ctx.font = '700 13px Orbitron, OrbitronTR';
        const tag = UITheme.t('LESSON');
        ctx.fillText(tag, G.x + 12, G.y + 15);
        const tagW = ctx.measureText(tag).width;
        const titleX = G.x + Math.max(70, 22 + (typeof tagW === 'number' ? tagW : 50));
        const title = UITheme.t(ChecksumGridMechanic.CHAPTERS[n].title);
        ctx.fillStyle = '#ccfbf1';
        UITheme.fitFont(ctx, title, G.x + G.w - 10 - titleX, 'body', 700);
        ctx.fillText(title, titleX, G.y + 15);
        const segW = (G.w - 24 - (all - 1) * 6) / all;
        for (let k = 0; k < all; k++) {
            ctx.fillStyle = k < n ? 'rgba(45,212,191,0.55)' : k === n ? '#2dd4bf' : 'rgba(15,23,42,0.9)';
            ctx.fillRect(G.x + 12 + k * (segW + 6), G.y + 32, segW, 12);
        }
        ctx.font = '700 18px Rajdhani';
        ctx.fillStyle = n > 0 ? '#ccfbf1' : 'rgba(148,163,184,0.35)';
        ctx.fillText('‹', G.x + 14, G.y + 60);
        ctx.textAlign = 'right';
        ctx.fillStyle = n + 1 < all ? '#ccfbf1' : 'rgba(148,163,184,0.35)';
        ctx.fillText('›', G.x + G.w - 14, G.y + 60);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '600 14px Rajdhani';
        ctx.fillText(UITheme.t('Chapter {n} of {all}', { n: n + 1, all }), G.x + G.w / 2, G.y + 59);
    }

    /** Rotating rule reminder in a framed box; a tap moves to the next one. */
    _renderRules(ctx, b) {
        if (this.hint && this.result === null) { this._renderHint(ctx, b); return; }
        const t = this.rules;
        if (!t || this.result !== null) return;
        if (this.nudge) {
            this._renderCard(ctx, b, { tag: UITheme.t('💡 STUCK?'), color: '#facc15', fill: 'rgba(30,24,6,0.9)', stroke: 'rgba(250,204,21,0.6)',
                text: UITheme.t('Press 💡 HINT: it lights a line you can solve right now. Press it again to see the cells and why. It costs nothing.') });
            return;
        }
        const mode = typeof Coach !== 'undefined' ? Coach.inputMode() : 'desktop';
        const tip = t.tips[t.index];
        this._renderCard(ctx, b, { tag: UITheme.t('RULES'), color: '#3b82f6', fill: 'rgba(15,23,42,0.85)', stroke: 'rgba(59,130,246,0.5)',
            count: `${t.index + 1}/${t.tips.length}  ▸`, text: t.current(mode), pic: tip && tip.pic, alpha: Math.max(0.15, t.alpha) });
    }

    /** The HINT box (in place of RULES while a hint is up): where to look, then why the lit cells are decided. */
    _renderHint(ctx, b) {
        const h = this.hint;
        // The line's name is translated while drawn, like every other text.
        const vars = h.lines.length ? Object.assign({}, h.vars, { line: ChecksumGridMechanic.lineName(h.lines[0][0], h.lines[0][1]) }) : h.vars;
        const text = h.step === 1
            ? UITheme.t('Look at {line}: it says {clue}. Some of its cells are already certain — which ones? Press HINT again to see them and why.', vars)
            : UITheme.t(h.text, vars);
        this._renderCard(ctx, b, { tag: UITheme.t('💡 HINT'), color: '#facc15', fill: 'rgba(30,24,6,0.9)', stroke: 'rgba(250,204,21,0.6)',
            count: h.step === 1 ? '1/2' : (h.lines.length ? '2/2' : ''), text, ink: '#fde68a' });
    }

    /**
     * A framed box in the right panel: a tag, an optional counter, an
     * optional drawn example (`pic`: lines of a checksum and cells) and
     * text that shrinks until it fits.
     */
    _renderCard(ctx, b, o) {
        UITheme.panel(ctx, b.x, b.y, b.w, b.h, { chamfer: 8, fill: o.fill, stroke: o.stroke });
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = o.color;
        ctx.font = '700 13px Orbitron, OrbitronTR';
        ctx.fillText(o.tag, b.x + 12, b.y + 16);
        if (o.count) {
            ctx.fillStyle = '#64748b';
            ctx.font = '600 12px Rajdhani';
            ctx.textAlign = 'right';
            ctx.fillText(o.count, b.x + b.w - 12, b.y + 16);
            ctx.textAlign = 'left';
        }
        ctx.globalAlpha = o.alpha !== undefined ? o.alpha : 1;
        let top = b.y + 38;
        if (o.pic) top = this._renderPic(ctx, b.x + 12, top - 4, o.pic) + 12;
        ctx.fillStyle = o.ink || '#cbd5e1';
        for (const [fs, lh] of [[16, 19], [15, 17], [14, 16], [13, 15]]) {
            ctx.font = `600 ${fs}px Rajdhani`;
            const lines = [];
            let line = '';
            for (const w of o.text.split(' ')) {
                const s = line ? line + ' ' + w : w;
                const m = ctx.measureText(s).width;
                if ((typeof m === 'number' ? m : s.length * 7) > b.w - 24 && line) { lines.push(line); line = w; } else line = s;
            }
            lines.push(line);
            if (top - b.y + (lines.length - 1) * lh + 12 <= b.h || fs === 13) {
                lines.forEach((l, k) => ctx.fillText(l, b.x + 12, top + k * lh));
                break;
            }
        }
        ctx.globalAlpha = 1;
    }

    /**
     * A small drawn example: each line is { clue, cells, mark } — cells
     * '#' filled, 'x' ✕, '.' empty, 'S' sure (yellow); mark 'ok' greys the
     * checksum and adds ✓, 'bad' adds a red ✗. Returns the y below it.
     */
    _renderPic(ctx, x, y, pic) {
        const s = 15, gap = 2;
        pic.forEach((p, n) => {
            const cy = y + n * (s + 4) + s / 2;
            ctx.textAlign = 'right';
            ctx.font = '700 15px Rajdhani';
            ctx.fillStyle = p.mark === 'ok' ? 'rgba(100,116,139,0.8)' : '#e2e8f0';
            ctx.fillText(p.clue, x + 40, cy + 1);
            for (let k = 0; k < p.cells.length; k++) {
                const cx = x + 48 + k * (s + gap), ch = p.cells[k];
                ctx.fillStyle = 'rgba(30,41,59,0.9)';
                ctx.fillRect(cx, cy - s / 2, s, s);
                if (ch === '#' || ch === 'S') {
                    ctx.fillStyle = ch === 'S' ? '#facc15' : '#38bdf8';
                    ctx.fillRect(cx + 1.5, cy - s / 2 + 1.5, s - 3, s - 3);
                } else if (ch === 'x') {
                    ctx.strokeStyle = 'rgba(148,163,184,0.8)';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(cx + 4, cy - 4); ctx.lineTo(cx + s - 4, cy + 4);
                    ctx.moveTo(cx + s - 4, cy - 4); ctx.lineTo(cx + 4, cy + 4);
                    ctx.stroke();
                }
            }
            if (p.mark) {
                ctx.textAlign = 'left';
                ctx.font = '700 16px Rajdhani';
                ctx.fillStyle = p.mark === 'bad' ? '#ef4444' : '#22c55e';
                ctx.fillText(p.mark === 'bad' ? '✗' : '✓', x + 48 + p.cells.length * (s + gap) + 6, cy + 1);
            }
        });
        ctx.textAlign = 'left';
        return y + pic.length * (s + 4);
    }

    _coachRects(kind) {
        const L = this.layout(), B = this.buttons();
        const pad = (b) => ({ x: b.x, y: b.y, w: b.w, h: b.h });
        const clueRow = { x: L.x - L.clueW, y: L.y, w: L.clueW - 4, h: L.h };
        const clueCol = { x: L.x, y: L.y - L.clueH, w: L.w, h: L.clueH - 4 };
        const board = { x: L.x, y: L.y, w: L.w, h: L.h };
        if (kind === 'clues') return this.rowsOnly ? [clueRow] : [clueRow, clueCol];
        if (kind === 'board') return [board];
        if (kind === 'lesson') return B.lesson ? [pad(B.lesson), pad(B.goal)] : [];
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

// Seconds a campaign map may sit without a move before HINT is pointed out.
ChecksumGridMechanic.NUDGE_AFTER = 60;

// The lesson (beta feedback 2026-10-28: players who never saw a nonogram
// were lost). Four chapters, one idea each, on their own small maps:
// `map` rows ('#' filled), or `size` + `puzzle` for a generated map;
// `rowsOnly` hides the column numbers (single-row drills). A step lights
// its lines and waits until its `goal` cells hold [row, col, 1 = filled |
// 0 = ✕]; `only` takes back any other move (sure cells only); `slide`
// slides that line's blocks; 'solved' waits for the whole map. Rows and
// columns are 1-based in the text. `nudge` is said when a move is taken back.
const cgRow = (r, cols, v = 1) => cols.map(c => [r, c, v]);
ChecksumGridMechanic.CHAPTERS = [
    {
        title: 'Reading the numbers',
        rowsOnly: true,
        map: ['#####', '###.#', '.....', '##.##'],
        nudge: 'Not that cell — follow the lit row.',
        steps: [
            { kind: 'info', rects: 'clues', text: 'Rebuild the clean memory map. Each number on the left is a CHECKSUM of its row: the lengths of its filled blocks, from left to right. Here you only read rows — columns come later.' },
            { kind: 'info', rects: { lines: [['row', 1]] }, text: '"3 1" means: a block of 3, then a block of 1, in that order, with at least one empty cell between them. ■■■ ✕ ■ fits. ■■■■ ✕ does not (that is one block of 4). ■ ✕ ■■■ does not either (wrong order).' },
            { kind: 'c1a', only: true, rects: { lines: [['row', 0]] }, goal: cgRow(0, [0, 1, 2, 3, 4]),
                text: { desktop: 'Row 1 says 5 and has exactly 5 cells: all of them are filled. Drag across the row to fill it.', touch: 'Row 1 says 5 and has exactly 5 cells: all of them are filled. Drag your finger across the row to fill it.' } },
            { kind: 'info', rects: 'clues', text: 'Its number turned GREY: the row matches. That is the goal of the game — turn EVERY number grey.' },
            { kind: 'c1b', only: true, rects: { lines: [['row', 1]] }, goal: cgRow(1, [0, 1, 2, 4]),
                text: 'Row 2 says 3 1: 3 + one gap + 1 = 5 cells, the whole row. So it must be ■■■ ✕ ■. Fill it.' },
            { kind: 'info', rects: { lines: [['row', 1]] }, text: 'The empty cell got ✕ by itself. ✕ means "surely empty". Whenever a line matches its numbers, its other cells get ✕ like this.' },
            { kind: 'c1c', only: true, rects: { lines: [['row', 2]] }, goal: cgRow(2, [0, 1, 2, 3, 4], 0),
                text: { desktop: 'Row 3 says 0: not one filled cell. Its number is grey already, but mark the row ✕ to be sure: pick ✕ and drag across it, or hold the right button and drag.', touch: 'Row 3 says 0: not one filled cell. Its number is grey already, but mark the row ✕ to be sure: pick ✕ and drag your finger across it.' } },
            { kind: 'c1d', only: true, rects: { lines: [['row', 3]] }, goal: cgRow(3, [0, 1, 3, 4]),
                text: 'Your turn: row 4 says 2 2. Work it out yourself. (Pick FILL again first.)' },
            { kind: 'info', rects: 'clues', text: 'That is the whole rule. But most rows are longer than their blocks — next: how to find the cells that are SURE.' }
        ]
    },
    {
        title: 'Sure cells',
        rowsOnly: true,
        map: ['#####.', '####..', '##.##.', '###...'],
        nudge: 'Not sure yet — when the block sits at the other end, that cell is empty.',
        steps: [
            { kind: 'info', rects: { lines: [['row', 0]] }, slide: ['row', 0], text: 'Row 1 says 5, but it has 6 cells. Where is the block? Watch: it could sit at the left end or at the right end.' },
            { kind: 'info', rects: { lines: [['row', 0]] }, slide: ['row', 0], text: 'The YELLOW cells are covered in BOTH positions — and in every position between. Wherever the block really is, they are filled: they are SURE.' },
            { kind: 'c2a', only: true, rects: { lines: [['row', 0]] }, slide: ['row', 0], goal: cgRow(0, [1, 2, 3, 4]),
                text: 'Fill only the 4 sure cells of row 1. The two end cells are not sure yet — leave them.' },
            { kind: 'c2b', only: true, rects: { lines: [['row', 1]] }, slide: ['row', 1], goal: cgRow(1, [2, 3]),
                text: 'Row 2 says 4 in 6 cells. Watch it slide, then fill its sure cells.' },
            { kind: 'c2c', only: true, rects: { lines: [['row', 2]] }, slide: ['row', 2], goal: cgRow(2, [1, 4]),
                text: 'Row 3 says 2 2. Push BOTH blocks left, then both right — the gap stays between them. Each block has one sure cell: fill them.' },
            { kind: 'info', rects: { lines: [['row', 3]] }, slide: ['row', 3], text: 'Row 4 says 3 in 6: at the left end and at the right end the block never covers the same cell. Nothing is sure here yet — that is normal. Another line will help later.' },
            { kind: 'info', rects: 'clues', text: 'Shortcut: a block longer than HALF its line always has sure cells in the middle. Next: rows and columns working together.' }
        ]
    },
    {
        title: 'Rows and columns together',
        map: ['.#.#.', '#####', '#####', '.###.', '..#..'],
        nudge: 'Not that cell — follow the lit line.',
        steps: [
            { kind: 'info', rects: 'clues', text: 'Now the real game: numbers on the left for rows, on top for columns. Every cell is in one row AND one column — so what one line tells you, the other can use.' },
            { kind: 'c3a', rects: { lines: [['row', 1], ['row', 2]] }, goal: cgRow(1, [0, 1, 2, 3, 4]).concat(cgRow(2, [0, 1, 2, 3, 4])),
                text: 'Rows 2 and 3 say 5: fill them both.' },
            { kind: 'info', rects: { lines: [['col', 0], ['col', 4]] }, text: 'Look at columns 1 and 5: they say 2, and the rows just gave them their 2. They turned grey and got ✕ by themselves — the rows solved two columns for you.' },
            { kind: 'c3b', rects: { lines: [['col', 1]] }, slide: ['col', 1], goal: [[3, 1, 1]],
                text: 'Column 2 says 4 in 5 cells. Watch it slide: its middle 3 cells are sure. Two of them are filled already — fill the third (row 4).' },
            { kind: 'c3c', rects: { lines: [['col', 2], ['col', 3]] }, goal: [[3, 2, 1], [3, 3, 1]],
                text: 'Columns 3 and 4 say 4 too: fill their third sure cell in row 4 the same way.' },
            { kind: 'info', rects: { lines: [['row', 3]] }, text: 'Row 4 says 3 and now has its 3: the columns finished it, and its ends got ✕. Rows and columns keep helping each other like this.' },
            { kind: 'c3d', rects: { lines: [['row', 0]] }, goal: [[0, 1, 1], [0, 3, 1]],
                text: 'Row 1 says 1 1, and both of its ends are ✕. Three cells are left: 1 + gap + 1 = 3, an exact fit. Fill it.' },
            { kind: 'solved', rects: 'board', text: 'One cell is still missing. Which column is short of its number? Find it yourself.' },
            { kind: 'info', rects: 'clues', text: 'Every number is grey: solved! Real maps are bigger, but these are all the moves you need: exact fits, sure cells from sliding, ✕ on finished lines, and lines helping each other.' }
        ]
    },
    {
        title: 'On your own',
        size: 6,
        puzzle: { minSweeps: 2, maxSweeps: 3, density: 0.55, smooth: 1 },
        nudge: 'That cell does not fit the map — check its row AND its column again.',
        free: true,
        steps: [
            { kind: 'info', rects: 'tools', text: 'Last chapter: a small map with no help, like the real ones. Stuck? Press HINT once to see WHERE to look, twice to see WHY. AUDIT shows wrong cells — on real maps an audit that finds one costs a star.' },
            { kind: 'info', rects: 'lesson', text: 'You can open this lesson again at any time with LESSON, and flip between its chapters with ‹ ›. Now solve the map — turn every number grey. Start with the longest blocks.' }
        ]
    }
];

if (typeof module !== 'undefined' && module.exports) module.exports = ChecksumGridMechanic;
