/* =========================================
   LogicBombMechanic.js — Act 7 · DEFUSE_PAYLOAD

   The attacker left a logic bomb: a payload vault with a countdown and a
   few modules. Defuse every module before the timer hits zero. Defuse
   `payloads` payloads to clear the stage. Timer + strikes, no physics.

   Modules (each with its own rule card, rebuilt for every payload):
   - wires   DATA LINES: 3-6 coloured lines. Read the card top to bottom;
             the first rule that matches says which line to cut.
             First tap selects a line, a second tap cuts it.
   - circuit TRIGGER: input switches feed logic gates (AND / OR / NOT,
             XOR on harder tiers) into the DETONATE lamp. Wires show their
             signal live; turn the lamp off for good with a limited number
             of flips (the fewest needed + `flipSlack`). Running out costs
             a strike and resets the switches. A CLK input flips by itself:
             the lamp must stay off for both of its values.
   - pad     CIPHER PAD: four symbol keys. One column of the card holds
             all four; press them in that column's order, top to bottom.
   - button  KILL SWITCH: the card says tap or hold. While held, a strip
             lights; release when the timer shows that strip's digit.

   A wrong move is a strike: the timer runs 25 % faster per strike, and
   the payload detonates at `strikes` strikes or when time runs out. Each
   payload starts with a fresh timer and no strikes. The vault shows one
   module and its card at a time, so text stays large on a phone.

   wantsHold: the kill switch needs press and release. Every other control
   acts on press.

   revive(): +`reviveTime` seconds (and one strike off at the limit); the
   same payload goes on.

   Coaching (useCoach): with a store from the host, the first module of
   the first stage is a guided lesson: the timer, the MANUAL, then each
   rule checked in turn ("not true, next" … "true: do this") and the cut
   itself, step by step. Each module kind, the CLK input and the SIG /
   flag rules get a one-time explanation when first opened. The timer
   waits while a bubble is up; info bubbles wait for a tap.
   ========================================= */

const _MechanicBaseLB = (typeof Mechanic !== 'undefined') ? Mechanic : class {};

const LB_COLORS = {
    RED: '#ef4444', BLUE: '#3b82f6', YELLOW: '#facc15', WHITE: '#e2e8f0', GREEN: '#22c55e'
};
const LB_FLAGS = ['NET', 'SYS', 'AUX', 'SEC', 'DMZ'];
const LB_SYMBOLS = ['Ω', 'Ψ', 'λ', 'Σ', 'Δ', 'Φ', 'Ж', 'Б', 'Я', 'Ξ', 'Π', 'Θ', '¶', '§', '★', '☆', '©', '¿', 'Ø', '¥'];
const LB_ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
const LB_NAMES = { wires: 'LINES', circuit: 'TRIGGER', pad: 'CIPHER', button: 'SWITCH' };
const LB_TITLES = { wires: 'DATA LINES', circuit: 'TRIGGER CIRCUIT', pad: 'CIPHER PAD', button: 'KILL SWITCH' };
const LB_HOLD = 0.6;   // seconds: a shorter press on the kill switch is a tap

/**
 * Text in the player's language. Rule cards are built in that language when
 * a module is made (the language only changes on the main menu), so the
 * MANUAL, the lesson and the rule checks all read the same words.
 */
const lbT = (text, vars) => (typeof UITheme !== 'undefined' ? UITheme.t(text, vars) : text);

class LogicBombMechanic extends _MechanicBaseLB {
    constructor(options = {}) {
        super();
        this.rng = options.rng || Math.random;

        this.payloads = options.payloads || 2;
        this.modules = options.modules || 2;              // per payload
        this.kinds = options.kinds || ['wires', 'circuit'];
        this.timeLimit = options.timeLimit || 90;         // seconds per payload
        this.maxStrikes = options.strikes || 3;
        this.wireMin = options.wireMin || 3;
        this.wireMax = options.wireMax || this.wireMin;
        this.rules = options.rules || 3;                  // rule lines incl. "Otherwise"
        this.edgework = !!options.edgework;               // rules may read SIG and flags
        this.compound = !!options.compound;               // "… and …" conditions
        this.inputs = options.inputs || 3;                // circuit switches
        this.gates = options.gates || 2;
        this.xor = !!options.xor;
        this.clock = !!options.clock;
        this.padColumns = options.padColumns || 3;
        this.flipSlack = options.flipSlack !== undefined ? options.flipSlack : 1;   // spare circuit flips
        this.reviveTime = options.reviveTime || 20;
        this.speedPerStrike = 0.25;
        this.defusedPause = 1.1;
        this.wantsHold = true;
        this.coachStore = null;        // { seen(key), mark(key) } from the host
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

    /** Enable the tour (first stage only) and the one-time explanations. */
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
        this.defused = 0;            // payloads
        this.modulesDone = 0;        // over the stage
        this.totalStrikes = 0;
        this.timeShares = [];        // time left / limit, per defused payload
        this.timeBank = 0;           // seconds left, summed over defused payloads
        this.score = 0;
        this.pause = 0;
        this.flash = 0;
        this.hurt = 0;
        this.boom = 0;
        this.message = null;
        this.sparks = [];
        this.kbd = false;            // keyboard focus ring only after a key press
        this._newPayload();
    }

    revive() {
        this.result = null;
        this.active = true;
        this.boom = 0;
        this.timeLeft = Math.max(0, this.timeLeft) + this.reviveTime;
        this.strikes = Math.min(this.strikes, this.maxStrikes - 1);
        this._releaseButton(false);
    }

    // ── Layout (logical 960×640) ──

    vaultRect() { return { x: 24, y: 84, w: 528, h: 478 }; }
    moduleRect() { const V = this.vaultRect(); return { x: V.x + 12, y: V.y + 72, w: V.w - 24, h: V.h - 84 }; }
    panelRect() { return { x: 568, y: 84, w: 368, h: 478 }; }
    timerRect() { const P = this.panelRect(); return { x: P.x, y: P.y, w: P.w, h: 78 }; }
    edgeRect() { const P = this.panelRect(); return { x: P.x, y: P.y + 86, w: P.w, h: 46 }; }
    cardRect() { const P = this.panelRect(); return { x: P.x, y: P.y + 140, w: P.w, h: P.h - 140 }; }

    tabRect(i) {
        const V = this.vaultRect();
        const n = this.mods.length, gap = 8;
        const w = Math.min(120, (V.w - 24 - gap * (n - 1)) / n);
        const total = n * w + (n - 1) * gap;
        return { x: V.x + V.w / 2 - total / 2 + i * (w + gap), y: V.y + 12, w, h: 50 };
    }

    // ── Payload generation ──

    _newPayload() {
        this.timeLeft = this.timeLimit;
        this.strikes = 0;
        this.pause = 0;
        this.holding = null;         // { t } while the kill switch is held
        this._ticked = Math.ceil(this.timeLeft);

        // Edgework: a signature ending in a digit, and 2-3 status flags.
        const chars = 'ABCDEFGHJKLMNPRSTUVXZ0123456789';
        let sig = '';
        for (let k = 0; k < 5; k++) sig += chars[this._int(chars.length)];
        this.serial = sig + this._int(10);
        this.flags = this._shuffle(LB_FLAGS.slice()).slice(0, this._between(2, 3)).map(name => ({ name, lit: this.rng() < 0.5 }));

        // Every allowed kind once (in a random order), then repeats.
        const kinds = this._shuffle(this.kinds.slice()).slice(0, this.modules);
        while (kinds.length < this.modules) kinds.push(this._pick(this.kinds));
        this.mods = kinds.map(k => this._makeModule(k));
        // The guided lesson needs a card where at least one rule is skipped.
        if (this.tutorial && this.defused === 0 && this.mods[0].kind === 'wires') {
            for (let k = 0; k < 60 && this.mods[0].applied < 1; k++) this.mods[0] = this._makeWires();
        }
        this.sel = 0;
        this.focus = 0;
        this._queueTour();
        this._opened(this.mods[0]);
    }

    _makeModule(kind) {
        if (kind === 'wires') return this._makeWires();
        if (kind === 'circuit') return this._makeCircuit();
        if (kind === 'pad') return this._makePad();
        return this._makeButton();
    }

    /** What the rules can look at. */
    _view(extra) {
        const last = this.serial.charCodeAt(this.serial.length - 1) - 48;
        return Object.assign({ odd: last % 2 === 1, lit: new Set(this.flags.filter(f => f.lit).map(f => f.name)) }, extra);
    }

    /** Edgework conditions (SIG and flags); only on tiers with `edgework`. */
    _edgeCond() {
        const roll = this._int(3);
        if (roll === 0) return { text: lbT('the SIG ends in an odd digit'), test: v => v.odd, edge: true };
        if (roll === 1) return { text: lbT('the SIG ends in an even digit'), test: v => !v.odd, edge: true };
        const f = this._pick(this.flags).name;
        return this.rng() < 0.6
            ? { text: lbT('the {f} flag is lit', { f }), test: v => v.lit.has(f), edge: true }
            : { text: lbT('the {f} flag is off', { f }), test: v => !v.lit.has(f), edge: true };
    }

    /** One rule condition: a module condition, an edgework one, or both. */
    _cond(own) {
        if (this.edgework && this.compound && this.rng() < 0.3) {
            const a = own(), b = this._edgeCond();
            return { text: lbT('{a} and {b}', { a: a.text, b: b.text }), test: v => a.test(v) && b.test(v), edge: true };
        }
        if (this.edgework && this.rng() < 0.3) return this._edgeCond();
        return own();
    }

