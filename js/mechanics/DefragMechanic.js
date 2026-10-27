/* =========================================
   DefragMechanic.js — Act 8 · RESTORE_CORE

   The core disk is a grid. Backup blocks (polyominoes) wait in a tray on
   the right; drag them onto the disk until every empty sector is filled.
   Restore `disks` disks before the timer runs out. Timer only, no lives,
   no physics.

   Every disk is solvable: the free cells are cut into blocks first, then
   the blocks are (optionally) turned and shuffled into the tray.

   - Drag a block from the tray (or off the disk) and drop it: it snaps to
     the grid when it fits, otherwise it goes back to the tray. No penalty.
   - A short tap on a block turns it 90° (right click / R on desktop).
   - Red striped sectors are corrupted: nothing goes there.
   - Disk map (`map`): thin lines show where the blocks were cut, so the
     puzzle is matching shapes to gaps rather than searching every
     combination. 'all' marks every gap, 'half' about half of them, 'none'
     leaves the disk blank. Any fit still counts.
   - Keyboard: Tab / 1-9 lift a block onto the disk, arrows move it,
     R turns it, SPACE drops it, Backspace sends it back.

   Image mode (EXPERT, `image`): a CLEAN SNAPSHOT (a generated picture)
   sits next to the tray, the disk itself stays blank; every block carries
   its piece of the picture and only fits where it matches. While a block
   is dragged the preview only says whether the shape fits, so it never
   gives the place away. Some blocks have a corrupted twin (same
   shape, two wrong pixels). Dropping a corrupted twin on its place or
   trashing a clean block costs `penaltyTime` seconds; corrupted twins go
   to TRASH.

   wantsDrag: the host sends 'down' / 'move' / 'up' / 'cancel' with the
   pointer type ('touch' lifts the block above the finger).

   revive(): +`reviveTime` seconds, the same disk goes on.

   Coaching (useCoach): the first disk of the first stage is a small
   hand-made lesson (drag into the glowing slot, tap to turn, fill the
   rest). Turned blocks, corrupted sectors and the snapshot mode get a
   one-time explanation. The timer waits while a bubble is up.
   ========================================= */

const _MechanicBaseDF = (typeof Mechanic !== 'undefined') ? Mechanic : class {};

const DF_COLORS = ['#22d3ee', '#a78bfa', '#f472b6', '#facc15', '#34d399', '#fb923c', '#60a5fa', '#e879f9', '#a3e635', '#f87171', '#2dd4bf', '#c084fc'];
// Snapshot palette: distinct in brightness as well as hue (colour-blind friendly).
const DF_PALETTE = ['#0f172a', '#1e3a8a', '#0891b2', '#67e8f9', '#f0abfc', '#fef08a'];
const DF_SUB = 3;          // snapshot pixels per cell side
const DF_TAP = 10;         // px: a press that moved less is a tap

class DefragMechanic extends _MechanicBaseDF {
    constructor(options = {}) {
        super();
        this.rng = options.rng || Math.random;

        this.disks = options.disks || 2;
        this.cols = options.cols || 5;
        this.rows = options.rows || this.cols;
        this.pieceMin = options.pieceMin || 5;            // blocks per disk
        this.pieceMax = options.pieceMax || this.pieceMin;
        this.sizeMin = options.sizeMin || 3;              // cells per block
        this.sizeMax = options.sizeMax || 4;
        this.blockedMin = options.blockedMin || 0;        // corrupted sectors
        this.blockedMax = options.blockedMax || this.blockedMin;
        this.turned = !!options.turned;                   // blocks come turned
        this.image = !!options.image;                     // EXPERT snapshot mode
        this.twinMin = options.twinMin || 0;              // corrupted twins (image mode)
        this.twinMax = options.twinMax || this.twinMin;
        this.map = options.map || 'none';                 // disk map: 'all' | 'half' | 'none'
        this.timeLimit = options.timeLimit || 60;         // seconds for the stage
        this.penaltyTime = options.penaltyTime || 10;
        this.endless = !!options.endless;                 // Endless: one disk a round, the host counts rounds
        this.reviveTime = options.reviveTime || 20;
        this.restoredPause = 0.9;
        this.wantsDrag = true;
        this.coachStore = null;
        this.firstStage = false;

        this.resultDuration = 1.4;
        this.stepDt = 1 / 60;
    }

    _int(n) { return Math.floor(this.rng() * n); }
    _between(a, b) { return a + this._int(b - a + 1); }
    _pick(list) { return list[this._int(list.length)]; }
    _shuffle(list) {
        for (let i = list.length - 1; i > 0; i--) {
            const j = this._int(i + 1);
            [list[i], list[j]] = [list[j], list[i]];
        }
        return list;
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
        this.coach = null;
        this.coachQueue = [];
        this.tutorial = !!(this.coachStore && this.firstStage && !this.coachStore.seen('tutorial'));

        this.time = 0;
        this.timeLeft = this.timeLimit;
        this.restored = 0;
        this.penalties = 0;
        this.score = 0;
        this.pause = 0;
        this.flash = 0;
        this.hurt = 0;
        this.message = null;
        this.sparks = [];
        this.drag = null;
        this.kbd = null;            // keyboard-held block: { piece, r, c }
        this._ticked = Math.ceil(this.timeLeft);
        this._newDisk();
    }

    revive() {
        this.result = null;
        this.active = true;
        this.timeLeft = Math.max(0, this.timeLeft) + this.reviveTime;
        this._dropAll();
    }

    // ── Layout ──

    cellSize() {
        return Math.min(60, Math.floor(Math.min(480 / this.board.cols, 400 / this.board.rows)));
    }

    boardRect() {
        const cell = this.cellSize();
        const w = this.board.cols * cell, h = this.board.rows * cell;
        return { x: 24 + (500 - w) / 2, y: 128 + (412 - h) / 2, w, h, cell };
    }

    trayRect() { return { x: 548, y: 96, w: 388, h: 456 }; }

    /** Image mode keeps a band for the snapshot and TRASH. */
    bandRect() { const T = this.trayRect(); return { x: T.x, y: T.y + T.h - 160, w: T.w, h: 160 }; }

    trashRect() { const b = this.bandRect(); return { x: b.x + b.w - 150, y: b.y + 8, w: 140, h: b.h - 16 }; }