    /**
     * Sequential rules, first match applies. Rebuilt until the rule that
     * applies is at a random depth of the card (so the whole card is read),
     * its action resolves and `fair(rules)` accepts the card.
     */
    _ruleCard(count, own, action, view, fair) {
        const target = this._int(count);
        for (let tries = 0; tries < 200; tries++) {
            const rules = [];
            const seen = new Set();
            for (let k = 0; k < count - 1; k++) {
                let c = this._cond(own);
                for (let g = 0; g < 12 && seen.has(c.text); g++) c = this._cond(own);
                seen.add(c.text);
                rules.push({ cond: c, act: action() });
            }
            rules.push({ cond: null, act: action() });
            const applied = rules.findIndex(r => !r.cond || r.cond.test(view));
            if (applied !== target) continue;
            const answer = rules[applied].act.pick(view);
            if (answer === -1 || answer === undefined) continue;
            if (fair && !fair(rules)) continue;
            return { rules, applied, answer, edge: rules.some(r => r.cond && r.cond.edge) };
        }
        return null;
    }

    _makeWires() {
        const names = Object.keys(LB_COLORS);
        for (let tries = 0; tries < 400; tries++) {
            const n = this._between(this.wireMin, this.wireMax);
            const wires = Array.from({ length: n }, () => ({ color: this._pick(names), cut: false }));
            if (new Set(wires.map(w => w.color)).size < 2) continue;
            const view = this._view({ colors: wires.map(w => w.color) });
            const count = (v, c) => v.colors.filter(x => x === c).length;
            const own = () => {
                const C = this._pick(names), name = { C: lbT(C) };
                const roll = this._int(5);
                if (roll === 0) return { text: lbT('there are no {C} lines', name), test: v => count(v, C) === 0 };
                if (roll === 1) return { text: lbT('there is more than one {C} line', name), test: v => count(v, C) > 1 };
                if (roll === 2) return { text: lbT('there is exactly one {C} line', name), test: v => count(v, C) === 1 };
                if (roll === 3) return { text: lbT('the last line is {C}', name), test: v => v.colors[v.colors.length - 1] === C };
                return { text: lbT('the first line is {C}', name), test: v => v.colors[0] === C };
            };
            const action = () => {
                const roll = this._int(4);
                if (roll === 0) { const k = this._int(n); return { text: lbT('cut the {nth} line', { nth: lbT(LB_ORDINAL[k]) }), pick: () => k }; }
                if (roll === 1) return { text: lbT('cut the last line'), pick: v => v.colors.length - 1 };
                const C = this._pick(names), name = { C: lbT(C) };
                if (roll === 2) return { text: lbT('cut the first {C} line', name), pick: v => v.colors.indexOf(C) };
                return { text: lbT('cut the last {C} line', name), pick: v => v.colors.lastIndexOf(C) };
            };
            // Every line must make sense on this module (no "first RED line" without red).
            const card = this._ruleCard(this.rules, own, action, view, rules => rules.every(r => r.act.pick(view) >= 0));
            if (!card) continue;
            return Object.assign({ kind: 'wires', done: false, wires, selected: null }, card);
        }
        // Practically unreachable: fall back to a one-rule card.
        const wires = [{ color: 'RED', cut: false }, { color: 'BLUE', cut: false }, { color: 'WHITE', cut: false }];
        return { kind: 'wires', done: false, wires, selected: null, applied: 0, answer: 2, edge: false,
            rules: [{ cond: null, act: { text: lbT('cut the last line'), pick: () => 2 } }] };
    }

    /** Value of DETONATE for one assignment (inputs in order, CLK last). */
    static evalCircuit(mod, values) {
        const L = mod.inputs.length;
        const out = [];
        const get = (r) => r < L ? values[r] : out[r - L];
        for (const g of mod.gates) {
            const a = get(g.a), b = g.op === 'NOT' ? 0 : get(g.b);
            out.push(g.op === 'AND' ? (a & b) : g.op === 'OR' ? (a | b) : g.op === 'XOR' ? (a ^ b) : 1 - a);
        }
        return out[out.length - 1];
    }

    /** Gate columns the circuit needs (longest path from a switch to DETONATE). */
    static circuitDepth(mod) {
        const L = mod.inputs.length, depth = [];
        const d = (r) => r < L ? 0 : depth[r - L];
        mod.gates.forEach((g, k) => { depth[k] = 1 + Math.max(d(g.a), g.op === 'NOT' ? 0 : d(g.b)); });
        return Math.max(...depth);
    }

    /** Every switch and gate value for one assignment (inputs first, then gates). */
    static signals(mod, values) {
        const L = mod.inputs.length;
        const out = values.slice(0, L);
        for (const g of mod.gates) {
            const a = out[g.a], b = g.op === 'NOT' ? 0 : out[g.b];
            out.push(g.op === 'AND' ? (a & b) : g.op === 'OR' ? (a | b) : g.op === 'XOR' ? (a ^ b) : 1 - a);
        }
        return out;
    }

    /** Are these switch settings safe (DETONATE 0, for both CLK values)? */
    static circuitSafe(mod, switches) {
        const clocked = mod.inputs.some(i => i.clock);
        const run = (clk) => LogicBombMechanic.evalCircuit(mod, clocked ? switches.concat([clk]) : switches);
        return run(0) === 0 && (!clocked || run(1) === 0);
    }

    _makeCircuit() {
        const free = this.inputs;
        const leaves = free + (this.clock ? 1 : 0);
        const ops = ['AND', 'OR'].concat(this.xor ? ['XOR'] : []);
        const nots = Math.max(0, this.gates - (leaves - 1));
        for (let tries = 0; tries < 600; tries++) {
            const inputs = [];
            for (let k = 0; k < free; k++) inputs.push({ name: 'ABCD'[k], clock: false });
            if (this.clock) inputs.push({ name: 'CLK', clock: true });
            const gates = [];
            let pool = inputs.map((x, i) => i);
            let notsLeft = nots, stuck = false;
            const take = () => pool.splice(this._int(pool.length), 1)[0];
            while (!stuck && (pool.length > 1 || notsLeft > 0)) {
                if (notsLeft > 0 && (pool.length === 1 || this.rng() < 0.4)) {
                    const a = take();
                    // Never NOT(NOT x); with nothing else left, start over.
                    if (a >= leaves && gates[a - leaves].op === 'NOT') { pool.push(a); stuck = pool.length === 1; continue; }
                    gates.push({ op: 'NOT', a });
                    notsLeft--;
                } else {
                    const a = take(), b = take();
                    gates.push({ op: this._pick(ops), a, b });
                }
                pool.push(leaves + gates.length - 1);
            }
            if (stuck || (this.xor && !gates.some(g => g.op === 'XOR'))) continue;
            const mod = { kind: 'circuit', done: false, inputs, gates };
            if (LogicBombMechanic.circuitDepth(mod) > 3) continue;   // three gate columns fit the module
            // Safe settings must be rare enough that guessing costs strikes.
            const all = [];
            for (let m = 0; m < (1 << free); m++) all.push(Array.from({ length: free }, (x, k) => (m >> k) & 1));
            const safe = all.filter(s => LogicBombMechanic.circuitSafe(mod, s));
            if (!safe.length || safe.length > Math.floor(all.length * 3 / 8)) continue;
            // CLK must matter: some setting is safe for one CLK value only.
            if (this.clock && !all.some(s => {
                const a = LogicBombMechanic.evalCircuit(mod, s.concat([0])), b = LogicBombMechanic.evalCircuit(mod, s.concat([1]));
                return a !== b;
            })) continue;
            // Every free switch must matter somewhere.
            let useful = true;
            for (let k = 0; k < free && useful; k++) {
                useful = all.some(s => {
                    const t = s.slice(); t[k] = 1 - t[k];
                    return LogicBombMechanic.circuitSafe(mod, s) !== LogicBombMechanic.circuitSafe(mod, t);
                });
            }
            if (!useful) continue;
            // Start where the nearest safe setting is two flips away when it can be.
            const dist = (a) => Math.min(...safe.map(s => s.reduce((n, v, k) => n + (v !== a[k] ? 1 : 0), 0)));
            const unsafe = all.filter(s => !LogicBombMechanic.circuitSafe(mod, s));
            const far = unsafe.filter(s => dist(s) >= 2);
            mod.start = this._pick(far.length ? far : unsafe).slice();
            mod.switches = mod.start.slice();
            mod.minFlips = dist(mod.start);
            mod.flips = mod.minFlips + this.flipSlack;
            this._layoutCircuit(mod);
            return mod;
        }
        // Fallback: A OR B OR C.
        const mod = { kind: 'circuit', done: false, inputs: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
            gates: [{ op: 'OR', a: 0, b: 1 }, { op: 'OR', a: 3, b: 2 }], start: [1, 0, 1], switches: [1, 0, 1], minFlips: 2, flips: 2 + this.flipSlack };
        this._layoutCircuit(mod);
        return mod;
    }

    /**
     * Positions for switches, gates (by depth) and the output lamp.
     * Switches are stacked in the tree's own order, so every gate sits
     * between its inputs and no wire runs underneath a gate. The free
     * switches are then named A, B, C… top to bottom.
     */
    _layoutCircuit(mod) {
        const M = this.moduleRect();
        const L = mod.inputs.length;
        const top = M.y + 40, bottom = M.y + M.h - 40;
        const order = [];
        const walk = (r) => {
            if (r < L) { order.push(r); return; }
            const g = mod.gates[r - L];
            walk(g.a);
            if (g.op !== 'NOT') walk(g.b);
        };
        walk(L + mod.gates.length - 1);
        mod.inPos = [];
        order.forEach((r, k) => { mod.inPos[r] = { x: M.x + 52, y: top + (bottom - top) * (L === 1 ? 0.5 : k / (L - 1)) }; });
        let letter = 0;
        order.forEach(r => { if (!mod.inputs[r].clock) mod.inputs[r].name = 'ABCD'[letter++]; });

        const depth = [];
        const d = (r) => r < L ? 0 : depth[r - L];
        mod.gates.forEach((g, k) => { depth[k] = 1 + Math.max(d(g.a), g.op === 'NOT' ? 0 : d(g.b)); });
        const maxD = Math.max(...depth);
        const x0 = M.x + 160, x1 = M.x + M.w - 140;
        mod.gatePos = [];
        const posOf = (r) => r < L ? mod.inPos[r] : mod.gatePos[r - L];
        // Gates in creation order: operands always come first.
        mod.gates.forEach((g, k) => {
            const level = depth[k];
            const x = maxD === 1 ? (x0 + x1) / 2 : x0 + (x1 - x0) * (level - 1) / (maxD - 1);
            const y = g.op === 'NOT' ? posOf(g.a).y : (posOf(g.a).y + posOf(g.b).y) / 2;
            mod.gatePos[k] = { x, y };
        });
        const last = mod.gatePos[mod.gates.length - 1];
        mod.outPos = { x: M.x + M.w - 40, y: Math.max(M.y + 60, Math.min(M.y + M.h - 120, last.y)) };

    }

    _makePad() {
        for (let tries = 0; tries < 400; tries++) {
            const columns = Array.from({ length: this.padColumns }, () => this._shuffle(LB_SYMBOLS.slice()).slice(0, 6));
            const col = this._int(columns.length);
            const picks = this._shuffle([0, 1, 2, 3, 4, 5]).slice(0, 4).sort((a, b) => a - b);
            const order = picks.map(i => columns[col][i]);
            // Only one column may hold all four.
            if (columns.some((c, j) => j !== col && order.every(s => c.indexOf(s) >= 0))) continue;
            // Some symbols should show up in other columns too, so a glance is not enough.
            if (!order.some(s => columns.some((c, j) => j !== col && c.indexOf(s) >= 0))) continue;
            const keys = this._shuffle(order.slice());
            return { kind: 'pad', done: false, columns, col, order, keys, pressed: 0, wrong: -1, wrongT: 0 };
        }
        const columns = [LB_SYMBOLS.slice(0, 6), LB_SYMBOLS.slice(6, 12), LB_SYMBOLS.slice(12, 18)];
        const order = columns[0].slice(0, 4);
        return { kind: 'pad', done: false, columns, col: 0, order, keys: order.slice().reverse(), pressed: 0, wrong: -1, wrongT: 0 };
    }