    slotRect(k) {
        const T = this.trayRect();
        const h = (this.image ? T.h - this.bandRect().h - 8 : T.h) - 16;
        const cols = 4, rows = 3;
        const w = (T.w - 16) / cols, sh = h / rows;
        return { x: T.x + 8 + (k % cols) * w, y: T.y + 8 + Math.floor(k / cols) * sh, w, h: sh };
    }

    // ── Disk generation ──

    _newDisk() {
        this.pause = 0;
        this.drag = null;
        this.kbd = null;
        let disk = null;
        if (this.tutorial && this.restored === 0) disk = this._lessonDisk();
        for (let t = 0; t < 300 && !disk; t++) disk = this._tryDisk();
        for (let t = 0; t < 300 && !disk; t++) disk = this._tryDisk(true);
        this.board = disk.board;
        this.pieces = disk.pieces;
        this.picture = disk.picture || null;
        this._queueCallouts();
    }

    /** A grid with corrupted sectors, the free cells cut into blocks. */
    _tryDisk(loose) {
        const rows = this.rows, cols = this.cols;
        const blocked = [];
        const nBlocked = this._between(this.blockedMin, this.blockedMax);
        const all = [];
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) all.push([r, c]);
        this._shuffle(all);
        for (let k = 0; k < nBlocked; k++) blocked.push(all[k]);
        const isBlocked = new Set(blocked.map(([r, c]) => r * cols + c));
        const owner = new Array(rows * cols).fill(-1);
        const free = (i) => !isBlocked.has(i) && owner[i] < 0;
        const nb = (i) => {
            const r = Math.floor(i / cols), c = i % cols, out = [];
            if (r > 0) out.push(i - cols);
            if (r < rows - 1) out.push(i + cols);
            if (c > 0) out.push(i - 1);
            if (c < cols - 1) out.push(i + 1);
            return out;
        };
        const groups = [];
        for (;;) {
            const open = [];
            for (let i = 0; i < rows * cols; i++) if (free(i)) open.push(i);
            if (!open.length) break;
            // Start where the fewest free neighbours are, so nothing gets cut off.
            const deg = (i) => nb(i).filter(free).length;
            const minDeg = Math.min(...open.map(deg));
            const start = this._pick(open.filter(i => deg(i) === minDeg));
            const target = this._between(this.sizeMin, this.sizeMax);
            const cells = [start];
            owner[start] = groups.length;
            while (cells.length < target) {
                const front = [];
                for (const i of cells) for (const j of nb(i)) if (free(j) && front.indexOf(j) < 0) front.push(j);
                if (!front.length) break;
                const fd = Math.min(...front.map(deg));
                const next = this._pick(front.filter(j => deg(j) === fd));
                owner[next] = groups.length;
                cells.push(next);
            }
            groups.push(cells);
        }
        // Blocks below the minimum size join a neighbouring block when they can.
        for (let g = 0; g < groups.length; g++) {
            const cells = groups[g];
            if (!cells.length || cells.length >= this.sizeMin) continue;
            const near = new Set();
            for (const i of cells) for (const j of nb(i)) if (owner[j] >= 0 && owner[j] !== g) near.add(owner[j]);
            const host = [...near].filter(h => groups[h].length + cells.length <= this.sizeMax + (loose ? 2 : 0))
                .sort((a, b) => groups[a].length - groups[b].length)[0];
            if (host === undefined) { if (!loose) return null; continue; }
            for (const i of cells) { owner[i] = host; groups[host].push(i); }
            groups[g] = [];
        }
        const final = groups.filter(g => g.length);
        if (!loose) {
            if (final.length < this.pieceMin || final.length > this.pieceMax) return null;
            if (final.some(g => g.length < this.sizeMin || g.length > this.sizeMax + 1)) return null;
        }
        const board = { rows, cols, blocked: isBlocked, cells: new Array(rows * cols).fill(-1) };
        const picture = this.image ? this._makePicture(rows, cols) : null;
        const pieces = final.map((g, k) => this._makePiece(g.map(i => [Math.floor(i / cols), i % cols]), k, picture));
        this._drawMap(board, final);
        if (this.image) {
            const twins = Math.min(this._between(this.twinMin, this.twinMax), pieces.length);
            const pool = this._shuffle(pieces.slice()).slice(0, twins);
            for (const p of pool) pieces.push(this._corruptTwin(p, pieces.length));
        }
        if (picture && !loose && this._ambiguous(board, pieces, picture)) return null;
        this._toTray(pieces);
        return { board, pieces, picture };
    }

    /** Image mode: would any block also match the snapshot somewhere else? */
    _ambiguous(board, pieces, picture) {
        const saved = { board: this.board, picture: this.picture };
        this.board = board;
        this.picture = picture;
        let found = false;
        for (const p of pieces) {
            const probe = { id: -1, cells: p.cells.map(cl => ({ r: cl.r, c: cl.c, px: cl.px })) };
            for (let k = 0; k < 4 && !found; k++) {
                for (let r = 0; r < board.rows && !found; r++) for (let c = 0; c < board.cols && !found; c++) {
                    if (this.fits(probe, r, c) === 'ok' && (p.corrupt || k || r !== p.home.r || c !== p.home.c)) found = true;
                }
                DefragMechanic.rotate(probe);
            }
            if (found) break;
        }
        this.board = saved.board;
        this.picture = saved.picture;
        return found;
    }

    /**
     * The disk map: `board.home[i]` is the gap a cell belongs to, -1 where
     * the map is not shown ('half' marks a random half of the gaps).
     */
    _drawMap(board, groups, map = this.map) {
        board.home = new Array(board.rows * board.cols).fill(-1);
        if (map === 'none') return;
        const shown = groups.map((g, k) => k);
        if (map === 'half') this._shuffle(shown).splice(Math.ceil(shown.length / 2));
        for (const k of shown) for (const i of groups[k]) board.home[i] = k;
    }

    /** A block: cells relative to its own top-left, its home on the disk, a colour. */
    _makePiece(abs, k, picture) {
        const r0 = Math.min(...abs.map(p => p[0])), c0 = Math.min(...abs.map(p => p[1]));
        const cells = abs.map(([r, c]) => ({ r: r - r0, c: c - c0, px: picture ? this._pixelsAt(picture, r, c) : null }));
        return { id: k, cells, home: { r: r0, c: c0 }, color: DF_COLORS[k % DF_COLORS.length], corrupt: false, at: null, slot: -1, gone: false };
    }

    /** Same shape and picture, two pixels wrong. */
    _corruptTwin(p, id) {
        const cells = p.cells.map(cl => ({ r: cl.r, c: cl.c, px: cl.px.slice() }));
        const spots = [];
        cells.forEach((cl, i) => { for (let k = 0; k < DF_SUB * DF_SUB; k++) spots.push([i, k]); });
        this._shuffle(spots);
        for (const [i, k] of spots.slice(0, 2)) {
            const was = cells[i].px[k];
            // A clearly different shade: two or more steps away on the palette.
            const options = DF_PALETTE.map((x, j) => j).filter(j => Math.abs(j - was) >= 2);
            cells[i].px[k] = this._pick(options);
        }
        return { id, cells, home: Object.assign({}, p.home), color: p.color, corrupt: true, at: null, slot: -1, gone: false };
    }

    /** Turn blocks (when the tier does) and deal them into random tray slots. */
    _toTray(pieces) {
        const slots = this._shuffle(pieces.map((p, k) => k));
        pieces.forEach((p, k) => {
            p.slot = slots[k];
            if (this.turned || this.image) {
                const turns = this._int(4);
                for (let t = 0; t < turns; t++) DefragMechanic.rotate(p);
            }
        });
    }

    /**
     * A generated core emblem in palette indices (rows*SUB × cols*SUB):
     * bright at the centre, dark at the rim, with per-pixel grain so no two
     * cells carry the same picture (a block only matches its own place).
     */
    _makePicture(rows, cols) {
        const H = rows * DF_SUB, W = cols * DF_SUB;
        const img = [];
        for (let y = 0; y < H; y++) {
            const row = new Array(W);
            for (let x = 0; x < W; x++) {
                const dx = (x + 0.5 - W / 2) / (W / 2), dy = (y + 0.5 - H / 2) / (H / 2);
                const d = Math.sqrt(dx * dx + dy * dy);
                const v = Math.round(5 - d * 3.6 + (this.rng() - 0.5) * 1.7);
                row[x] = Math.max(0, Math.min(DF_PALETTE.length - 1, v));
            }
            img.push(row);
        }
        return img;
    }

    _pixelsAt(img, r, c) {
        const out = [];
        for (let y = 0; y < DF_SUB; y++) for (let x = 0; x < DF_SUB; x++) out.push(img[r * DF_SUB + y][c * DF_SUB + x]);
        return out;
    }

    /** Turn a block 90° clockwise (its picture turns with it). */
    static rotate(p) {
        const n = DF_SUB;
        const maxR = Math.max(...p.cells.map(cl => cl.r));
        p.cells = p.cells.map(cl => {
            let px = cl.px;
            if (px) {
                const t = new Array(n * n);
                for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) t[x * n + (n - 1 - y)] = px[y * n + x];
                px = t;
            }
            return { r: cl.c, c: maxR - cl.r, px };
        });
        p.turns = ((p.turns || 0) + 1) % 4;
    }

    // ── Coaching ──

    /** The lesson disk: 4×4, four blocks, one turned the wrong way. */
    _lessonDisk() {
        const rows = 4, cols = 4;
        const board = { rows, cols, blocked: new Set(), cells: new Array(16).fill(-1) };
        const cellsOf = [
            [[0, 0], [0, 1], [1, 0], [1, 1]],     // square, top-left
            [[0, 2], [0, 3], [1, 2], [1, 3]],     // square, top-right
            [[2, 0], [3, 0], [3, 1], [3, 2]],     // L
            [[2, 1], [2, 2], [2, 3], [3, 3]]      // J
        ];
        const pieces = cellsOf.map((g, k) => this._makePiece(g, k, null));
        this._drawMap(board, cellsOf.map(g => g.map(([r, c]) => r * cols + c)), 'all');
        pieces.forEach((p, k) => { p.slot = k; });
        // The third block (an L) comes turned the wrong way: one tap puts it right.
        for (let t = 0; t < 3; t++) DefragMechanic.rotate(pieces[2]);
        this.coachQueue.push(
            { kind: 'info', text: 'The core disk was wiped. Fill EVERY empty sector with the backup blocks on the right. The lines on the disk show the shape of each gap.', rects: 'board' },
            { kind: 'place', piece: 0, text: 'Drag this block onto the disk — drop it on the glowing sectors.', rects: 'lesson0' },
            { kind: 'rotate', piece: 2, text: 'This block is turned the wrong way. Tap it once to turn it.', rects: 'slot2' },
            { kind: 'fill', text: 'Now fill the rest of the disk. A block that does not fit just goes back.', rects: 'board' }
        );
        this._nextCoach();
        return { board, pieces, picture: null };
    }

    _queueCallouts() {
        const store = this.coachStore;
        if (!store) return;
        const topics = [
            ['turned', (this.turned || this.image) && !this.tutorial, 'Blocks may come TURNED. Tap a block (or right click / R) to turn it before you drop it.', 'tray'],
            ['blocked', this.board.blocked.size > 0, 'RED STRIPED sectors are corrupted: nothing goes there. Fill everything else.', 'board'],
            ['halfmap', this.map === 'half', 'The disk map is damaged: only some gaps are marked now. Work out the rest yourself.', 'board'],
            ['snapshot', this.image, 'No map here: rebuild the CLEAN SNAPSHOT (bottom right). Every block has its own place in that picture. Some blocks are CORRUPTED copies with wrong pixels — compare them and drag them to TRASH.', 'band']
        ];
        for (const [key, has, text, rects] of topics) {
            if (has && !store.seen(key) && !this.coachQueue.some(c => c.key === key)) this.coachQueue.push({ kind: 'info', key, text, rects });
        }
        if (!this.coach) this._nextCoach();
    }

    _nextCoach() {
        if (this.coach && this.coach.key && this.coachStore) this.coachStore.mark(this.coach.key);
        this.coach = this.coachQueue.shift() || null;
    }

    get coachBlocks() { return !!this.coach && this.coach.kind === 'info'; }

    _coachEvent(kind, piece) {
        const c = this.coach;
        if (!c || c.kind !== kind) return;
        if (c.piece !== undefined && c.piece !== piece) return;
        this._nextCoach();
    }

    // ── Rules ──

    get busy() { return this.result !== null || this.pause > 0 || this.coachBlocks; }

    /** Cells a block would cover with its top-left at (r, c). */
    static cover(p, r, c) { return p.cells.map(cl => ({ r: r + cl.r, c: c + cl.c, px: cl.px })); }

    /** Does the block fit there (and, in image mode, match the snapshot)? 'ok' | 'shape' | 'image'. */
    fits(p, r, c) {
        const B = this.board;
        for (const cl of DefragMechanic.cover(p, r, c)) {
            if (cl.r < 0 || cl.c < 0 || cl.r >= B.rows || cl.c >= B.cols) return 'shape';
            const i = cl.r * B.cols + cl.c;
            if (B.blocked.has(i) || (B.cells[i] >= 0 && B.cells[i] !== p.id)) return 'shape';
        }
        if (this.picture) {
            for (const cl of DefragMechanic.cover(p, r, c)) {
                const want = this._pixelsAt(this.picture, cl.r, cl.c);
                if (want.some((v, k) => v !== cl.px[k])) return 'image';
            }
        }
        return 'ok';
    }

    place(p, r, c) {
        const B = this.board;
        for (const cl of DefragMechanic.cover(p, r, c)) B.cells[cl.r * B.cols + cl.c] = p.id;
        p.at = { r, c };
        if (typeof Sound !== 'undefined' && Sound.playClick) Sound.playClick();
        this._coachEvent('place', p.id);
        if (this._full()) this._diskRestored();
    }

    lift(p) {
        const B = this.board;
        if (!p.at) return;
        for (let i = 0; i < B.cells.length; i++) if (B.cells[i] === p.id) B.cells[i] = -1;
        p.at = null;
    }

    turn(p) {
        if (this.busy || !p || p.gone) return false;
        if (this.coach && this.coach.kind === 'place') return false;
        if (p.at) {
            // Turn in place when it still fits there, otherwise it stays as it is.
            const at = p.at;
            this.lift(p);
            DefragMechanic.rotate(p);
            if (this.fits(p, at.r, at.c) === 'shape') {
                for (let t = 0; t < 3; t++) DefragMechanic.rotate(p);
                this.place(p, at.r, at.c);
                this.message = { text: 'NO ROOM TO TURN IT HERE', color: '#fbbf24', t: 1 };
                return false;
            }
            this._placeOrReturn(p, at.r, at.c, true);
        } else {
            DefragMechanic.rotate(p);
        }
        if (typeof Sound !== 'undefined' && Sound.playClick) Sound.playClick();
        this._coachEvent('rotate', p.id);
        return true;
    }

    /** Drop a block at (r, c): place it, or send it back to the tray. */
    _placeOrReturn(p, r, c, quiet) {
        const res = this.fits(p, r, c);
        if (this.coach && this.coach.kind === 'place' && (p.id !== this.coach.piece || r !== p.home.r || c !== p.home.c)) {
            this.message = { text: 'DROP IT ON THE GLOWING SECTORS', color: '#fbbf24', t: 1.2 };
            return false;
        }
        if (res === 'ok' && !p.corrupt) { this.place(p, r, c); return true; }
        if (p.corrupt && res !== 'shape' && !p.turns && r === p.home.r && c === p.home.c) {
            // A corrupted copy dropped on its own place: it is caught and binned.
            p.gone = true;
            this._penalty('CORRUPTED BACKUP — BINNED');
            return false;
        }
        if (!quiet) this.message = { text: res === 'image' ? 'DOES NOT MATCH THE SNAPSHOT' : 'DOES NOT FIT THERE', color: '#94a3b8', t: 1 };
        return false;
    }

    trash(p) {
        if (!this.image || !p) return false;
        if (p.corrupt) {
            p.gone = true;
            this.message = { text: 'CORRUPTED COPY BINNED', color: '#22c55e', t: 1 };
            if (typeof Sound !== 'undefined' && Sound.playGood) Sound.playGood(DefragMechanic.SOUND);
            return true;
        }
        this._penalty('CLEAN DATA — KEEP IT');
        return false;
    }

    _penalty(text) {
        this.penalties++;
        this.timeLeft = Math.max(0, this.timeLeft - this.penaltyTime);
        this.hurt = 0.5;
        this.message = { text: UITheme.t('{why} · −{s}s', { why: UITheme.t(text), s: this.penaltyTime }), color: '#ef4444', t: 1.6 };
        if (typeof Sound !== 'undefined' && Sound.playMiss) Sound.playMiss();
        if (this.timeLeft <= 0) this._timeUp();
    }

    _full() {
        const B = this.board;
        for (let i = 0; i < B.cells.length; i++) if (!B.blocked.has(i) && B.cells[i] < 0) return false;
        return true;
    }

    _diskRestored() {
        this.restored++;
        this.flash = 0.6;
        this.drag = null;
        this.kbd = null;
        if (typeof Sound !== 'undefined' && Sound.playStamp) Sound.playStamp();
        if (this.tutorial && this.restored === 1) {
            this.coachQueue = [{ kind: 'info', key: 'tutorial', text: 'Disk restored! Restore every disk of the stage before the timer runs out.', rects: 'hud' }];
            this.coach = null;
            this._nextCoach();
        }
        if (this.restored >= this.disks) {
            this.result = 'success';
            this.score = this.computeScore();
            return;
        }
        this.message = { text: 'DISK RESTORED', color: '#22c55e', t: this.restoredPause };
        this.pause = this.restoredPause;
    }

    _timeUp() {
        this.timeLeft = 0;
        this._dropAll();
        this.result = 'fail';
    }

    /** Any block in hand goes back where it came from. */
    _dropAll() {
        const d = this.drag;
        this.drag = null;
        if (d && d.from) this._placeOrReturn(d.piece, d.from.r, d.from.c, true);
        const k = this.kbd;
        this.kbd = null;
        if (k && k.from) this._placeOrReturn(k.piece, k.from.r, k.from.c, true);
    }

    computeScore() {
        return Math.max(0, this.restored * 300 + Math.floor(this.timeLeft) * 10 - this.penalties * 100);
    }

    /** End-of-stage numbers for the star rules (draft, pending approval). */
    starStats() { return { timeLeft: this.timeLeft, penalties: this.penalties }; }

    timerText() {
        const s = Math.max(0, Math.ceil(this.timeLeft - 1e-9));
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }

    update(dt) {
        if (!this.active) return;
        this.stepDt = dt || this.stepDt;
        const h = this.stepDt;
        this.time += h;
        if (this.flash > 0) this.flash -= h;
        if (this.hurt > 0) this.hurt -= h;
        if (this.message) { this.message.t -= h; if (this.message.t <= 0) this.message = null; }
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const s = this.sparks[i];
            s.life -= h * 2.2; s.x += s.vx * h; s.y += s.vy * h;
            if (s.life <= 0) this.sparks.splice(i, 1);
        }
        if (this.result !== null || this.coach) return;   // the timer waits for the coach
        if (this.pause > 0) {
            this.pause -= h;
            if (this.pause <= 0) this._newDisk();
            return;
        }
        this.timeLeft -= h;
        const shown = Math.ceil(this.timeLeft);
        if (shown !== this._ticked) {
            this._ticked = shown;
            if (shown <= 10 && shown > 0 && typeof Sound !== 'undefined' && Sound.playClick) Sound.playClick();
        }
        if (this.timeLeft <= 0) this._timeUp();
    }

    // ── Geometry ──

    /** Tray drawing scale for a block, so the biggest block fits its slot. */
    trayCell(p) {
        const s = this.slotRect(p.slot);
        const bw = Math.max(...p.cells.map(cl => cl.c)) + 1, bh = Math.max(...p.cells.map(cl => cl.r)) + 1;
        return Math.min(32, (s.w - 14) / bw, (s.h - 14) / bh);
    }

    trayOrigin(p) {
        const s = this.slotRect(p.slot), cs = this.trayCell(p);
        const bw = Math.max(...p.cells.map(cl => cl.c)) + 1, bh = Math.max(...p.cells.map(cl => cl.r)) + 1;
        return { x: s.x + s.w / 2 - bw * cs / 2, y: s.y + s.h / 2 - bh * cs / 2, cs };
    }

    /** Block under a point: on the disk, or a tray slot. */
    pieceAt(x, y) {
        const R = this.boardRect();
        const c = Math.floor((x - R.x) / R.cell), r = Math.floor((y - R.y) / R.cell);
        if (r >= 0 && c >= 0 && r < this.board.rows && c < this.board.cols) {
            const id = this.board.cells[r * this.board.cols + c];
            if (id >= 0) return this.pieces.find(p => p.id === id) || null;
        }
        for (const p of this.pieces) {
            if (p.at || p.gone) continue;
            const s = this.slotRect(p.slot);
            if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return p;
        }
        return null;
    }

    /** Where a dragged block would land: top-left cell under its drawn position. */
    dropCell(d) {
        const R = this.boardRect();
        const px = d.x - d.gx * R.cell, py = d.y - d.lift - d.gy * R.cell;
        return { r: Math.round((py - R.y) / R.cell), c: Math.round((px - R.x) / R.cell), px, py };
    }

    // ── Input ──

    handlePointer(x, y, phase, offset, kind) {
        if (phase === 'move') { if (this.drag) { this.drag.x = x; this.drag.y = y; if (Math.hypot(x - this.drag.x0, y - this.drag.y0) > DF_TAP) this.drag.moved = true; } return true; }
        if (phase === 'cancel') { this._dropAll(); return true; }
        if (phase === 'up') return this._release(x, y);
        if (phase && phase !== 'down') return false;
        if (this.result !== null) return false;
        if (this.coachBlocks) { this._nextCoach(); return true; }
        if (this.busy || this.drag) return true;
        this.kbd = null;
        const p = this.pieceAt(x, y);
        if (!p) return true;
        const R = this.boardRect();
        // Grab point in cells: where on the block the pointer holds it.
        let gx, gy, from = null;
        if (p.at) {
            gx = (x - R.x) / R.cell - p.at.c;
            gy = (y - R.y) / R.cell - p.at.r;
            from = Object.assign({}, p.at);
            this.lift(p);
        } else {
            const bw = Math.max(...p.cells.map(cl => cl.c)) + 1, bh = Math.max(...p.cells.map(cl => cl.r)) + 1;
            gx = bw / 2; gy = bh / 2;
        }
        this.drag = { piece: p, x, y, x0: x, y0: y, gx, gy, from, moved: false, lift: kind === 'touch' ? 64 : 0 };
        return true;
    }

    _release(x, y) {
        const d = this.drag;
        if (!d) return true;
        this.drag = null;
        d.x = x; d.y = y;
        const p = d.piece;
        if (!d.moved && Math.hypot(x - d.x0, y - d.y0) <= DF_TAP) {
            // A tap turns the block (back in place first if it was on the disk).
            if (d.from) this.place(p, d.from.r, d.from.c);
            this.turn(p);
            return true;
        }
        if (this.image) {
            const T = this.trashRect();
            const tx = x, ty = y - d.lift;
            if (tx >= T.x && tx <= T.x + T.w && ty >= T.y && ty <= T.y + T.h) {
                if (!this.trash(p) && d.from) this.place(p, d.from.r, d.from.c);
                return true;
            }
        }
        const at = this.dropCell(d);
        if (!this._placeOrReturn(p, at.r, at.c) && d.from && !p.gone) {
            // Off the disk or no fit: a block taken from the disk goes to the tray.
            p.at = null;
        }
        return true;
    }

    handleAltPointer(x, y) {
        if (this.busy || this.drag) return false;
        return this.turn(this.pieceAt(x, y));
    }

    /** Drop every hold (window blur, pause prompt): the block goes back. */
    releaseAll() { this._dropAll(); }

    _waiting() { return this.pieces.filter(p => !p.at && !p.gone).sort((a, b) => a.slot - b.slot); }

    handleKey(code) {
        if (this.result !== null) return false;
        if (this.coachBlocks) {
            if (code === 'Space' || code === 'Enter') this._nextCoach();
            return true;
        }
        if (this.busy) return true;
        const digit = /^(Digit|Numpad)([1-9])$/.exec(code);
        if (code === 'Tab' || digit) {
            const list = this._waiting();
            if (!list.length) return true;
            let p;
            if (digit) p = list[Number(digit[2]) - 1];
            else {
                const i = this.kbd ? list.indexOf(this.kbd.piece) : -1;
                p = list[(i + 1) % list.length];
            }
            if (p) this.kbd = { piece: p, r: this.kbd ? this.kbd.r : 0, c: this.kbd ? this.kbd.c : 0, from: null };
            return true;
        }
        const k = this.kbd;
        const moves = { ArrowLeft: [0, -1], KeyA: [0, -1], ArrowRight: [0, 1], KeyD: [0, 1], ArrowUp: [-1, 0], KeyW: [-1, 0], ArrowDown: [1, 0], KeyS: [1, 0] };
        if (moves[code]) {
            if (!k) { const list = this._waiting(); if (list.length) this.kbd = { piece: list[0], r: 0, c: 0, from: null }; return true; }
            k.r = Math.max(0, Math.min(this.board.rows - 1, k.r + moves[code][0]));
            k.c = Math.max(0, Math.min(this.board.cols - 1, k.c + moves[code][1]));
            return true;
        }
        if (code === 'KeyR') { if (k) this.turn(k.piece); return true; }
        if (code === 'Backspace' || code === 'Delete') {
            if (k && this.image) { this.kbd = null; this.trash(k.piece); }
            else this.kbd = null;
            return true;
        }
        if (code === 'Space' || code === 'Enter') {
            if (!k) { const list = this._waiting(); if (list.length) this.kbd = { piece: list[0], r: 0, c: 0, from: null }; return true; }
            if (this._placeOrReturn(k.piece, k.r, k.c) || k.piece.gone) this.kbd = null;
            return true;
        }
        return false;
    }

    // ── Render ──

    render(ctx, W, H) {
        ctx.save();
        this._renderBoard(ctx);
        this._renderTray(ctx);
        this._renderHand(ctx);
        for (const s of this.sparks) {
            ctx.globalAlpha = Math.max(0, s.life);
            ctx.fillStyle = s.color;
            ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
        const wash = this.flash > 0 ? ['#22c55e', this.flash / 0.6 * 0.12] : this.hurt > 0 ? ['#ef4444', this.hurt / 0.5 * 0.16] : null;
        if (wash) {
            ctx.save();
            ctx.globalAlpha = Math.min(1, wash[1]);
            ctx.fillStyle = wash[0];
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        }
        this._renderHud(ctx, W, H);
        this._renderCoach(ctx, W, H);
    }

    /** One block cell: a bevelled tile, or its snapshot pixels. */
    _cell(ctx, x, y, s, color, px, alpha = 1) {
        ctx.globalAlpha = alpha;
        if (px) {
            const q = s / DF_SUB;
            for (let k = 0; k < px.length; k++) {
                ctx.fillStyle = DF_PALETTE[px[k]];
                ctx.fillRect(x + (k % DF_SUB) * q, y + Math.floor(k / DF_SUB) * q, q + 0.5, q + 0.5);
            }
            ctx.strokeStyle = 'rgba(2,6,23,0.6)';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
        } else {
            const g = Math.max(2, s * 0.08);
            ctx.fillStyle = color;
            ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
            ctx.fillStyle = 'rgba(255,255,255,0.28)';
            ctx.fillRect(x + 1, y + 1, s - 2, g);
            ctx.fillStyle = 'rgba(2,6,23,0.35)';
            ctx.fillRect(x + 1, y + s - 1 - g, s - 2, g);
        }
        ctx.globalAlpha = 1;
    }

    _renderBoard(ctx) {
        const R = this.boardRect();
        const B = this.board;
        UITheme.panel(ctx, R.x - 14, R.y - 14, R.w + 28, R.h + 28, { chamfer: 14, fill: 'rgba(8,12,20,0.9)', stroke: 'rgba(45,212,191,0.55)', lineWidth: 1.6 });
        ctx.fillStyle = '#94a3b8';
        ctx.font = '700 16px Orbitron, OrbitronTR';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(UITheme.t('FILL EVERY EMPTY SECTOR'), R.x + R.w / 2, R.y - 32);
        for (let r = 0; r < B.rows; r++) {
            for (let c = 0; c < B.cols; c++) {
                const i = r * B.cols + c;
                const x = R.x + c * R.cell, y = R.y + r * R.cell;
                if (B.blocked.has(i)) {
                    ctx.fillStyle = 'rgba(127,29,29,0.55)';
                    ctx.fillRect(x + 1, y + 1, R.cell - 2, R.cell - 2);
                    ctx.strokeStyle = 'rgba(239,68,68,0.7)';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    for (let k = -R.cell; k < R.cell; k += 10) { ctx.moveTo(x + Math.max(0, k), y + Math.max(0, -k)); ctx.lineTo(x + Math.min(R.cell, k + R.cell), y + Math.min(R.cell, R.cell - k)); }
                    ctx.stroke();
                    continue;
                }
                // A mapped gap is one joined area (three tones so neighbours stand apart).
                const g = B.home ? B.home[i] : -1;
                if (g >= 0) {
                    ctx.fillStyle = ['rgba(30,41,59,0.9)', 'rgba(51,65,85,0.75)', 'rgba(39,52,72,0.85)'][g % 3];
                    ctx.fillRect(x, y, R.cell, R.cell);
                } else {
                    ctx.fillStyle = 'rgba(30,41,59,0.55)';
                    ctx.fillRect(x + 1, y + 1, R.cell - 2, R.cell - 2);
                }
            }
        }
        // Disk map: the edges of the marked gaps
        if (B.home) {
            const gap = (r, c) => (r < 0 || c < 0 || r >= B.rows || c >= B.cols) ? -2 : B.home[r * B.cols + c];
            // Faint cell grid inside a gap, a bold line around it.
            ctx.strokeStyle = 'rgba(148,163,184,0.18)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let r = 0; r < B.rows; r++) for (let c = 0; c < B.cols; c++) {
                const g = gap(r, c);
                if (g < 0) continue;
                const x = R.x + c * R.cell, y = R.y + r * R.cell;
                if (gap(r, c + 1) === g) { ctx.moveTo(x + R.cell, y + 6); ctx.lineTo(x + R.cell, y + R.cell - 6); }
                if (gap(r + 1, c) === g) { ctx.moveTo(x + 6, y + R.cell); ctx.lineTo(x + R.cell - 6, y + R.cell); }
            }
            ctx.stroke();
            ctx.strokeStyle = 'rgba(203,213,225,0.85)';
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.beginPath();
            for (let r = 0; r < B.rows; r++) for (let c = 0; c < B.cols; c++) {
                const g = gap(r, c);
                if (g < 0) continue;
                const x = R.x + c * R.cell, y = R.y + r * R.cell, e = R.cell, k = 1.5;
                if (gap(r - 1, c) !== g) { ctx.moveTo(x + k, y + k); ctx.lineTo(x + e - k, y + k); }
                if (gap(r + 1, c) !== g) { ctx.moveTo(x + k, y + e - k); ctx.lineTo(x + e - k, y + e - k); }
                if (gap(r, c - 1) !== g) { ctx.moveTo(x + k, y + k); ctx.lineTo(x + k, y + e - k); }
                if (gap(r, c + 1) !== g) { ctx.moveTo(x + e - k, y + k); ctx.lineTo(x + e - k, y + e - k); }
            }
            ctx.stroke();
        }
        // Placed blocks
        for (const p of this.pieces) {
            if (!p.at) continue;
            for (const cl of DefragMechanic.cover(p, p.at.r, p.at.c)) this._cell(ctx, R.x + cl.c * R.cell, R.y + cl.r * R.cell, R.cell, p.color, cl.px);
            this._outline(ctx, p, R.x + p.at.c * R.cell, R.y + p.at.r * R.cell, R.cell, 'rgba(2,6,23,0.9)', 2);
        }
        // Lesson: the glowing target sectors
        if (this.coach && this.coach.kind === 'place') {
            const p = this.pieces[this.coach.piece];
            const glow = 0.4 + 0.4 * Math.sin(this.time * 6);
            ctx.fillStyle = `rgba(250,204,21,${glow * 0.5})`;
            for (const cl of DefragMechanic.cover(p, p.home.r, p.home.c)) ctx.fillRect(R.x + cl.c * R.cell + 3, R.y + cl.r * R.cell + 3, R.cell - 6, R.cell - 6);
        }
    }

    /** The outer edge of a block (cells drawn from (x, y) with size s). */
    _outline(ctx, p, x, y, s, color, w) {
        const has = new Set(p.cells.map(cl => cl.r + ':' + cl.c));
        ctx.strokeStyle = color;
        ctx.lineWidth = w;
        ctx.beginPath();
        for (const cl of p.cells) {
            const cx = x + cl.c * s, cy = y + cl.r * s;
            if (!has.has((cl.r - 1) + ':' + cl.c)) { ctx.moveTo(cx, cy); ctx.lineTo(cx + s, cy); }
            if (!has.has((cl.r + 1) + ':' + cl.c)) { ctx.moveTo(cx, cy + s); ctx.lineTo(cx + s, cy + s); }
            if (!has.has(cl.r + ':' + (cl.c - 1))) { ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + s); }
            if (!has.has(cl.r + ':' + (cl.c + 1))) { ctx.moveTo(cx + s, cy); ctx.lineTo(cx + s, cy + s); }
        }
        ctx.stroke();
    }

    _renderTray(ctx) {
        const T = this.trayRect();
        UITheme.panel(ctx, T.x, T.y, T.w, T.h, { chamfer: 12, fill: 'rgba(10,14,24,0.85)', stroke: 'rgba(100,116,139,0.55)' });
        ctx.fillStyle = '#64748b';
        ctx.font = '700 13px Orbitron, OrbitronTR';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(UITheme.t('BACKUP BLOCKS'), T.x + 12, T.y - 10);
        const held = (this.drag && this.drag.piece) || (this.kbd && this.kbd.piece);
        for (const p of this.pieces) {
            if (p.at || p.gone || p === held) continue;
            const o = this.trayOrigin(p);
            for (const cl of p.cells) this._cell(ctx, o.x + cl.c * o.cs, o.y + cl.r * o.cs, o.cs, p.color, cl.px);
            this._outline(ctx, p, o.x, o.y, o.cs, 'rgba(2,6,23,0.9)', 1.5);
        }
        if (!this.image) return;
        // Snapshot thumbnail and TRASH
        const b = this.bandRect();
        ctx.strokeStyle = 'rgba(100,116,139,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(b.x + 8, b.y); ctx.lineTo(b.x + b.w - 8, b.y); ctx.stroke();
        // The only map of where blocks go: big, with the cell grid and the
        // corrupted sectors marked like on the disk.
        const img = this.picture;
        const q = Math.min((b.h - 34) / img.length, 200 / img[0].length);
        const ix = b.x + 14, iy = b.y + 24;
        for (let y = 0; y < img.length; y++) for (let x = 0; x < img[0].length; x++) {
            ctx.fillStyle = DF_PALETTE[img[y][x]];
            ctx.fillRect(ix + x * q, iy + y * q, q + 0.5, q + 0.5);
        }
        const B = this.board, cq = q * DF_SUB;
        ctx.fillStyle = 'rgba(127,29,29,0.85)';
        for (const i of B.blocked) ctx.fillRect(ix + (i % B.cols) * cq, iy + Math.floor(i / B.cols) * cq, cq, cq);
        ctx.strokeStyle = 'rgba(2,6,23,0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let c = 1; c < B.cols; c++) { ctx.moveTo(ix + c * cq, iy); ctx.lineTo(ix + c * cq, iy + B.rows * cq); }
        for (let r = 1; r < B.rows; r++) { ctx.moveTo(ix, iy + r * cq); ctx.lineTo(ix + B.cols * cq, iy + r * cq); }
        ctx.stroke();
        ctx.strokeStyle = 'rgba(103,232,249,0.6)';
        ctx.strokeRect(ix - 1, iy - 1, B.cols * cq + 2, B.rows * cq + 2);
        ctx.fillStyle = '#67e8f9';
        ctx.font = '700 12px Orbitron, OrbitronTR';
        ctx.fillText('CLEAN SNAPSHOT', ix, b.y + 13);
        const tr = this.trashRect();
        const hot = this.drag && this.drag.moved;
        UITheme.panel(ctx, tr.x, tr.y, tr.w, tr.h, { chamfer: 8, fill: hot ? 'rgba(239,68,68,0.18)' : 'rgba(15,23,42,0.9)', stroke: hot ? '#ef4444' : 'rgba(239,68,68,0.55)', lineWidth: 1.6, dashed: true });
        ctx.fillStyle = '#fca5a5';
        ctx.font = '700 16px Orbitron, OrbitronTR';
        ctx.textAlign = 'center';
        ctx.fillText('TRASH', tr.x + tr.w / 2, tr.y + tr.h / 2 - 8);
        ctx.font = '600 13px Rajdhani';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(UITheme.t('corrupted copies'), tr.x + tr.w / 2, tr.y + tr.h / 2 + 14);
    }

    /** The block in hand (drag or keyboard) and where it would land. */
    _renderHand(ctx) {
        const R = this.boardRect();
        let p = null, r = 0, c = 0, fx = 0, fy = 0;
        if (this.drag && (this.drag.moved || this.drag.from)) {
            p = this.drag.piece;
            const at = this.dropCell(this.drag);
            r = at.r; c = at.c; fx = at.px; fy = at.py;
        } else if (this.kbd) {
            p = this.kbd.piece; r = this.kbd.r; c = this.kbd.c;
            fx = R.x + c * R.cell; fy = R.y + r * R.cell;
        }
        if (!p) return;
        // Snapshot mode: the preview only judges the shape, never the picture.
        const res = this.picture && this.fits(p, r, c) === 'image' ? 'ok' : this.fits(p, r, c);
        const onBoard = DefragMechanic.cover(p, r, c).some(cl => cl.r >= 0 && cl.c >= 0 && cl.r < this.board.rows && cl.c < this.board.cols);
        if (onBoard) {
            ctx.fillStyle = res === 'ok' ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.3)';
            for (const cl of DefragMechanic.cover(p, r, c)) {
                if (cl.r < 0 || cl.c < 0 || cl.r >= this.board.rows || cl.c >= this.board.cols) continue;
                ctx.fillRect(R.x + cl.c * R.cell + 2, R.y + cl.r * R.cell + 2, R.cell - 4, R.cell - 4);
            }
        }
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 16;
        for (const cl of p.cells) this._cell(ctx, fx + cl.c * R.cell, fy + cl.r * R.cell, R.cell, p.color, cl.px, this.kbd ? 0.8 : 0.92);
        ctx.restore();
        this._outline(ctx, p, fx, fy, R.cell, '#f8fafc', 2);
    }

    _renderHud(ctx, W, H) {
        ctx.save();
        ctx.textBaseline = 'middle';
        const y = H - 38;
        for (let i = 0; i < (this.endless ? 0 : this.disks); i++) {
            const done = i < this.restored;
            ctx.fillStyle = done ? 'rgba(34,197,94,0.3)' : 'rgba(15,23,42,0.6)';
            ctx.strokeStyle = done ? '#22c55e' : i === this.restored ? '#2dd4bf' : '#475569';
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(W / 2 - 200 + i * 28, y, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        ctx.fillStyle = '#94a3b8';
        ctx.font = '700 18px Rajdhani';
        ctx.textAlign = 'left';
        if (!this.endless) ctx.fillText(UITheme.t('DISK {done}/{n}', { done: Math.min(this.restored + 1, this.disks), n: this.disks }), W / 2 - 200 + this.disks * 28, y);
        const low = this.timeLeft < 10 && this.result === null;
        ctx.fillStyle = low && Math.sin(this.time * 12) > 0 ? '#fca5a5' : low ? '#ef4444' : '#e2e8f0';
        ctx.font = '700 24px Orbitron, OrbitronTR';
        ctx.textAlign = 'right';
        ctx.fillText(`⏱ ${this.timerText()}`, W / 2 + 250, y);

        let text = null, color = '#94a3b8';
        if (this.result === 'success') { text = UITheme.t('CORE RESTORED · SCORE {n}', { n: this.score }); color = '#22c55e'; }
        else if (this.result === 'fail') { text = 'TIME UP — RESTORE FAILED'; color = '#ef4444'; }
        else if (this.message) { text = this.message.text; color = this.message.color; }
        if (text) {
            text = UITheme.t(text);
            ctx.fillStyle = color;
            ctx.font = text.length > 28 ? '700 16px Orbitron, OrbitronTR' : '700 19px Orbitron, OrbitronTR';
            ctx.textAlign = 'center';
            ctx.fillText(text, W / 2, 568);
        }
        ctx.restore();
    }

    /** What a coach step points at. */
    _coachRects(c) {
        const R = this.boardRect();
        const pad = (r) => ({ x: r.x - 6, y: r.y - 6, w: r.w + 12, h: r.h + 12 });
        if (c.rects === 'board') return [pad(R)];
        if (c.rects === 'tray') return [this.trayRect()];
        if (c.rects === 'band') return [this.bandRect()];
        if (c.rects === 'hud') return [{ x: this.width / 2 - 220, y: this.height - 56, w: 480, h: 36 }];
        if (c.rects === 'lesson0') {
            const p = this.pieces[0];
            return [this.slotRect(p.slot), { x: R.x + p.home.c * R.cell, y: R.y + p.home.r * R.cell, w: 2 * R.cell, h: 2 * R.cell }];
        }
        if (c.rects === 'slot2') return [this.slotRect(this.pieces[2].slot)];
        return [];
    }

    _renderCoach(ctx, W, H) {
        const c = this.coach;
        if (!c || this.result !== null) return;
        const rects = this._coachRects(c);
        const info = c.kind === 'info';
        ctx.save();
        ctx.fillStyle = 'rgba(5,8,16,0.6)';
        // The last step leaves the whole board and tray usable and visible.
        // (Holes must not overlap: even-odd filling would dim the overlap again.)
        const B = this.boardRect(), T = this.trayRect();
        const holes = c.kind === 'fill'
            ? [{ x: B.x - 10, y: B.y - 10, w: B.w + 20, h: B.h + 20 }, { x: T.x + 4, y: T.y + 4, w: T.w - 8, h: T.h - 8 }]
            : rects;
        ctx.beginPath();
        ctx.rect(0, 0, W, H);
        for (const r of holes) ctx.rect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
        ctx.fill('evenodd');
        const glow = 0.6 + 0.4 * Math.sin(this.time * 6);
        ctx.strokeStyle = `rgba(250,204,21,${glow})`;
        ctx.lineWidth = 3;
        for (const r of rects) ctx.strokeRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
        // The bubble sits over the title band, clear of the board and the tray.
        const bw = 560;
        ctx.font = '600 18px Rajdhani';
        const words = UITheme.t(c.text).split(' ');
        const lines = [];
        let line = '';
        for (const w of words) {
            const t = line ? line + ' ' + w : w;
            const m = ctx.measureText(t).width;
            if ((typeof m === 'number' ? m : t.length * 8) > bw - 36 && line) { lines.push(line); line = w; } else line = t;
        }
        lines.push(line);
        const bh = 22 + lines.length * 23 + (info ? 24 : 2);
        const bx = W / 2 - bw / 2 - 90, by = 4;
        UITheme.panel(ctx, bx, by, bw, bh, { chamfer: 12, stroke: '#facc15', lineWidth: 1.6, fill: 'rgba(15,23,42,0.97)', glow: '#facc15' });
        ctx.fillStyle = '#e2e8f0';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        lines.forEach((l, k) => ctx.fillText(l, bx + 18, by + 22 + k * 23));
        if (info) {
            ctx.fillStyle = '#facc15';
            ctx.font = '700 14px Rajdhani';
            ctx.textAlign = 'right';
            ctx.fillText(UITheme.t('TAP TO CONTINUE ▸'), bx + bw - 16, by + bh - 14);
        }
        ctx.restore();
    }
}

DefragMechanic.SOUND = { soundFreq: 740, soundType: 'triangle' };

if (typeof module !== 'undefined' && module.exports) module.exports = DefragMechanic;