    _makeButton() {
        const colors = ['RED', 'BLUE', 'YELLOW', 'WHITE'];
        const labels = ['ABORT', 'HOLD', 'DETONATE', 'PRESS'];
        for (let tries = 0; tries < 400; tries++) {
            const color = this._pick(colors), label = this._pick(labels);
            const view = this._view({ color, label });
            const own = () => this.rng() < 0.5
                ? (C => ({ text: lbT('the button is {C}', { C: lbT(C) }), test: v => v.color === C }))(this._pick(colors))
                : (Lb => ({ text: lbT('the button says {L}', { L: lbT(Lb) }), test: v => v.label === Lb }))(this._pick(labels));
            const action = () => this.rng() < 0.5
                ? { text: lbT('press and release at once'), pick: () => 'tap' }
                : { text: lbT('hold it down'), pick: () => 'hold' };
            // A card that says "tap" on every line would teach nothing.
            const card = this._ruleCard(3, own, action, view, rules => new Set(rules.map(r => r.act.pick(view))).size === 2);
            if (!card) continue;
            // Release digits: three strip colours with their own digit, the rest share one.
            const strips = ['BLUE', 'WHITE', 'YELLOW'];
            const digits = this._shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 4);
            const release = { BLUE: digits[0], WHITE: digits[1], YELLOW: digits[2], other: digits[3] };
            const strip = this._pick(['BLUE', 'WHITE', 'YELLOW', 'RED', 'GREEN']);
            const digit = strips.indexOf(strip) >= 0 ? release[strip] : release.other;
            return Object.assign({ kind: 'button', done: false, color, label, strip, release, digit }, card);
        }
        return { kind: 'button', done: false, color: 'RED', label: 'HOLD', strip: 'BLUE', release: { BLUE: 4, WHITE: 1, YELLOW: 5, other: 1 },
            digit: 4, applied: 0, answer: 'hold', edge: false, rules: [{ cond: null, act: { text: lbT('hold it down'), pick: () => 'hold' } }] };
    }

    /** The right move for a module (tests and bots). */
    static solve(mod) {
        if (mod.kind === 'wires') return { wire: mod.answer };
        if (mod.kind === 'pad') return { keys: mod.order.map(s => mod.keys.indexOf(s)) };
        if (mod.kind === 'button') return { hold: mod.answer === 'hold', digit: mod.digit };
        const free = mod.inputs.filter(i => !i.clock).length;
        let best = null, bestD = Infinity;
        for (let m = 0; m < (1 << free); m++) {
            const s = Array.from({ length: free }, (x, k) => (m >> k) & 1);
            const d = s.reduce((n, v, k) => n + (v !== mod.switches[k] ? 1 : 0), 0);
            if (d < bestD && LogicBombMechanic.circuitSafe(mod, s)) { best = s; bestD = d; }
        }
        return best && { switches: best };
    }

    // ── Coaching ──

    /**
     * The guided lesson on the first module of the first stage: the timer,
     * the MANUAL, then every rule in turn until the true one, then the cut.
     */
    _queueTour() {
        if (!this.tutorial || this.defused > 0) return;
        const mod = this.mods[0];
        const steps = [
            { kind: 'info', text: 'The attacker left a LOGIC BOMB. Defuse all of its modules before this timer hits zero.', rects: [this.timerRect()] },
            { kind: 'info', text: 'Every module comes with a MANUAL, here on the right. It tells you exactly what to do.', rects: [this.cardRect()] }
        ];
        if (mod.kind === 'wires') {
            const p = this.wirePos(mod, mod.answer);
            const line = { x: p.x0 - 40, y: p.y - p.gap / 2, w: p.x1 - p.x0 + 60, h: p.gap };
            steps.push({ kind: 'info', text: 'Check the rules from the top. Only the FIRST rule that is true counts.', rows: [] });
            for (let k = 0; k < mod.applied; k++) {
                steps.push({ kind: 'info', rows: [k], text: 'Rule {n}: "if {cond}". That is NOT true here — skip it, check the next one.', vars: { n: k + 1, cond: mod.rules[k].cond.text } });
            }
            const r = mod.rules[mod.applied];
            steps.push(r.cond
                ? { kind: 'info', rows: [mod.applied], text: 'Rule {n}: "if {cond}". That IS true here! So: {act} — line {line}.', vars: { n: mod.applied + 1, cond: r.cond.text, act: r.act.text, line: mod.answer + 1 } }
                : { kind: 'info', rows: [mod.applied], text: 'No rule above is true, so the last one counts: {act} — line {line}.', vars: { act: r.act.text, line: mod.answer + 1 } });
            steps.push({ kind: 'select', wire: mod.answer, rects: [line], text: 'Tap line {n} to select it.', vars: { n: mod.answer + 1 } });
            steps.push({ kind: 'cut', wire: mod.answer, rects: [line], text: 'Tap it again to cut it.' });
        }
        this.coachQueue.push(...steps);
        if (!this.coach) this._nextCoach();
    }

    /** After the lesson's module: what comes next, then the lesson is done. */
    _tourDone() {
        const tabs = this.mods.map((m, i) => this.tabRect(i));
        if (this.coachStore) this.coachStore.mark('wires');
        this.coachQueue.unshift({ kind: 'info', key: 'tutorial', rects: tabs,
            text: 'Module defused! The next module opened by itself — the tabs up here show them all, green = done. A wrong move is a STRIKE: the timer runs faster, and 3 strikes blow the bomb. The rules change every time, so always read the MANUAL.' });
        this.coach = null;
        this._nextCoach();
    }

    /** One-time explanations the first time a module kind (or feature) is opened. */
    _opened(mod) {
        const store = this.coachStore;
        if (!store || !mod) return;
        const M = this.moduleRect();
        const topics = [
            ['wires', mod.kind === 'wires' && !this.tutorial, 'DATA LINES: check the MANUAL\'s rules from the top. Only the FIRST true rule counts — it says which line to cut. Tap a line to select it, tap again to cut.', [M]],
            ['circuit', mod.kind === 'circuit', 'TRIGGER: the red lamp is DETONATE. Tap the switches (0 ↔ 1) until the lamp goes OFF. Lit wires carry a 1. Flips are limited — think first!', [M]],
            ['clock', mod.kind === 'circuit' && mod.inputs.some(i => i.clock), 'CLK flips by itself. The lamp must stay OFF for CLK 0 and CLK 1.', [M]],
            ['pad', mod.kind === 'pad', 'CIPHER PAD: find the MANUAL column that has all four of these symbols. Press them in that column\'s order, top first.', [M]],
            ['button', mod.kind === 'button', 'KILL SWITCH: the MANUAL says TAP it or HOLD it. If you hold, a strip lights up — let go when the timer shows that strip\'s digit.', [M]],
            ['edgework', !!mod.edge, 'Some rules talk about the SIG code and the flags up here. A flag is lit when its light is on.', [this.edgeRect()]]
        ];
        for (const [key, has, text, rects] of topics) {
            if (has && !store.seen(key) && !this.coachQueue.some(c => c.key === key) && !(this.coach && this.coach.key === key)) {
                this.coachQueue.push({ kind: 'info', key, text, rects });
            }
        }
        if (!this.coach) this._nextCoach();
    }

    _nextCoach() {
        if (this.coach && this.coach.key && this.coachStore) this.coachStore.mark(this.coach.key);
        this.coach = this.coachQueue.shift() || null;
    }

    /** Info bubbles wait for a tap; lesson steps wait for the move they ask for. */
    get coachBlocks() { return !!this.coach && this.coach.kind === 'info'; }

    _coachEvent(kind) {
        if (this.coach && this.coach.kind === kind) this._nextCoach();
    }

    // ── Rules ──

    get current() { return this.mods[this.sel]; }

    get busy() { return this.result !== null || this.pause > 0 || this.coachBlocks; }

    selectModule(i) {
        if (this.busy || this.coach || i < 0 || i >= this.mods.length) return false;
        if (this.holding) return false;
        if (i !== this.sel) {
            this.sel = i;
            this.focus = 0;
            if (typeof Sound !== 'undefined' && Sound.playClick) Sound.playClick();
            this._opened(this.mods[i]);
        }
        return true;
    }

    /** First tap selects a line, a second tap on it cuts. */
    tapWire(i) {
        const mod = this.current;
        if (this.busy || !mod || mod.kind !== 'wires' || mod.done) return false;
        if (i === null || i < 0 || i >= mod.wires.length || mod.wires[i].cut) { mod.selected = null; return false; }
        // During the lesson only the line it points at responds.
        if (this.coach && this.coach.wire !== undefined && i !== this.coach.wire) return false;
        if (mod.selected !== i) { mod.selected = i; this._coachEvent('select'); return true; }
        mod.selected = null;
        const lesson = !!(this.coach && this.coach.kind === 'cut');
        this._coachEvent('select');
        this._coachEvent('cut');
        const p = this.wirePos(mod, i);
        if (i === mod.answer) {
            mod.wires[i].cut = true;
            this._spark(p.x, p.y, '#c084fc', 14);
            this._moduleDone(mod);
            if (lesson) this._tourDone();
        } else {
            // A wrong line is patched at once; the strike stays.
            this._spark(p.x, p.y, '#ef4444', 8);
            this._strike('WRONG LINE — PATCHED');
        }
        return true;
    }

    /** One flip. The lamp off for good defuses; the last flip spent on a live lamp is a strike. */
    toggleSwitch(k) {
        const mod = this.current;
        if (this.busy || !mod || mod.kind !== 'circuit' || mod.done || k < 0 || k >= mod.switches.length || mod.flips <= 0) return false;
        mod.switches[k] = 1 - mod.switches[k];
        mod.flips--;
        if (typeof Sound !== 'undefined' && Sound.playClick) Sound.playClick();
        if (LogicBombMechanic.circuitSafe(mod, mod.switches)) {
            this._spark(mod.outPos.x, mod.outPos.y, '#22c55e', 14);
            this._moduleDone(mod);
        } else if (mod.flips <= 0) {
            this._spark(mod.outPos.x, mod.outPos.y, '#ef4444', 10);
            mod.switches = mod.start.slice();
            mod.flips = mod.minFlips + this.flipSlack;
            this._strike('OUT OF FLIPS — SWITCHES RESET');
        }
        return true;
    }

    pressKey(k) {
        const mod = this.current;
        if (this.busy || !mod || mod.kind !== 'pad' || mod.done || k < 0 || k >= 4) return false;
        const at = mod.order.indexOf(mod.keys[k]);
        if (at < mod.pressed) return true;    // already lit
        if (at === mod.pressed) {
            mod.pressed++;
            if (typeof Sound !== 'undefined' && Sound.playClick) Sound.playClick();
            if (mod.pressed >= 4) this._moduleDone(mod);
        } else {
            mod.wrong = k;
            mod.wrongT = 0.5;
            this._strike('WRONG KEY');
        }
        return true;
    }

    pressButton() {
        const mod = this.current;
        if (this.busy || !mod || mod.kind !== 'button' || mod.done || this.holding) return false;
        this.holding = { t: 0 };
        return true;
    }

    /** `judge` false drops a hold without a verdict (window blur, pause, revive). */
    _releaseButton(judge = true) {
        const h = this.holding;
        this.holding = null;
        const mod = this.current;
        if (!h || !judge || this.result !== null || !mod || mod.kind !== 'button' || mod.done) return false;
        if (h.t < LB_HOLD) {
            if (mod.answer === 'tap') this._moduleDone(mod);
            else this._strike('IT HAD TO BE HELD');
        } else if (mod.answer === 'tap') {
            this._strike('IT HAD TO BE TAPPED');
        } else if (this.timerText().indexOf(String(mod.digit)) >= 0) {
            this._moduleDone(mod);
        } else {
            this._strike('RELEASED ON THE WRONG DIGIT');
        }
        return true;
    }

    _moduleDone(mod) {
        mod.done = true;
        this.modulesDone++;
        if (typeof Sound !== 'undefined' && Sound.playGood) Sound.playGood(LogicBombMechanic.SOUND);
        if (this.mods.every(m => m.done)) { this._payloadDefused(); return; }
        this.message = { text: 'MODULE DEFUSED', color: '#22c55e', t: 1.0 };
        // Open the next live module.
        for (let k = 1; k <= this.mods.length; k++) {
            const j = (this.sel + k) % this.mods.length;
            if (!this.mods[j].done) { this.sel = j; this.focus = 0; this._opened(this.mods[j]); break; }
        }
    }

    _strike(text) {
        this.strikes++;
        this.totalStrikes++;
        this.hurt = 0.5;
        this.message = { text: lbT('STRIKE — {why}', { why: lbT(text) }), color: '#ef4444', t: 1.5 };
        if (typeof Sound !== 'undefined' && Sound.playMiss) Sound.playMiss();
        if (this.strikes >= this.maxStrikes) this._detonate();
    }

    _detonate() {
        this.holding = null;
        this.boom = 1;
        this.result = 'fail';
        this.message = { text: 'PAYLOAD DETONATED', color: '#ef4444', t: 3 };
    }

    _payloadDefused() {
        this.defused++;
        this.timeShares.push(Math.max(0, this.timeLeft) / this.timeLimit);
        this.timeBank += Math.max(0, this.timeLeft);
        this.flash = 0.6;
        if (typeof Sound !== 'undefined' && Sound.playStamp) Sound.playStamp();
        if (this.defused >= this.payloads) {
            this.result = 'success';
            this.score = this.computeScore();
            return;
        }
        this.message = { text: 'PAYLOAD DEFUSED', color: '#22c55e', t: this.defusedPause };
        this.pause = this.defusedPause;
    }

    computeScore() {
        return Math.max(0, this.modulesDone * 150 + this.defused * 300 + Math.floor(this.timeBank) * 10 - this.totalStrikes * 100);
    }

    /** End-of-stage numbers for the star rules (draft thresholds, pending approval). */
    starStats() {
        const n = this.timeShares.length;
        return { strikes: this.totalStrikes, timeShare: n ? this.timeShares.reduce((a, b) => a + b, 0) / n : 0 };
    }

    /** The countdown as shown: m:ss. The kill switch reads its digits from this. */
    timerText() {
        const s = Math.max(0, Math.ceil(this.timeLeft - 1e-9));
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    }

    get speed() { return 1 + this.speedPerStrike * this.strikes; }

    update(dt) {
        if (!this.active) return;
        this.stepDt = dt || this.stepDt;
        const h = this.stepDt;
        this.time += h;
        if (this.flash > 0) this.flash -= h;
        if (this.hurt > 0) this.hurt -= h;
        if (this.boom > 0) this.boom = Math.max(0, this.boom - h * 0.8);
        if (this.message) { this.message.t -= h; if (this.message.t <= 0) this.message = null; }
        for (const m of this.mods) if (m.kind === 'pad' && m.wrongT > 0) { m.wrongT -= h; if (m.wrongT <= 0) m.wrong = -1; }
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const s = this.sparks[i];
            s.life -= h * 2.2;
            s.x += s.vx * h;
            s.y += s.vy * h;
            if (s.life <= 0) this.sparks.splice(i, 1);
        }
        if (this.result !== null || this.coach) return;   // the timer waits for the coach
        if (this.pause > 0) {
            this.pause -= h;
            if (this.pause <= 0) this._newPayload();
            return;
        }
        if (this.holding) this.holding.t += h;
        this.timeLeft -= h * this.speed;
        const shown = Math.ceil(this.timeLeft);
        if (shown !== this._ticked) {
            this._ticked = shown;
            if (shown <= 10 && shown > 0 && typeof Sound !== 'undefined' && Sound.playClick) Sound.playClick();
        }
        if (this.timeLeft <= 0) {
            this.timeLeft = 0;
            this._detonate();
        }
    }

    _spark(x, y, color, n) {
        for (let k = 0; k < n; k++) {
            const a = this.rng() * Math.PI * 2, v = 60 + this.rng() * 140;
            this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color });
        }
    }

    // ── Geometry of the open module ──

    wirePos(mod, i) {
        const M = this.moduleRect();
        const n = mod.wires.length;
        const y = M.y + 30 + (M.h - 60) * (i + 0.5) / n;
        return { x: M.x + M.w / 2, y, x0: M.x + 70, x1: M.x + M.w - 40, gap: (M.h - 60) / n };
    }

    keyRect(k) {
        const M = this.moduleRect();
        const w = 128, h = 112, gap = 18;
        const x = M.x + M.w / 2 - w - gap / 2 + (k % 2) * (w + gap);
        const y = M.y + M.h / 2 - h - gap / 2 + Math.floor(k / 2) * (h + gap);
        return { x, y, w, h };
    }

    buttonGeom() {
        const M = this.moduleRect();
        return { x: M.x + M.w * 0.42, y: M.y + M.h / 2, r: 92, strip: { x: M.x + M.w * 0.42 + 150, y: M.y + M.h / 2 - 110, w: 30, h: 220 } };
    }

    switchRect(mod, k) {
        const p = mod.inPos[k];
        return { x: p.x - 40, y: p.y - 24, w: 80, h: 48 };
    }

    /** Tap / focus targets of the open module, in reading order. */
    controls() {
        const mod = this.current;
        if (!mod || mod.done) return [];
        if (mod.kind === 'wires') {
            return mod.wires.map((w, i) => {
                const p = this.wirePos(mod, i);
                return { act: 'wire', i, x: p.x0 - 50, y: p.y - p.gap / 2, w: p.x1 - p.x0 + 80, h: p.gap };
            }).filter(c => !mod.wires[c.i].cut);
        }
        if (mod.kind === 'circuit') {
            const out = [];
            mod.inputs.forEach((inp, k) => { if (!inp.clock) out.push(Object.assign({ act: 'switch', i: k }, this.switchRect(mod, k))); });
            return out;
        }
        if (mod.kind === 'pad') return [0, 1, 2, 3].map(k => Object.assign({ act: 'key', i: k }, this.keyRect(k)));
        const b = this.buttonGeom();
        return [{ act: 'button', i: 0, x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 }];
    }

    _activate(c, viaKey) {
        if (!c) return false;
        if (c.act === 'wire') return this.tapWire(c.i);
        if (c.act === 'switch') return this.toggleSwitch(c.i);
        if (c.act === 'key') return this.pressKey(c.i);
        if (c.act === 'button') return this.pressButton();
        return false;
    }

    _moveFocus(dx, dy) {
        const list = this.controls();
        if (!list.length) return false;
        const at = list[Math.min(this.focus, list.length - 1)];
        const cx = (c) => c.x + c.w / 2, cy = (c) => c.y + c.h / 2;
        let best = -1, bestScore = Infinity;
        list.forEach((c, j) => {
            if (c === at) return;
            const along = (cx(c) - cx(at)) * dx + (cy(c) - cy(at)) * dy;
            if (along <= 1) return;
            const across = Math.abs((cx(c) - cx(at)) * dy - (cy(c) - cy(at)) * dx);
            const score = along + across * 2;
            if (score < bestScore) { bestScore = score; best = j; }
        });
        if (best >= 0) {
            this.focus = best;
            const mod = this.current;
            if (mod.kind === 'wires') mod.selected = null;
        }
        return best >= 0;
    }

    // ── Input ──

    handleKey(code) {
        if (this.result !== null) return false;
        this.kbd = true;
        if (this.coachBlocks) {
            if (code === 'Space' || code === 'Enter') this._nextCoach();
            return true;
        }
        const digit = /^(Digit|Numpad)([1-9])$/.exec(code);
        if (digit) { this.selectModule(Number(digit[2]) - 1); return true; }
        if (code === 'Tab') { this.selectModule((this.sel + 1) % this.mods.length); return true; }
        if (code === 'ArrowLeft' || code === 'KeyA') return this._moveFocus(-1, 0) || true;
        if (code === 'ArrowRight' || code === 'KeyD') return this._moveFocus(1, 0) || true;
        if (code === 'ArrowUp' || code === 'KeyW') return this._moveFocus(0, -1) || true;
        if (code === 'ArrowDown' || code === 'KeyS') return this._moveFocus(0, 1) || true;
        if (code === 'Space' || code === 'Enter') {
            if (this.holding) return true;   // key repeat while holding the switch
            const list = this.controls();
            this.focus = Math.min(this.focus, Math.max(0, list.length - 1));
            // Wires: the first press selects the focused line, the second cuts.
            this._activate(list[this.focus], true);
            return true;
        }
        return false;
    }

    handleKeyUp(code) {
        if ((code === 'Space' || code === 'Enter') && this.holding) { this._releaseButton(true); return true; }
        return false;
    }

    handlePointer(x, y, phase) {
        if (phase === 'up') { if (this.holding) this._releaseButton(true); return true; }
        if (phase && phase !== 'down') return false;
        if (this.result !== null) return false;
        this.kbd = false;
        if (this.coachBlocks) { this._nextCoach(); return true; }
        const inside = (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
        for (let i = 0; i < this.mods.length; i++) {
            if (inside(this.tabRect(i))) { this.selectModule(i); return true; }
        }
        const mod = this.current;
        if (mod && mod.kind === 'button') {
            const b = this.buttonGeom();
            if (Math.hypot(x - b.x, y - b.y) <= b.r + 12) this.pressButton();
            return true;
        }
        const list = this.controls();
        const j = list.findIndex(inside);
        if (j >= 0) {
            this.focus = j;
            this._activate(list[j], false);
        } else if (mod && mod.kind === 'wires') {
            mod.selected = null;
        }
        return true;
    }

    /** Drop every hold (window blur, pause prompt): no verdict. */
    releaseAll() {
        this._releaseButton(false);
    }

    // ── Render ──

    render(ctx, W, H) {
        const shake = this.boom > 0 && !(typeof UITheme !== 'undefined' && UITheme.reducedMotion)
            ? this.boom * 10 : 0;
        ctx.save();
        if (shake) ctx.translate(Math.sin(this.time * 70) * shake, Math.cos(this.time * 53) * shake);
        this._renderVault(ctx);
        this._renderPanel(ctx);
        for (const s of this.sparks) {
            ctx.globalAlpha = Math.max(0, s.life);
            ctx.fillStyle = s.color;
            ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
        }
        ctx.globalAlpha = 1;
        ctx.restore();

        const wash = this.boom > 0 ? ['#f97316', this.boom * 0.45]
            : this.flash > 0 ? ['#22c55e', this.flash / 0.6 * 0.12]
            : this.hurt > 0 ? ['#ef4444', this.hurt / 0.5 * 0.18] : null;
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

    _renderVault(ctx) {
        const V = this.vaultRect();
        UITheme.panel(ctx, V.x, V.y, V.w, V.h, { chamfer: 16, fill: 'rgba(10,14,24,0.9)', stroke: 'rgba(236,72,153,0.55)', lineWidth: 1.6 });
        // Bolts in the corners
        ctx.fillStyle = 'rgba(148,163,184,0.35)';
        for (const [bx, by] of [[V.x + 14, V.y + V.h - 14], [V.x + V.w - 14, V.y + V.h - 14]]) {
            ctx.beginPath(); ctx.arc(bx, by, 3.5, 0, Math.PI * 2); ctx.fill();
        }
        // Tabs
        const blink = 0.5 + 0.5 * Math.sin(this.time * 6);
        this.mods.forEach((m, i) => {
            const r = this.tabRect(i);
            const on = i === this.sel;
            UITheme.panel(ctx, r.x, r.y, r.w, r.h, {
                chamfer: 8,
                fill: on ? 'rgba(236,72,153,0.18)' : 'rgba(15,23,42,0.85)',
                stroke: on ? '#ec4899' : 'rgba(100,116,139,0.6)',
                lineWidth: on ? 2 : 1.2
            });
            ctx.fillStyle = m.done ? '#22c55e' : `rgba(239,68,68,${0.45 + 0.55 * blink})`;
            ctx.beginPath(); ctx.arc(r.x + 16, r.y + r.h / 2, 6, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = on ? '#fce7f3' : m.done ? '#64748b' : '#cbd5e1';
            ctx.font = '700 15px Orbitron, OrbitronTR';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(LB_NAMES[m.kind], r.x + r.w / 2 + 8, r.y + r.h / 2 - 6);
            ctx.fillStyle = '#64748b';
            ctx.font = '600 13px Rajdhani';
            ctx.fillText(m.done ? lbT('DEFUSED') : `${i + 1}`, r.x + r.w / 2 + 8, r.y + r.h / 2 + 12);
        });

        const M = this.moduleRect();
        ctx.strokeStyle = 'rgba(100,116,139,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(M.x, M.y - 6); ctx.lineTo(M.x + M.w, M.y - 6); ctx.stroke();
        const mod = this.current;
        if (!mod) return;
        if (mod.kind === 'wires') this._renderWires(ctx, mod);
        else if (mod.kind === 'circuit') this._renderCircuit(ctx, mod);
        else if (mod.kind === 'pad') this._renderPad(ctx, mod);
        else this._renderButton(ctx, mod);
        if (mod.done) {
            ctx.fillStyle = 'rgba(8,12,20,0.55)';
            ctx.fillRect(M.x, M.y, M.w, M.h);
            ctx.fillStyle = '#22c55e';
            ctx.font = '700 30px Orbitron, OrbitronTR';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(lbT('DEFUSED'), M.x + M.w / 2, M.y + M.h / 2);
        }
        // Keyboard focus ring
        if (this.kbd && !mod.done && !this.coach) {
            const list = this.controls();
            const c = list[Math.min(this.focus, list.length - 1)];
            if (c) {
                ctx.strokeStyle = 'rgba(250,204,21,0.85)';
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 5]);
                ctx.strokeRect(c.x - 4, c.y - 4, c.w + 8, c.h + 8);
                ctx.setLineDash([]);
            }
        }
    }

    _renderWires(ctx, mod) {
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 5);
        ctx.lineCap = 'round';
        mod.wires.forEach((w, i) => {
            const p = this.wirePos(mod, i);
            const color = LB_COLORS[w.color];
            // Terminals
            ctx.fillStyle = 'rgba(30,41,59,0.95)';
            ctx.strokeStyle = 'rgba(148,163,184,0.6)';
            ctx.lineWidth = 1.2;
            for (const tx of [p.x0 - 16, p.x1 + 4]) { ctx.fillRect(tx, p.y - 10, 12, 20); ctx.strokeRect(tx, p.y - 10, 12, 20); }
            ctx.fillStyle = '#94a3b8';
            ctx.font = '700 16px Orbitron, OrbitronTR';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(i + 1), p.x0 - 26, p.y);
            // The line: a slight sag, cut lines leave two stubs
            const sag = Math.min(14, p.gap * 0.22);
            const path = (from, to) => {
                ctx.beginPath();
                for (let s = 0; s <= 24; s++) {
                    const t = from + (to - from) * s / 24;
                    const x = p.x0 + (p.x1 - p.x0) * t, y = p.y + Math.sin(Math.PI * t) * sag;
                    if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
            };
            const draw = (from, to) => {
                ctx.strokeStyle = 'rgba(2,6,23,0.9)';
                ctx.lineWidth = 11;
                path(from, to); ctx.stroke();
                ctx.strokeStyle = color;
                ctx.lineWidth = 7;
                path(from, to); ctx.stroke();
            };
            if (w.cut) { draw(0, 0.44); draw(0.56, 1); } else draw(0, 1);
            if (mod.selected === i && !w.cut) {
                ctx.strokeStyle = `rgba(250,250,250,${0.25 + 0.25 * pulse})`;
                ctx.lineWidth = 18;
                path(0, 1); ctx.stroke();
                const mx = p.x0 + (p.x1 - p.x0) / 2, my = p.y + sag;
                ctx.fillStyle = 'rgba(15,23,42,0.96)';
                ctx.strokeStyle = '#fbbf24';
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(mx, my, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                ctx.fillStyle = '#fbbf24';
                ctx.font = '700 17px Rajdhani';
                ctx.textAlign = 'center';
                ctx.fillText('✂', mx, my + 1);
            }
            // Colour name, for colour-blind players
            ctx.fillStyle = color;
            ctx.font = '700 13px Rajdhani';
            ctx.textAlign = 'left';
            ctx.fillText(lbT(w.color), p.x0 + 6, p.y - 14);
        });
    }

    _renderCircuit(ctx, mod) {
        const L = mod.inputs.length;
        const posOf = (r) => r < L ? mod.inPos[r] : mod.gatePos[r - L];
        const gw = 64, gh = 46;
        // Live signals (CLK shows its current value).
        const clk = Math.floor(this.time / 1.2) % 2;
        const vals = LogicBombMechanic.signals(mod, mod.inputs.some(i => i.clock) ? mod.switches.concat([clk]) : mod.switches);
        const on = '#22d3ee', off = 'rgba(100,116,139,0.6)';
        // Wires: run level from the source, turn in a lane just left of the
        // gate (top port outer lane, bottom port inner lane), so verticals
        // never share a line. The upper source takes the top port.
        ctx.lineJoin = 'round';
        const wire = (src, to, dy, lane) => {
            const from = posOf(src), lit = vals[src] === 1;
            const sx = from.x + (src >= L ? gw / 2 : 40), sy = from.y;
            const tx = to.x - gw / 2, ty = to.y + dy;
            const mx = tx - 10 - lane * 11;
            ctx.strokeStyle = lit ? on : off;
            ctx.lineWidth = lit ? 3.5 : 2.5;
            if (lit) { ctx.shadowColor = on; ctx.shadowBlur = 8; }
            ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(mx, sy); ctx.lineTo(mx, ty); ctx.lineTo(tx, ty); ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.fillStyle = lit ? on : off;
            ctx.beginPath(); ctx.arc(tx, ty, 3, 0, Math.PI * 2); ctx.fill();
        };
        mod.gates.forEach((g, j) => {
            const to = mod.gatePos[j];
            if (g.op === 'NOT') { wire(g.a, to, 0, 0); return; }
            const [hi, lo] = posOf(g.a).y <= posOf(g.b).y ? [g.a, g.b] : [g.b, g.a];
            wire(hi, to, -12, posOf(hi).y < to.y - 12 ? 1 : 0);
            wire(lo, to, 12, posOf(lo).y > to.y + 12 ? 1 : 0);
        });
        const outRef = L + mod.gates.length - 1;
        const fire = vals[outRef] === 1 && !mod.done;
        const last = mod.gatePos[mod.gates.length - 1];
        const ox = (last.x + gw / 2 + mod.outPos.x - 30) / 2;
        ctx.strokeStyle = fire ? '#ef4444' : off;
        ctx.lineWidth = fire ? 3.5 : 2.5;
        ctx.beginPath();
        ctx.moveTo(last.x + gw / 2, last.y); ctx.lineTo(ox, last.y); ctx.lineTo(ox, mod.outPos.y); ctx.lineTo(mod.outPos.x - 30, mod.outPos.y);
        ctx.stroke();

        // Gates, with the value they put out
        mod.gates.forEach((g, j) => {
            const p = mod.gatePos[j];
            const lit = vals[L + j] === 1;
            UITheme.panel(ctx, p.x - gw / 2, p.y - gh / 2, gw, gh, { chamfer: 8, fill: 'rgba(30,41,59,0.98)', stroke: lit ? on : '#a78bfa', lineWidth: 1.8 });
            ctx.fillStyle = '#ddd6fe';
            ctx.font = '700 15px Orbitron, OrbitronTR';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(g.op, p.x, p.y + 1);
        });

        // Switches (CLK flips by itself, it is not a control)
        mod.inputs.forEach((inp, i) => {
            const r = this.switchRect(mod, i);
            const v = vals[i];
            const color = inp.clock ? '#fbbf24' : v ? on : '#64748b';
            UITheme.panel(ctx, r.x, r.y, r.w, r.h, { chamfer: 6, fill: inp.clock ? 'rgba(251,191,36,0.1)' : v ? 'rgba(34,211,238,0.12)' : 'rgba(15,23,42,0.95)', stroke: color, lineWidth: 2 });
            ctx.fillStyle = color;
            ctx.font = '700 15px Orbitron, OrbitronTR';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(inp.name, r.x + 10, r.y + r.h / 2);
            ctx.font = '700 22px Orbitron, OrbitronTR';
            ctx.textAlign = 'right';
            ctx.fillText(String(v), r.x + r.w - 10, r.y + r.h / 2 + 1);
        });

        // DETONATE lamp: red while it fires, dark when off, green once defused
        const o = mod.outPos;
        const lamp = mod.done ? '#22c55e' : fire ? '#ef4444' : '#475569';
        ctx.fillStyle = fire ? 'rgba(239,68,68,0.35)' : 'rgba(15,23,42,0.96)';
        ctx.strokeStyle = lamp;
        ctx.lineWidth = 3;
        if (fire) { ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 10 + 8 * Math.sin(this.time * 6); }
        ctx.beginPath(); ctx.arc(o.x, o.y, 28, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = lamp;
        ctx.font = '700 15px Orbitron, OrbitronTR';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const state = lbT(mod.done ? 'OFF' : fire ? 'ON' : 'off');
        if (ctx.measureText(state).width > 50) ctx.font = '700 11px Orbitron, OrbitronTR';
        ctx.fillText(state, o.x, o.y + 1);
        ctx.font = '700 12px Orbitron, OrbitronTR';
        ctx.fillText(lbT('DETONATE'), o.x, o.y - 40);
        // Flips left
        ctx.fillStyle = mod.flips <= 1 && !mod.done ? '#fbbf24' : '#94a3b8';
        ctx.font = '700 12px Orbitron, OrbitronTR';
        ctx.fillText(lbT('FLIPS LEFT'), o.x, o.y + 52);
        ctx.font = '700 28px Orbitron, OrbitronTR';
        ctx.fillText(String(mod.flips), o.x, o.y + 80);
    }

    _renderPad(ctx, mod) {
        mod.keys.forEach((s, k) => {
            const r = this.keyRect(k);
            const lit = mod.order.indexOf(s) < mod.pressed;
            const bad = mod.wrong === k;
            UITheme.panel(ctx, r.x, r.y, r.w, r.h, {
                chamfer: 10,
                fill: bad ? 'rgba(239,68,68,0.25)' : 'rgba(30,41,59,0.96)',
                stroke: lit ? '#22c55e' : bad ? '#ef4444' : 'rgba(148,163,184,0.7)',
                lineWidth: 2
            });
            ctx.fillStyle = lit ? '#22c55e' : 'rgba(71,85,105,0.8)';
            ctx.fillRect(r.x + r.w / 2 - 16, r.y + 10, 32, 6);
            ctx.fillStyle = '#f1f5f9';
            ctx.font = '700 52px Rajdhani';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(s, r.x + r.w / 2, r.y + r.h / 2 + 8);
        });
    }

    _renderButton(ctx, mod) {
        const b = this.buttonGeom();
        const held = !!this.holding;
        const fill = LB_COLORS[mod.color];
        ctx.fillStyle = 'rgba(2,6,23,0.9)';
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = fill;
        ctx.globalAlpha = held ? 0.75 : 1;
        ctx.beginPath(); ctx.arc(b.x, b.y + (held ? 3 : 0), b.r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(b.x, b.y + (held ? 3 : 0), b.r - 8, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
        ctx.fillStyle = mod.color === 'YELLOW' || mod.color === 'WHITE' ? '#0f172a' : '#f8fafc';
        const label = lbT(mod.label);
        ctx.font = `700 ${label.length > 6 ? 22 : 26}px Orbitron, OrbitronTR`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, b.x, b.y + (held ? 3 : 0));
        ctx.fillStyle = '#94a3b8';
        ctx.font = '700 14px Rajdhani';
        ctx.fillText(lbT(mod.color), b.x, b.y + b.r + 26);
        // Strip: lights while held
        const s = b.strip;
        const lit = held && this.holding.t >= 0.15;
        UITheme.panel(ctx, s.x, s.y, s.w, s.h, { chamfer: 4, fill: lit ? LB_COLORS[mod.strip] : 'rgba(15,23,42,0.95)', stroke: 'rgba(148,163,184,0.6)', glow: lit ? LB_COLORS[mod.strip] : null });
        ctx.fillStyle = '#94a3b8';
        ctx.font = '700 13px Rajdhani';
        ctx.fillText(lbT('STRIP'), s.x + s.w / 2, s.y + s.h + 16);
        if (lit) {
            ctx.fillStyle = LB_COLORS[mod.strip];
            ctx.fillText(lbT(mod.strip), s.x + s.w / 2, s.y - 12);
        }
    }

    _renderPanel(ctx) {
        // Timer + strikes
        const T = this.timerRect();
        const low = this.timeLeft < 10 && this.result === null;
        UITheme.panel(ctx, T.x, T.y, T.w, T.h, { chamfer: 12, fill: 'rgba(10,14,24,0.92)', stroke: low ? '#ef4444' : 'rgba(236,72,153,0.55)', lineWidth: 1.6 });
        ctx.fillStyle = 'rgba(239,68,68,0.12)';
        ctx.fillRect(T.x + 14, T.y + 12, 176, T.h - 24);
        ctx.fillStyle = low && Math.sin(this.time * 12) > 0 ? '#fca5a5' : '#ef4444';
        ctx.shadowColor = '#ef4444';
        ctx.shadowBlur = 10;
        ctx.font = '700 44px Orbitron, OrbitronTR';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.timerText(), T.x + 102, T.y + T.h / 2 + 2);
        ctx.shadowBlur = 0;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#94a3b8';
        ctx.font = '700 13px Rajdhani';
        ctx.fillText(this.strikes ? `STRIKES · ×${this.speed.toFixed(2)}` : 'STRIKES', T.x + 210, T.y + 22);
        for (let i = 0; i < this.maxStrikes; i++) {
            const on = i < this.strikes;
            const x = T.x + 222 + i * 40, y = T.y + 50;
            ctx.strokeStyle = on ? '#ef4444' : 'rgba(100,116,139,0.5)';
            ctx.lineWidth = on ? 4 : 2;
            ctx.beginPath(); ctx.moveTo(x - 10, y - 10); ctx.lineTo(x + 10, y + 10); ctx.moveTo(x + 10, y - 10); ctx.lineTo(x - 10, y + 10); ctx.stroke();
        }

        // Edgework: signature and flags
        const E = this.edgeRect();
        UITheme.panel(ctx, E.x, E.y, E.w, E.h, { chamfer: 8, fill: 'rgba(10,14,24,0.92)', stroke: 'rgba(100,116,139,0.5)' });
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = '#64748b';
        ctx.font = '700 13px Rajdhani';
        ctx.fillText('SIG', E.x + 12, E.y + E.h / 2);
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '700 17px Orbitron, OrbitronTR';
        ctx.fillText(this.serial, E.x + 40, E.y + E.h / 2 + 1);
        let fx = E.x + E.w - 12;
        for (let i = this.flags.length - 1; i >= 0; i--) {
            const f = this.flags[i];
            ctx.font = '700 14px Rajdhani';
            ctx.textAlign = 'right';
            ctx.fillStyle = f.lit ? '#fde68a' : '#475569';
            ctx.fillText(f.name, fx, E.y + E.h / 2 + 1);
            const tw = ctx.measureText(f.name).width;
            fx -= (typeof tw === 'number' ? tw : 26) + 14;
            ctx.fillStyle = f.lit ? '#facc15' : 'rgba(71,85,105,0.6)';
            if (f.lit) { ctx.shadowColor = '#facc15'; ctx.shadowBlur = 8; }
            ctx.beginPath(); ctx.arc(fx + 6, E.y + E.h / 2, 5, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
            fx -= 14;
        }

        // The MANUAL of the open module
        const C = this.cardRect();
        const mod = this.current;
        UITheme.panel(ctx, C.x, C.y, C.w, C.h, { chamfer: 12, fill: 'rgba(241,245,249,0.06)', stroke: 'rgba(148,163,184,0.55)' });
        if (!mod) return;
        const lay = this._cardLayout(ctx, mod);
        ctx.fillStyle = '#f9a8d4';
        ctx.font = '700 15px Orbitron, OrbitronTR';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`MANUAL · ${LB_TITLES[mod.kind]}`, C.x + 14, C.y + 20);
        ctx.font = '700 17px Rajdhani';
        lay.goal.forEach((l, k) => this._drawRich(ctx, l, C.x + 14, lay.goalY + k * 21, '#fde68a'));
        const x = C.x + 14, w = C.w - 28;
        if (mod.kind === 'wires' || mod.kind === 'button') {
            const lh = lay.size + 4;
            lay.rows.forEach((r, i) => {
                ctx.fillStyle = 'rgba(15,23,42,0.75)';
                ctx.fillRect(r.x, r.y, r.w, r.h);
                ctx.strokeStyle = 'rgba(100,116,139,0.35)';
                ctx.lineWidth = 1;
                ctx.strokeRect(r.x, r.y, r.w, r.h);
                ctx.fillStyle = '#64748b';
                ctx.font = '700 13px Orbitron, OrbitronTR';
                ctx.textAlign = 'center';
                ctx.fillText(String(i + 1), r.x + 12, r.y + 4 + lh / 2);
                ctx.textAlign = 'left';
                let ly = r.y + 4 + lh / 2;
                ctx.font = `600 ${lay.size}px Rajdhani`;
                for (const l of r.cond) { this._drawRich(ctx, l, r.x + 26, ly, '#cbd5e1'); ly += lh; }
                ctx.font = `700 ${lay.size}px Rajdhani`;
                for (const l of r.act) { this._drawRich(ctx, l, r.x + 26, ly, '#f8fafc'); ly += lh; }
            });
            if (mod.kind === 'button') {
                let y = lay.bottom + 14;
                ctx.font = '700 16px Rajdhani';
                this._drawRich(ctx, lbT('STEP 2 — HOLDING? Let go when the timer shows:'), x, y, '#fde68a');
                y += 14;
                const items = [['BLUE', mod.release.BLUE], ['WHITE', mod.release.WHITE], ['YELLOW', mod.release.YELLOW], ['OTHER', mod.release.other]];
                items.forEach(([c, d], i) => {
                    const cx = x + (i % 2) * (w / 2), cy = y + 12 + Math.floor(i / 2) * 24;
                    ctx.fillStyle = LB_COLORS[c] || '#94a3b8';
                    ctx.fillRect(cx, cy - 7, 14, 14);
                    ctx.fillStyle = '#e2e8f0';
                    ctx.font = '600 16px Rajdhani';
                    ctx.fillText(lbT('{C} strip → a {d}', { C: lbT(c), d }), cx + 22, cy + 1);
                });
            }
        } else if (mod.kind === 'circuit') {
            let y = lay.bottom + 6;
            ctx.font = '600 16px Rajdhani';
            const steps = [lbT('Tap a switch to flip it: 0 ↔ 1.'), lbT('A lit wire carries a 1, a dark one a 0.'), lbT('Flips are limited ({n}) — plan before you tap.', { n: mod.minFlips + this.flipSlack })];
            for (const l of steps) for (const part of this._wrap(ctx, l, w)) { this._drawRich(ctx, part, x, y, '#e2e8f0'); y += 20; }
            y += 8;
            ctx.fillStyle = '#c4b5fd';
            ctx.font = '700 13px Orbitron, OrbitronTR';
            ctx.fillText(lbT('GATES'), x, y);
            y += 20;
            const has = (op) => mod.gates.some(g => g.op === op);
            const lines = [];
            if (has('AND')) lines.push(lbT('AND → 1 only if both inputs are 1'));
            if (has('OR')) lines.push(lbT('OR → 1 if any input is 1'));
            if (has('XOR')) lines.push(lbT('XOR → 1 if the two inputs differ'));
            if (has('NOT')) lines.push(lbT('NOT → turns 1 into 0 and 0 into 1'));
            if (mod.inputs.some(i => i.clock)) lines.push(lbT('CLK flips by itself — the lamp must stay off for both values'));
            ctx.font = '600 16px Rajdhani';
            for (const l of lines) for (const part of this._wrap(ctx, l, w)) { this._drawRich(ctx, part, x, y, '#c4b5fd'); y += 20; }
        } else if (mod.kind === 'pad') {
            const y = lay.bottom + 4;
            const n = mod.columns.length;
            const cw = Math.min(64, w / n);
            const left = C.x + C.w / 2 - (cw * n) / 2;
            const rowH = Math.min(34, (C.y + C.h - y - 10) / 6);
            mod.columns.forEach((col, j) => {
                ctx.strokeStyle = 'rgba(100,116,139,0.4)';
                ctx.lineWidth = 1;
                ctx.strokeRect(left + j * cw + 4, y, cw - 8, rowH * 6 + 4);
                col.forEach((sym, i) => {
                    ctx.fillStyle = '#e2e8f0';
                    ctx.font = `700 ${Math.round(rowH * 0.8)}px Rajdhani`;
                    ctx.textAlign = 'center';
                    ctx.fillText(sym, left + j * cw + cw / 2, y + rowH * (i + 0.5) + 3);
                });
            });
        }
    }

    /**
     * Where the MANUAL's goal line and rule rows go (render and coach share
     * it). Rule rows: "IF …" then "→ …", shrinking the text to fit.
     */
    _cardLayout(ctx, mod) {
        const C = this.cardRect();
        const x = C.x + 14, w = C.w - 28;
        const goals = {
            wires: 'Check the rules from the top. Do ONLY the first one that is true.',
            button: 'STEP 1 — the first true rule says TAP it or HOLD it.',
            circuit: 'Turn the DETONATE lamp OFF.',
            pad: '1. Find the column that has all 4 symbols. 2. Press them in that column\'s order, top first.'
        };
        ctx.font = '700 17px Rajdhani';
        const goal = this._wrap(ctx, lbT(goals[mod.kind]), w);
        const goalY = C.y + 46;
        const top = goalY + goal.length * 21 - 4;
        const rows = [];
        let size = 16, bottom = top;
        if (mod.kind === 'wires' || mod.kind === 'button') {
            const limit = mod.kind === 'button' ? C.y + C.h - 92 : C.y + C.h - 8;
            for (size = 16; size >= 13; size--) {
                rows.length = 0;
                let y = top;
                const lh = size + 4;
                for (const r of mod.rules) {
                    ctx.font = `600 ${size}px Rajdhani`;
                    const cond = this._wrap(ctx, r.cond ? lbT('IF {cond}', { cond: r.cond.text }) : lbT('OTHERWISE'), w - 30);
                    ctx.font = `700 ${size}px Rajdhani`;
                    const act = this._wrap(ctx, `→ ${r.act.text}`, w - 30);
                    const h = (cond.length + act.length) * lh + 8;
                    rows.push({ x, y, w, h, cond, act });
                    y += h + 5;
                }
                bottom = y;
                if (bottom <= limit) break;
            }
        }
        return { goal, goalY, size, rows, bottom };
    }

    /** Split text into lines that fit width w with the current font. */
    _wrap(ctx, text, w) {
        const measure = (t) => { const m = ctx.measureText(t).width; return typeof m === 'number' ? m : t.length * 7.5; };
        const lines = [];
        let line = '';
        for (const word of text.split(' ')) {
            const t = line ? line + ' ' + word : word;
            if (line && measure(t) > w) { lines.push(line); line = word; } else line = t;
        }
        if (line) lines.push(line);
        return lines;
    }

    /** One line; colour names in capitals in their colour, IF / OTHERWISE / STEP in pink (in either language). */
    _drawRich(ctx, line, x, y, base) {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const measure = (t) => { const m = ctx.measureText(t).width; return typeof m === 'number' ? m : t.length * 7.5; };
        const space = measure(' ');
        const colour = {};
        for (const k of Object.keys(LB_COLORS)) colour[k] = colour[lbT(k)] = LB_COLORS[k];
        const pink = new Set(['IF', 'OTHERWISE', 'STEP'].concat(['IF', 'OTHERWISE', 'STEP'].map(k => lbT(k))));
        let cx = x;
        for (const word of line.split(' ')) {
            ctx.fillStyle = colour[word] || (pink.has(word) ? '#f472b6' : base);
            ctx.fillText(word, cx, y);
            cx += measure(word) + space;
        }
    }

    _renderHud(ctx, W, H) {
        ctx.save();
        ctx.textBaseline = 'middle';
        // Payload progress
        const y = H - 38;
        for (let i = 0; i < this.payloads; i++) {
            const done = i < this.defused;
            ctx.fillStyle = done ? 'rgba(34,197,94,0.3)' : 'rgba(15,23,42,0.6)';
            ctx.strokeStyle = done ? '#22c55e' : i === this.defused ? '#ec4899' : '#475569';
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(W / 2 - 150 + i * 28, y, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        ctx.fillStyle = '#94a3b8';
        ctx.font = '700 18px Rajdhani';
        ctx.textAlign = 'left';
        ctx.fillText(`PAYLOAD ${Math.min(this.defused + 1, this.payloads)}/${this.payloads}`, W / 2 - 150 + this.payloads * 28, y);

        let text = null, color = '#94a3b8';
        if (this.result === 'success') { text = lbT('ALL PAYLOADS DEFUSED · SCORE {n}', { n: this.score }); color = '#22c55e'; }
        else if (this.result === 'fail') { text = 'PAYLOAD DETONATED'; color = '#ef4444'; }
        else if (this.message) { text = this.message.text; color = this.message.color; }
        else if (this.current && this.current.kind === 'wires' && this.current.selected !== null && !this.coach) { text = 'TAP AGAIN TO CUT'; color = '#fbbf24'; }
        else if (this.holding && this.holding.t >= LB_HOLD) { text = 'HOLDING — RELEASE ON THE STRIP\'S DIGIT'; color = '#fbbf24'; }
        if (text) {
            text = lbT(text);
            ctx.fillStyle = color;
            ctx.font = text.length > 30 ? '700 16px Orbitron, OrbitronTR' : '700 19px Orbitron, OrbitronTR';
            ctx.textAlign = 'center';
            ctx.fillText(text, W / 2, this.vaultRect().y + this.vaultRect().h + 18);
        }
        ctx.restore();
    }

    /** Coach bubble: dims the scene, outlines what it talks about. */
    _renderCoach(ctx, W, H) {
        const c = this.coach;
        if (!c || this.result !== null) return;
        // Rule rows come from the MANUAL's layout; no rows = the whole manual.
        const rects = c.rows
            ? (c.rows.length ? c.rows.map(k => this._cardLayout(ctx, this.current).rows[k]).filter(Boolean) : [this.cardRect()])
            : (c.rects || []);
        // Rule steps keep the lines in view too: the player checks the rule against them.
        const ruleStep = !!(c.rows && c.rows.length);
        const clear = ruleStep ? rects.concat([this.moduleRect()]) : rects;
        ctx.save();
        // Dim everything but what the bubble talks about.
        ctx.fillStyle = 'rgba(5,8,16,0.62)';
        ctx.beginPath();
        ctx.rect(0, 0, W, H);
        for (const r of clear) ctx.rect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
        ctx.fill('evenodd');
        const glow = 0.6 + 0.4 * Math.sin(this.time * 6);
        ctx.strokeStyle = `rgba(250,204,21,${glow})`;
        ctx.lineWidth = 3;
        for (const r of rects) ctx.strokeRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8);
        // Bubble on the other side from what it points at: vault or panel.
        const P = this.panelRect(), V = this.vaultRect();
        const first = rects[0];
        const onPanel = !!first && first.x >= P.x - 1;
        const bw = ruleStep ? V.w + 8 : onPanel ? V.w - 28 : P.w;
        ctx.font = '600 18px Rajdhani';
        const words = lbT(c.text, c.vars).split(' ');
        const lines = [];
        let line = '';
        for (const w of words) {
            const t = line ? line + ' ' + w : w;
            const m = ctx.measureText(t).width;
            if ((typeof m === 'number' ? m : t.length * 8) > bw - 36 && line) { lines.push(line); line = w; } else line = t;
        }
        lines.push(line);
        const info = c.kind === 'info';
        const bh = 26 + lines.length * 24 + (info ? 26 : 4);
        // Rule steps: over the title band, clear of both the lines and the manual.
        const bx = ruleStep ? V.x - 4 : onPanel ? V.x + 14 : P.x;
        const by = ruleStep ? 4 : onPanel ? V.y + 150 : P.y + 120;
        UITheme.panel(ctx, bx, by, bw, bh, { chamfer: 12, stroke: '#facc15', lineWidth: 1.6, fill: 'rgba(15,23,42,0.97)', glow: '#facc15' });
        lines.forEach((l, k) => this._drawRich(ctx, l, bx + 18, by + 24 + k * 24, '#e2e8f0'));
        if (info) {
            ctx.fillStyle = '#facc15';
            ctx.font = '700 15px Rajdhani';
            ctx.textAlign = 'right';
            ctx.fillText(lbT('TAP TO CONTINUE ▸'), bx + bw - 16, by + bh - 16);
        }
        ctx.restore();
    }
}

// Defuse "click" voice for Sound.playGood(theme).
LogicBombMechanic.SOUND = { soundFreq: 660, soundType: 'triangle' };

if (typeof module !== 'undefined' && module.exports) module.exports = LogicBombMechanic;
