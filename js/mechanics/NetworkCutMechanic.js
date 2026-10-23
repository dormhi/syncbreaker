/* =========================================
   NetworkCutMechanic.js — Act 6 · CUT_ACCESS

   A network map: the attacker's node (ATK, left) is linked to the core
   (CORE, right) through relay nodes. Every cable the attacker can reach
   glows red. Cut cables until no red path reaches the core, using a
   limited number of scissors. Solve `networks` networks. Lives, no timer.

   First tap / click selects a cable, a second one on the same cable cuts
   it (no accidental cuts). Arrows move the selection, SPACE / ENTER cuts.

   The cables at ATK and at the CORE are shielded trunks: they cannot be
   cut, so the cut always has to be found inside the network. A network is
   also thrown away when a blind recipe would solve it within the scissors
   (cut everything around the relays next to ATK, or next to the CORE).
   Layouts vary: 3 or 4 rows, ATK and CORE swap sides, relays shift.

   Harder tiers add:
   - owner lines (blue): the owner's own link to the core. Cutting one
     costs a life (the line is repaired, the scissors are spent).
   - armored cables: two cuts to sever.
   - failover lines: dormant cables that wake when a marked cable is cut.

   Running out of scissors while the attacker still reaches the core
   costs a life and rebuilds the same network.

   Every network is solvable within the scissors: the cheapest cut is
   computed exactly (max-flow / min-cut, trying every failover trigger
   combination) and the budget is that plus a tier slack.

   revive(): one life back, the same network rebuilt.

   Coaching (useCoach): with a store from the host, the first network of
   the first stage is a scripted tutorial that walks the player through
   select -> cut -> solve, and the first owner line, armored cable and
   failover line each get a one-time explanation. Info bubbles pause the
   game until tapped.
   ========================================= */

const _MechanicBaseNC = (typeof Mechanic !== 'undefined') ? Mechanic : class {};

const NC_INF = 1000;   // "cannot be cut" capacity (shielded trunks, owner lines, untouchable triggers)

class NetworkCutMechanic extends _MechanicBaseNC {
    constructor(options = {}) {
        super();
        this.rng = options.rng || Math.random;

        this.networks = options.networks || 3;
        this.cols = Math.max(5, options.cols || 5);   // relay columns (3 rows each)
        this.minCutMin = options.minCutMin || 2;        // cheapest solution, in scissors
        this.minCutMax = options.minCutMax || this.minCutMin;
        this.slack = options.slack !== undefined ? options.slack : 2;   // spare scissors
        this.ownerMin = options.ownerMin || 0;          // owner line cables (0 = none)
        this.ownerMax = options.ownerMax || this.ownerMin;
        this.armoredMin = options.armoredMin || 0;
        this.armoredMax = options.armoredMax || this.armoredMin;
        this.failoverMin = options.failoverMin || 0;
        this.failoverMax = options.failoverMax || this.failoverMin;
        this.maxLives = options.lives || 3;
        this.solvedPause = 0.8;
        this.coachStore = null;        // { seen(key), mark(key) } from the host
        this.firstStage = false;

        this.resultDuration = 1.2;
        this.stepDt = 1 / 60;
    }

    _int(n) { return Math.floor(this.rng() * n); }
    _between(a, b) { return a + this._int(b - a + 1); }

    /** Enable the tutorial (first stage only) and the one-time explanations. */
    useCoach(store, firstStage) {
        this.coachStore = store || null;
        this.firstStage = !!firstStage;
    }

    init(context = {}) {
        this.active = true;
        this.result = null;
        this.width = context.width || 960;
        this.height = context.height || 640;
        this.coach = null;             // the bubble on screen
        this.coachQueue = [];
        this.tutorial = !!(this.coachStore && this.firstStage && !this.coachStore.seen('tutorial'));

        this.time = 0;
        this.lives = this.maxLives;
        this.solved = 0;
        this.score = 0;
        this.spare = 0;          // scissors left over, summed over solved networks
        this.wasted = 0;         // cuts beyond the cheapest solution
        this.livesLost = 0;
        this.pause = 0;
        this.flash = 0;          // green flash after a solved network
        this.hurt = 0;           // red flash after a lost life
        this.message = null;     // { text, color, t }
        this.sparks = [];
        this._newNetwork();
    }

    revive() {
        this.lives = 1;
        this.result = null;
        this.active = true;
        this._resetNetwork();
    }

    // ── Board ──

    boardRect() {
        return { x: 70, y: 100, w: this.width - 140, h: 372 };
    }

    // ── Network generation ──

    _newNetwork() {
        if (this.tutorial && this.solved === 0) {
            this._tutorialNetwork();
            return;
        }
        let net = null;
        for (let tries = 0; tries < 400 && !net; tries++) net = this._tryNetwork();
        // Safety net: never stall the game on an unlucky streak.
        for (let tries = 0; tries < 400 && !net; tries++) net = this._tryNetwork(true);
        this.nodes = net.nodes;
        this.start = net.edges;
        this.minCost = net.minCost;
        this.budget = net.minCost + this.slack;
        this._resetNetwork();
        this._queueCallouts();
    }

    // ── Coaching ──

    /** Two separate routes, one cut each: the smallest lesson in the game. */
    _tutorialNetwork() {
        // The network sits low on the board; the lesson bubbles use the top band.
        const B = this.boardRect();
        const mid = B.y + B.h * 0.64;
        const at = (fx, fy) => ({ kind: 'relay', x: B.x + B.w * fx, y: B.y + B.h * fy });
        this.nodes = [
            { kind: 'atk', x: B.x + 34, y: mid },
            { kind: 'core', x: B.x + B.w - 34, y: mid },
            at(0.36, 0.44), at(0.64, 0.44), at(0.36, 0.84), at(0.64, 0.84)
        ];
        const link = (a, b) => ({ a, b, hp: 1, armor: 1, owner: false, dormant: false, trigger: -1, shielded: a <= 1 || b <= 1 });
        this.start = [link(0, 2), link(2, 3), link(3, 1), link(0, 4), link(4, 5), link(5, 1)];
        this.minCost = 2;
        this.budget = 2 + Math.max(1, this.slack);
        this._resetNetwork();
        this.coachQueue = [
            { kind: 'info', top: true, nodes: [0, 1], text: 'This is the ATTACKER (left). It wants to reach your CORE (right).' },
            { kind: 'info', top: true, red: true, text: 'RED cables are the paths it can use. Cut cables until no red line reaches the CORE.' },
            { kind: 'info', top: true, shielded: true, text: 'The STEEL cables at the ATTACKER and the CORE are shielded: they cannot be cut. Cut the cables in between.' },
            { kind: 'select', top: true, edges: [1], text: 'Tap this cable to select it.' },
            { kind: 'cut', top: true, edges: [1], text: 'Tap it again to cut it. Every cut uses one ✂ — you have a few.' },
            { kind: 'solve', top: true, red: true, text: 'The attacker still gets through along the other route. Select a red cable there and cut it.' }
        ];
        this._nextCoach();
    }

    /** One-time explanations for the first owner line, armored and failover cable. */
    _queueCallouts() {
        const store = this.coachStore;
        if (!store) return;
        const topics = [
            ['shielded', e => e.shielded, 'STEEL cables at the ATTACKER and the CORE are shielded: they cannot be cut. Find the cut inside the network.'],
            ['owner', e => e.owner, 'BLUE cables are the OWNER\'S LINE: they keep the owner connected to the core. Never cut them — it costs a life.'],
            ['armored', e => e.armor > 1, 'THICK cables are ARMORED. They need two cuts: the first one only cracks them.'],
            ['failover', e => e.dormant, 'A dashed purple cable is a BACKUP line. It switches on when you cut the cable with the same orange letter.']
        ];
        for (const [key, has, text] of topics) {
            const edges = this.edges.map((e, i) => i).filter(i => has(this.edges[i]));
            if (edges.length && !store.seen(key)) this.coachQueue.push({ kind: 'info', key, edges, text });
        }
        if (!this.coach) this._nextCoach();
    }

    _nextCoach() {
        if (this.coach && this.coach.key && this.coachStore) this.coachStore.mark(this.coach.key);
        this.coach = this.coachQueue.shift() || null;
    }

    /** Info bubbles wait for a tap; action steps advance on what the player does. */
    get coachBlocks() { return !!this.coach && this.coach.kind === 'info'; }

    _coachEvent(kind) {
        if (this.coach && this.coach.kind === kind) this._nextCoach();
    }

    /** Back to the network as generated: every cable whole, full scissors. */
    _resetNetwork() {
        this.edges = this.start.map(e => Object.assign({}, e));
        this.scissors = this.budget;
        this.used = 0;
        this.selected = null;
        this.pause = 0;
        this._refresh();
    }

    /** One random network; null when it misses the tier's targets. */
    _tryNetwork(anyCost) {
        const B = this.boardRect();
        const owner = this.ownerMax > 0;
        // Three rows of relays in `cols` columns. The two columns at each end
        // stay full, so every gap near ATK or the CORE has 5 cables: a blind
        // cut there costs more than the scissors. Middle columns (wide
        // networks only) may lose a relay, never below two, so layouts vary.
        const rows = 3;
        const cols = this.cols;
        const cells = [];
        for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) cells.push({ c, r });
        const middle = (c) => c >= 2 && c <= cols - 3;
        let drop = cols >= 5 ? this._int(cols - 3) : 0;
        while (drop > 0) {
            const k = this._int(cells.length);
            const col = cells[k].c;
            if (middle(col) && cells.filter(x => x.c === col).length > 2) { cells.splice(k, 1); drop--; }
        }

        const top = owner ? 0.12 : 0.16, bottom = owner ? 0.74 : 0.84;
        const rowY = (r) => B.y + B.h * (rows === 1 ? 0.5 : top + (bottom - top) * r / (rows - 1));
        // Relay columns spread evenly between the attacker and the core.
        const ax = B.x + 34, cx = B.x + B.w - 34;
        const colX = (c) => ax + (cx - ax) * (c + 1) / (cols + 1);
        const midY = B.y + B.h * (top + bottom) / 2;
        const nodes = [
            { kind: 'atk', x: ax, y: midY + (this.rng() - 0.5) * B.h * 0.3 },
            { kind: 'core', x: cx, y: midY + (this.rng() - 0.5) * B.h * 0.3 }
        ];
        const at = {};
        for (const cell of cells) {
            at[cell.c + ',' + cell.r] = nodes.length;
            nodes.push({ kind: 'relay', c: cell.c, r: cell.r,
                x: colX(cell.c) + (this.rng() - 0.5) * 44, y: rowY(cell.r) + (this.rng() - 0.5) * 30 });
        }
        if (owner) nodes.push({ kind: 'owner', x: colX(Math.max(0, cols - 2)) + 40, y: B.y + B.h * 0.93 });
        const OWNER = owner ? nodes.length - 1 : -1;

        // Candidate cables: grid neighbours, one diagonal per 2x2 block (no crossings).
        const cand = [];
        const add = (a, b) => { if (a !== undefined && b !== undefined) cand.push([a, b]); };
        for (let c = 0; c < cols; c++) {
            for (let r = 0; r < rows; r++) {
                const me = at[c + ',' + r];
                if (me === undefined) continue;
                add(me, at[c + ',' + (r + 1)]);
                add(me, at[(c + 1) + ',' + r]);
                if (this.rng() < 0.5) add(me, at[(c + 1) + ',' + (r + 1)]);
                else add(at[c + ',' + (r + 1)], at[(c + 1) + ',' + r]);
            }
        }
        for (let r = 0; r < rows; r++) {
            add(0, at['0,' + r]);
            add(1, at[(cols - 1) + ',' + r]);
        }

        // A bottleneck along a zig-zag border: each row splits at its own
        // column, so the narrow place is never one straight gap. Only `width`
        // cables cross the border; the rest of the network stays dense.
        // The border stays off the end gaps (columns 1 .. cols-3).
        const lo = 1, hi = cols - 3;
        const border = [lo + this._int(hi - lo + 1)];
        for (let r = 1; r < rows; r++) {
            border.push(Math.max(lo, Math.min(hi, border[r - 1] + this._int(3) - 1)));
        }
        if (hi > lo && border.every(b => b === border[0])) return null;   // keep it bent
        const atkSide = (v) => v === 0 || (v > 1 && nodes[v].kind === 'relay' && nodes[v].c <= border[nodes[v].r]);
        const crosses = (e) => e[0] !== 1 && e[1] !== 1 && atkSide(e[0]) !== atkSide(e[1]);
        const width = this._between(this.minCutMin, this.minCutMax);
        let active = cand.slice();
        const neckEdges = cand.filter(crosses).sort(() => this.rng() - 0.5);
        for (const e of neckEdges.slice(width)) {
            const without = active.filter(x => x !== e);
            if (this._connected(nodes.length, without, owner ? [OWNER] : [])) active = without;
        }

        // Everywhere else the network stays dense: the bottleneck is the only
        // narrow place, and blind cuts at the full end columns cost a lot.
        // Trunk cables at ATK and CORE are shielded (no blind cuts at the ends).
        const edges = active.map(([a, b]) => ({ a, b, hp: 1, armor: 1, owner: false, dormant: false, trigger: -1, shielded: a <= 1 || b <= 1 }));
        const spare = cand.filter(e => active.indexOf(e) < 0);

        // Mirror half of the networks: ATK on the right, CORE on the left.
        if (this.rng() < 0.5) for (const n of nodes) n.x = B.x + B.w - (n.x - B.x);

        // Owner line: the owner's terminal to the core along existing relays.
        if (owner) {
            const bottom = nodes.map((n, i) => i).filter(i => nodes[i].kind === 'relay' && nodes[i].r === rows - 1);
            if (!bottom.length) return null;
            const near = bottom.sort((p, q) => Math.abs(nodes[p].x - nodes[OWNER].x) - Math.abs(nodes[q].x - nodes[OWNER].x))[0];
            const route = this._path(nodes.length, edges, near, 1);
            if (!route) return null;
            const ownerLen = route.length + 1;
            if (ownerLen < this.ownerMin || ownerLen > this.ownerMax) return null;
            edges.push({ a: OWNER, b: near, hp: 1, armor: 1, owner: true, dormant: false, trigger: -1, shielded: false });
            for (const k of route) edges[k].owner = true;
        }

        // Armored cables
        const plain = () => edges.map((e, i) => i).filter(i => !edges[i].owner && !edges[i].shielded && edges[i].armor === 1 && !edges[i].dormant);
        const armored = this._between(this.armoredMin, this.armoredMax);
        for (let k = 0; k < armored; k++) {
            const pool = plain();
            if (!pool.length) return null;
            const i = pool[this._int(pool.length)];
            edges[i].hp = edges[i].armor = 2;
        }

        // Failover lines: a dormant cable that wakes when a cable of the cheapest cut is cut.
        const failovers = this._between(this.failoverMin, this.failoverMax);
        for (let k = 0; k < failovers; k++) {
            if (!spare.length) return null;
            const [a, b] = spare.splice(this._int(spare.length), 1)[0];
            const cut = NetworkCutMechanic.cheapestCut(nodes.length, edges).filter(i => !edges[i].owner && edges[i].trigger < 0);
            const triggers = cut.filter(i => !edges.some(d => d.dormant && d.trigger === i));
            if (!triggers.length) return null;
            edges.push({ a, b, hp: 1, armor: 1, owner: false, dormant: true, awake: false, shielded: false,
                trigger: triggers[this._int(triggers.length)], tag: 'AB'[k] });
        }

        const net = { nodes, edges };
        // Never hand out a network the attacker cannot already cross.
        if (!this._reaches(nodes.length, edges.filter(e => !e.dormant), 0, 1)) return null;
        net.minCost = NetworkCutMechanic.minCost(nodes.length, edges);
        if (net.minCost >= NC_INF) return null;
        if (!anyCost && (net.minCost < this.minCutMin || net.minCost > this.minCutMax)) return null;
        if (!anyCost && this._blindSolves(nodes, edges, net.minCost, net.minCost + this.slack)) return null;
        return net;
    }

    /**
     * Would a recipe that ignores the layout do (nearly) as well as thinking?
     * - Cutting everything next to ATK or the CORE (the end gaps, and around
     *   the relays next to the ends) must not fit the scissors at all.
     * - Cutting one straight column gap in the middle is a real cut, but it
     *   must cost more than the cheapest one (the bent bottleneck wins).
     * Owner lines are left alone; backups woken on the way are cut too.
     */
    _blindSolves(nodes, edges, minCost, budget) {
        // Recipe set 1: cut every cable across one straight column gap.
        const colOf = (v) => v === 0 ? -1 : v === 1 ? Infinity : (nodes[v].kind === 'relay' ? nodes[v].c : null);
        const cols = Math.max(...nodes.filter(n => n.kind === 'relay').map(n => n.c)) + 1;
        for (let g = 0; g < cols - 1; g++) {
            const cut = new Set();
            edges.forEach((e, i) => {
                if (e.dormant || e.owner || e.shielded) return;
                const ca = colOf(e.a), cb = colOf(e.b);
                if (ca === null || cb === null) return;
                if (Math.min(ca, cb) <= g && Math.max(ca, cb) > g) cut.add(i);
            });
            const end = g === 0 || g === cols - 2;
            if (this._cutSolves(nodes, edges, cut, end ? budget : minCost)) return true;
        }
        // Recipe set 2: cut everything around the relays next to ATK / the CORE.
        for (const end of [0, 1]) {
            const layer = new Set();
            edges.forEach(e => {
                if (e.dormant) return;
                if (e.a === end && e.b > 1) layer.add(e.b);
                if (e.b === end && e.a > 1) layer.add(e.a);
            });
            const cut = new Set();
            edges.forEach((e, i) => {
                if (e.dormant || e.owner || e.shielded) return;
                if (layer.has(e.a) !== layer.has(e.b)) cut.add(i);
            });
            if (this._cutSolves(nodes, edges, cut, budget)) return true;
        }
        return false;
    }

    /** Does this set of cuts (plus any backups it wakes) win within the budget? */
    _cutSolves(nodes, edges, cut, budget) {
        edges.forEach((d, i) => { if (d.dormant && cut.has(d.trigger)) cut.add(i); });
        let cost = 0;
        for (const i of cut) cost += edges[i].hp;
        if (cost > budget) return false;
        const live = edges.filter((e, i) => !cut.has(i) && (!e.dormant || cut.has(e.trigger)));
        return !NetworkCutMechanic.reach(nodes.length, live, 0).has(1);
    }

    _connected(n, pairs, extra) {
        const adj = Array.from({ length: n }, () => []);
        for (const [a, b] of pairs) { adj[a].push(b); adj[b].push(a); }
        const seen = new Set([0]);
        const queue = [0];
        while (queue.length) {
            const v = queue.shift();
            for (const w of adj[v]) if (!seen.has(w)) { seen.add(w); queue.push(w); }
        }
        // Every relay and the core must stay reachable (the owner joins later).
        for (let i = 0; i < n; i++) if (!seen.has(i) && extra.indexOf(i) < 0) return false;
        return true;
    }

    /** Edge indices of a shortest path from node s to node t, or null. */
    _path(n, edges, s, t) {
        const prev = new Array(n).fill(-1);
        const via = new Array(n).fill(-1);
        const seen = new Set([s]);
        const queue = [s];
        while (queue.length) {
            const v = queue.shift();
            if (v === t) break;
            edges.forEach((e, i) => {
                const w = e.a === v ? e.b : e.b === v ? e.a : -1;
                // Never through the attacker's own node.
                if (w > 0 && !seen.has(w)) { seen.add(w); prev[w] = v; via[w] = i; queue.push(w); }
            });
        }
        if (!seen.has(t)) return null;
        const out = [];
        for (let v = t; v !== s; v = prev[v]) out.push(via[v]);
        return out;
    }

    _reaches(n, edges, s, t) {
        return NetworkCutMechanic.reach(n, edges, s).has(t);
    }

    // ── Graph maths (static: tests and bots use them too) ──

    /** Nodes reachable from s over the given (uncut) cables. */
    static reach(n, edges, s) {
        const adj = Array.from({ length: n }, () => []);
        for (const e of edges) { adj[e.a].push(e.b); adj[e.b].push(e.a); }
        const seen = new Set([s]);
        const queue = [s];
        while (queue.length) {
            const v = queue.shift();
            for (const w of adj[v]) if (!seen.has(w)) { seen.add(w); queue.push(w); }
        }
        return seen;
    }

    /** Max flow from node 0 (ATK) to node 1 (CORE); returns { flow, sourceSide }. */
    static maxFlow(n, caps) {
        const res = caps.map(row => row.slice());
        let flow = 0;
        for (;;) {
            const prev = new Array(n).fill(-1);
            prev[0] = 0;
            const queue = [0];
            while (queue.length && prev[1] < 0) {
                const v = queue.shift();
                for (let w = 0; w < n; w++) {
                    if (prev[w] < 0 && res[v][w] > 0) { prev[w] = v; queue.push(w); }
                }
            }
            if (prev[1] < 0) break;
            let push = Infinity;
            for (let v = 1; v !== 0; v = prev[v]) push = Math.min(push, res[prev[v]][v]);
            for (let v = 1; v !== 0; v = prev[v]) { res[prev[v]][v] -= push; res[v][prev[v]] += push; }
            flow += push;
            if (flow >= NC_INF) break;
        }
        const side = new Set([0]);
        const queue = [0];
        while (queue.length) {
            const v = queue.shift();
            for (let w = 0; w < n; w++) if (!side.has(w) && res[v][w] > 0) { side.add(w); queue.push(w); }
        }
        return { flow, sourceSide: side };
    }

    /**
     * Scissors needed to separate ATK from CORE from this state on.
     * Owner lines cannot be cut; a dormant cable joins the network when its
     * trigger is cut, so every choice of "which triggers to cut" is tried.
     */
    static minCost(n, edges) {
        const live = edges.filter(e => !e.cut);
        const sleepers = live.filter(e => e.dormant && !e.awake);
        let best = NC_INF;
        for (let mask = 0; mask < (1 << sleepers.length); mask++) {
            const caps = Array.from({ length: n }, () => new Array(n).fill(0));
            let cost = 0;
            // Sleepers in the mask: their trigger is cut (paid for) and they wake.
            // The others: their trigger must survive, so it cannot be cut.
            const woken = new Set(), cutTriggers = new Set(), keepTriggers = new Set();
            sleepers.forEach((d, k) => {
                if ((mask >> k) & 1) { woken.add(d); cutTriggers.add(d.trigger); } else keepTriggers.add(d.trigger);
            });
            edges.forEach((e, i) => {
                if (e.cut) return;
                if (e.dormant && !e.awake && !woken.has(e)) return;
                if (cutTriggers.has(i)) { cost += e.hp; return; }
                const c = (e.owner || e.shielded || keepTriggers.has(i)) ? NC_INF : e.hp;
                caps[e.a][e.b] += c;
                caps[e.b][e.a] += c;
            });
            const f = NetworkCutMechanic.maxFlow(n, caps).flow;
            best = Math.min(best, cost + f);
        }
        return best;
    }

    /** Edge indices of one cheapest cut of the awake network (failovers ignored). */
    static cheapestCut(n, edges) {
        const caps = Array.from({ length: n }, () => new Array(n).fill(0));
        edges.forEach(e => {
            if (e.cut || (e.dormant && !e.awake)) return;
            const c = (e.owner || e.shielded) ? NC_INF : e.hp;
            caps[e.a][e.b] += c;
            caps[e.b][e.a] += c;
        });
        const side = NetworkCutMechanic.maxFlow(n, caps).sourceSide;
        return edges.map((e, i) => i).filter(i => {
            const e = edges[i];
            if (e.cut || (e.dormant && !e.awake)) return false;
            return side.has(e.a) !== side.has(e.b);
        });
    }

    // ── Rules ──

    /** Cables that carry traffic right now. */
    _live() {
        return this.edges.filter(e => !e.cut && (!e.dormant || e.awake));
    }

    _refresh() {
        this.reached = NetworkCutMechanic.reach(this.nodes.length, this._live(), 0);
    }

    get coreReached() { return this.reached.has(1); }

    /** Can cable i be selected / cut? (Not cut yet, and awake.) */
    cuttable(i) {
        const e = this.edges[i];
        return !!e && !e.cut && !e.shielded && (!e.dormant || e.awake);
    }

    /** First tap selects, a second tap on the same cable cuts it. */
    tapEdge(i) {
        if (this.result !== null || this.pause > 0 || this.coachBlocks) return false;
        if (i === null || !this.cuttable(i)) { this.selected = null; return false; }
        if (this.selected === i) return this.cut(i);
        this.selected = i;
        this._coachEvent('select');
        return true;
    }

    cut(i) {
        if (this.result !== null || this.pause > 0 || this.coachBlocks || !this.cuttable(i) || this.scissors <= 0) return false;
        const e = this.edges[i];
        this.scissors--;
        this.used++;
        this.selected = null;
        const mid = this.edgeMid(i);
        if (e.owner) {
            // The owner's own line: it is patched at once, the life is not.
            this._loseLife('OWNER LINE CUT');
        } else {
            e.hp--;
            this._spark(mid.x, mid.y, e.hp > 0 ? '#fbbf24' : '#c084fc', e.hp > 0 ? 6 : 12);
            if (e.hp <= 0) {
                e.cut = true;
                // Failover: dormant cables triggered by this one wake up.
                for (const d of this.edges) {
                    if (d.dormant && !d.awake && d.trigger === i) { d.awake = true; d.wake = 0.8; }
                }
            }
            if (typeof Sound !== 'undefined' && Sound.playGood) Sound.playGood(NetworkCutMechanic.SOUND);
            this._refresh();
            this._coachEvent('select');   // cutting without a separate select still counts
            this._coachEvent('cut');
            if (!this.coreReached) { this._solvedNetwork(); return true; }
        }
        if (this.result === null && this.scissors <= 0 && this.coreReached) {
            this._loseLife('OUT OF CUTS — NETWORK RESET');
            if (this.result === null) this._resetNetwork();
        }
        return true;
    }

    _loseLife(text) {
        this.lives--;
        this.livesLost++;
        this.hurt = 0.5;
        this.message = { text, color: '#ef4444', t: 1.4 };
        if (typeof Sound !== 'undefined' && Sound.playMiss) Sound.playMiss();
        if (this.lives <= 0) this.result = 'fail';
    }

    _solvedNetwork() {
        if (this.tutorial && this.solved === 0) {
            if (this.coachStore) this.coachStore.mark('shielded');
            this.coachQueue = [{ kind: 'info', top: true, key: 'tutorial', text: 'No red line reaches the CORE: access cut! Solve every network to clear the stage.' }];
            this.coach = null;
            this._nextCoach();
        }
        this.solved++;
        this.spare += this.scissors;
        this.wasted += Math.max(0, this.used - this.minCost);
        this.flash = 0.5;
        if (this.solved >= this.networks) {
            this.result = 'success';
            this.score = this.computeScore();
            return;
        }
        this.message = { text: 'LINK SEVERED', color: '#22c55e', t: this.solvedPause };
        this.pause = this.solvedPause;
    }

    computeScore() {
        return this.solved * 300 + this.spare * 50 + this.lives * 250;
    }

    /** End-of-stage numbers for the star rules (thresholds: bot sweep, user approval). */
    starStats() {
        return { livesLost: this.livesLost, wasted: this.wasted };
    }

    update(dt) {
        if (!this.active) return;
        this.stepDt = dt || this.stepDt;
        const h = this.stepDt;
        this.time += h;
        if (this.flash > 0) this.flash -= h;
        if (this.hurt > 0) this.hurt -= h;
        if (this.message) { this.message.t -= h; if (this.message.t <= 0) this.message = null; }
        for (const e of this.edges) if (e.wake > 0) e.wake -= h;
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const s = this.sparks[i];
            s.life -= h * 2.2;
            s.x += s.vx * h;
            s.y += s.vy * h;
            if (s.life <= 0) this.sparks.splice(i, 1);
        }
        if (this.result !== null || this.coachBlocks) return;
        if (this.pause > 0) {
            this.pause -= h;
            if (this.pause <= 0) this._newNetwork();
        }
    }

    _spark(x, y, color, n) {
        for (let k = 0; k < n; k++) {
            const a = this.rng() * Math.PI * 2, v = 60 + this.rng() * 140;
            this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color });
        }
    }

    // ── Input ──

    edgeMid(i) {
        const e = this.edges[i];
        const A = this.nodes[e.a], B = this.nodes[e.b];
        return { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    }

    /** Nearest selectable cable to a point (within reach), or null. 36 px = a 44 pt finger on a phone. */
    edgeAt(x, y, reach = 36) {
        let best = null, bestD = reach;
        this.edges.forEach((e, i) => {
            if (!this.cuttable(i)) return;
            const A = this.nodes[e.a], B = this.nodes[e.b];
            const dx = B.x - A.x, dy = B.y - A.y;
            const t = Math.max(0, Math.min(1, ((x - A.x) * dx + (y - A.y) * dy) / (dx * dx + dy * dy || 1)));
            const d = Math.hypot(x - (A.x + t * dx), y - (A.y + t * dy));
            if (d < bestD) { bestD = d; best = i; }
        });
        return best;
    }

    /** Move the selection to the nearest cable in a direction. */
    moveSelection(dx, dy) {
        const all = this.edges.map((e, i) => i).filter(i => this.cuttable(i));
        if (!all.length) return false;
        if (this.selected === null || !this.cuttable(this.selected)) {
            this.selected = all.sort((p, q) => this.edgeMid(p).x - this.edgeMid(q).x)[0];
            return true;
        }
        const from = this.edgeMid(this.selected);
        let best = null, bestScore = Infinity;
        for (const i of all) {
            if (i === this.selected) continue;
            const m = this.edgeMid(i);
            const along = (m.x - from.x) * dx + (m.y - from.y) * dy;
            if (along <= 1) continue;
            const across = Math.abs((m.x - from.x) * dy - (m.y - from.y) * dx);
            const score = along + across * 2;
            if (score < bestScore) { bestScore = score; best = i; }
        }
        if (best !== null) this.selected = best;
        return best !== null;
    }

    handleKey(code) {
        if (this.result !== null) return false;
        if (this.coachBlocks) {
            if (code === 'Space' || code === 'Enter') this._nextCoach();
            return true;
        }
        if (code === 'ArrowLeft' || code === 'KeyA') return this.moveSelection(-1, 0) || true;
        if (code === 'ArrowRight' || code === 'KeyD') return this.moveSelection(1, 0) || true;
        if (code === 'ArrowUp' || code === 'KeyW') return this.moveSelection(0, -1) || true;
        if (code === 'ArrowDown' || code === 'KeyS') return this.moveSelection(0, 1) || true;
        if (code === 'Space' || code === 'Enter') {
            if (this.selected !== null) this.cut(this.selected);
            else this.moveSelection(1, 0);
            return true;
        }
        return false;
    }

    handlePointer(x, y, phase) {
        if (phase && phase !== 'down') return false;
        if (this.coachBlocks) { this._nextCoach(); return true; }
        this.tapEdge(this.edgeAt(x, y));
        return true;
    }

    // ── Render ──

    render(ctx, W, H) {
        const B = this.boardRect();
        const red = '#ef4444', blue = '#3b82f6', teal = '#2dd4bf';
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 5);

        ctx.save();
        UITheme.panel(ctx, B.x - 8, B.y - 8, B.w + 16, B.h + 16, { chamfer: 14, fill: 'rgba(8,12,20,0.85)' });
        ctx.lineCap = 'round';

        // Cables
        this.edges.forEach((e, i) => {
            const A = this.nodes[e.a], N = this.nodes[e.b];
            const hot = !e.cut && (!e.dormant || e.awake) && this.reached.has(e.a) && this.reached.has(e.b);
            if (e.cut) {
                // Two stubs with a gap where the cable was cut
                ctx.strokeStyle = 'rgba(100,116,139,0.45)';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(A.x, A.y); ctx.lineTo(A.x + (N.x - A.x) * 0.42, A.y + (N.y - A.y) * 0.42);
                ctx.moveTo(N.x, N.y); ctx.lineTo(A.x + (N.x - A.x) * 0.58, A.y + (N.y - A.y) * 0.58);
                ctx.stroke();
                return;
            }
            if (e.dormant && !e.awake) {
                ctx.strokeStyle = 'rgba(192,132,252,0.45)';
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 7]);
                ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(N.x, N.y); ctx.stroke();
                ctx.setLineDash([]);
                return;
            }
            if (e.shielded && !e.owner) {
                // Steel trunk: a light casing with the traffic colour inside
                ctx.strokeStyle = '#94a3b8';
                ctx.lineWidth = 9;
                ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(N.x, N.y); ctx.stroke();
                ctx.strokeStyle = hot ? red : '#1e293b';
                ctx.lineWidth = 3;
                ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(N.x, N.y); ctx.stroke();
                return;
            }
            const color = e.owner ? blue : hot ? red : '#64748b';
            const width = e.armor > 1 ? 9 : e.owner ? 5 : 4;
            if (hot || e.owner) { ctx.shadowColor = color; ctx.shadowBlur = hot ? 10 : 6; }
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(N.x, N.y); ctx.stroke();
            ctx.shadowBlur = 0;
            if (e.armor > 1) {
                // Armor core: solid while whole, broken once cracked
                ctx.strokeStyle = 'rgba(8,12,20,0.85)';
                ctx.lineWidth = 3;
                if (e.hp < e.armor) ctx.setLineDash([4, 6]);
                ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(N.x, N.y); ctx.stroke();
                ctx.setLineDash([]);
            }
            if (e.wake > 0) {
                ctx.globalAlpha = Math.min(1, e.wake / 0.4);
                ctx.strokeStyle = '#c084fc';
                ctx.lineWidth = 10;
                ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(N.x, N.y); ctx.stroke();
                ctx.globalAlpha = 1;
            }
        });

        // Failover tags: the dormant cable and the cable that wakes it share a letter.
        this.edges.forEach((d, i) => {
            if (!d.dormant || d.cut) return;
            const tag = (m, color) => {
                ctx.fillStyle = 'rgba(15,23,42,0.95)';
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.arc(m.x, m.y, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                ctx.fillStyle = color;
                ctx.font = '700 12px Orbitron';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(d.tag, m.x, m.y + 1);
            };
            const from = this.edgeMid(d.trigger), to = this.edgeMid(i);
            if (!d.awake && !this.edges[d.trigger].cut) {
                // Faint dotted link: "cutting this one wakes that one"
                ctx.strokeStyle = 'rgba(251,191,36,0.35)';
                ctx.lineWidth = 1.5;
                ctx.setLineDash([2, 5]);
                ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
                ctx.setLineDash([]);
            }
            if (!d.awake) tag(to, '#c084fc');
            if (!this.edges[d.trigger].cut) tag(from, '#fbbf24');
        });

        // Selection: bright outline and scissors on the cable
        if (this.selected !== null && this.cuttable(this.selected)) {
            const e = this.edges[this.selected];
            const A = this.nodes[e.a], N = this.nodes[e.b];
            ctx.strokeStyle = `rgba(250,250,250,${0.55 + 0.35 * pulse})`;
            ctx.lineWidth = 12;
            ctx.globalAlpha = 0.35;
            ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(N.x, N.y); ctx.stroke();
            ctx.globalAlpha = 1;
            const m = this.edgeMid(this.selected);
            ctx.fillStyle = 'rgba(15,23,42,0.96)';
            ctx.strokeStyle = '#fbbf24';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(m.x, m.y, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = '#fbbf24';
            ctx.font = '700 16px Rajdhani';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('✂', m.x, m.y + 1);
        }

        // Nodes
        this.nodes.forEach((n, i) => {
            const hit = this.reached.has(i);
            let r = 9, color = hit ? red : '#94a3b8', label = null;
            if (n.kind === 'atk') { r = 20; color = red; label = 'ATK'; }
            if (n.kind === 'core') { r = 20; color = hit ? red : teal; label = 'CORE'; }
            if (n.kind === 'owner') { r = 16; color = blue; label = 'OWNER'; }
            ctx.fillStyle = 'rgba(15,23,42,0.96)';
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.5;
            if (n.kind === 'core' && hit) { ctx.shadowColor = red; ctx.shadowBlur = 8 + 10 * pulse; }
            ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.shadowBlur = 0;
            if (n.kind === 'relay' && hit) {
                ctx.fillStyle = red;
                ctx.beginPath(); ctx.arc(n.x, n.y, 4, 0, Math.PI * 2); ctx.fill();
            }
            if (label) {
                ctx.fillStyle = color;
                ctx.font = '700 14px Orbitron';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(label, n.x, n.y + r + 14);
            }
            if (n.kind === 'core') {
                ctx.font = '700 14px Rajdhani';
                ctx.fillStyle = hit ? red : '#22c55e';
                ctx.fillText(hit ? 'UNDER ATTACK' : 'SAFE', n.x, n.y + r + 32);
            }
        });

        // The goal, always in view
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#94a3b8';
        ctx.font = '600 14px Rajdhani';
        ctx.fillText('GOAL: cut cables until no red line reaches the CORE', B.x + 14, B.y + 16);

        // Sparks
        for (const s of this.sparks) {
            ctx.globalAlpha = Math.max(0, s.life);
            ctx.fillStyle = s.color;
            ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
        }
        ctx.globalAlpha = 1;
        ctx.restore();

        const wash = this.flash > 0 ? ['#22c55e', this.flash / 0.5 * 0.12] : this.hurt > 0 ? [red, this.hurt / 0.5 * 0.16] : null;
        if (wash) {
            ctx.save();
            ctx.globalAlpha = Math.min(1, wash[1]);
            ctx.fillStyle = wash[0];
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        }
        this._renderLegend(ctx, W);
        this._renderHud(ctx, W, H);
        this._renderCoach(ctx, W, H);
    }

    /** What the colours mean, for the cable kinds in this network only. */
    _renderLegend(ctx, W) {
        const B = this.boardRect();
        const items = [['#ef4444', 4, null, 'Red: the attacker\'s path']];
        if (this.edges.some(e => e.shielded)) items.push(['#94a3b8', 8, null, 'Steel: shielded — can\'t be cut']);
        if (this.edges.some(e => e.owner)) items.push(['#3b82f6', 5, null, 'Blue: owner line — don\'t cut']);
        if (this.edges.some(e => e.armor > 1)) items.push(['#64748b', 9, null, 'Thick: armored — 2 cuts']);
        if (this.edges.some(e => e.dormant)) items.push(['rgba(192,132,252,0.8)', 2, [5, 6], 'Dashed: backup — wakes when its orange letter is cut']);
        if (items.length < 2) return;
        ctx.save();
        ctx.font = '500 14px Rajdhani';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        const widths = items.map(it => 34 + (ctx.measureText(it[3]).width || it[3].length * 7));
        // Up to two per row, centred under the board
        for (let row = 0; row * 2 < items.length; row++) {
            const pair = items.slice(row * 2, row * 2 + 2);
            const pw = widths.slice(row * 2, row * 2 + 2);
            const total = pw.reduce((a, b) => a + b, 0) + (pair.length - 1) * 28;
            let x = W / 2 - total / 2;
            const y = B.y + B.h + 54 + row * 22;
            pair.forEach((it, k) => {
                ctx.strokeStyle = it[0];
                ctx.lineWidth = it[1];
                ctx.setLineDash(it[2] || []);
                ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 24, y); ctx.stroke();
                ctx.setLineDash([]);
                ctx.fillStyle = '#94a3b8';
                ctx.fillText(it[3], x + 32, y + 1);
                x += pw[k] + 28;
            });
        }
        ctx.restore();
    }

    /** Coach bubble: dims the scene, lights what it talks about, points at it. */
    _renderCoach(ctx, W, H) {
        const c = this.coach;
        if (!c || this.result !== null) return;
        const edges = c.red
            ? this.edges.map((e, i) => i).filter(i => this.cuttable(i) && this.reached.has(this.edges[i].a) && this.reached.has(this.edges[i].b) && !this.edges[i].owner)
            : c.shielded ? this.edges.map((e, i) => i).filter(i => this.edges[i].shielded)
            : (c.edges || []);
        const nodes = c.nodes || [];
        const info = c.kind === 'info';
        ctx.save();
        if (info) {
            ctx.fillStyle = 'rgba(5,8,16,0.55)';
            ctx.fillRect(0, 0, W, H);
        }
        // Light up the focus
        const glow = 0.6 + 0.4 * Math.sin(this.time * 6);
        ctx.strokeStyle = `rgba(250,204,21,${glow})`;
        ctx.lineCap = 'round';
        let sx = 0, sy = 0, n = 0;
        for (const i of edges) {
            const e = this.edges[i];
            if (!e) continue;
            const A = this.nodes[e.a], N = this.nodes[e.b];
            ctx.lineWidth = 6;
            ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(N.x, N.y); ctx.stroke();
            const m = this.edgeMid(i);
            sx += m.x; sy += m.y; n++;
        }
        for (const k of nodes) {
            const p = this.nodes[k];
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(p.x, p.y, 28, 0, Math.PI * 2); ctx.stroke();
            sx += p.x; sy += p.y; n++;
        }
        // Bubble above or below the focus
        const B = this.boardRect();
        const fx = n ? sx / n : W / 2, fy = n ? sy / n : B.y + B.h / 2;
        const bw = 470;
        ctx.font = '600 16px Rajdhani';
        const words = c.text.split(' ');
        const lines = [];
        let line = '';
        for (const w of words) {
            const t = line ? line + ' ' + w : w;
            if ((ctx.measureText(t).width || t.length * 7.5) > bw - 36 && line) { lines.push(line); line = w; } else line = t;
        }
        lines.push(line);
        const bh = 22 + lines.length * 22 + (info ? 26 : 8);
        const below = fy < B.y + B.h * 0.45;
        const bx = c.top ? W / 2 - bw / 2 : Math.max(20, Math.min(W - bw - 20, fx - bw / 2));
        const by = c.top ? B.y + 30 : below ? Math.min(H - bh - 70, fy + 46) : Math.max(96, fy - bh - 46);
        UITheme.panel(ctx, bx, by, bw, bh, { chamfer: 12, stroke: '#facc15', lineWidth: 1.6, fill: 'rgba(15,23,42,0.97)', glow: '#facc15' });
        ctx.fillStyle = '#e2e8f0';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        lines.forEach((l, k) => ctx.fillText(l, bx + 18, by + 22 + k * 22));
        if (info) {
            ctx.fillStyle = '#facc15';
            ctx.font = '700 14px Rajdhani';
            ctx.textAlign = 'right';
            ctx.fillText('TAP TO CONTINUE ▸', bx + bw - 16, by + bh - 16);
        }
        ctx.restore();
    }

    _renderHud(ctx, W, H) {
        const y = H - 40;
        ctx.save();
        ctx.textBaseline = 'middle';
        // Networks
        for (let i = 0; i < this.networks; i++) {
            const done = i < this.solved;
            ctx.fillStyle = done ? 'rgba(34,197,94,0.3)' : 'rgba(15,23,42,0.6)';
            ctx.strokeStyle = done ? '#22c55e' : '#475569';
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(W / 2 - 200 + i * 28, y, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
        // Lives
        for (let i = 0; i < Math.max(this.lives, this.maxLives); i++) {
            ctx.fillStyle = i < this.lives ? '#ef4444' : 'rgba(239,68,68,0.2)';
            ctx.font = '700 18px Rajdhani';
            ctx.textAlign = 'center';
            ctx.fillText('♥', W / 2 - 40 + i * 22, y);
        }
        // Scissors
        ctx.fillStyle = this.scissors <= 1 ? '#fbbf24' : '#94a3b8';
        ctx.font = '700 20px Rajdhani';
        ctx.textAlign = 'right';
        ctx.fillText(`✂ ${this.scissors}  ·  NETWORK ${Math.min(this.solved + 1, this.networks)}/${this.networks}`, W / 2 + 260, y);

        // Status line between the board and the HUD
        const B = this.boardRect();
        let text = null, color = '#94a3b8';
        if (this.result === 'success') { text = `ACCESS CUT · SCORE ${this.score}`; color = '#22c55e'; }
        else if (this.result === 'fail') { text = 'ACCESS HELD'; color = '#ef4444'; }
        else if (this.message) { text = this.message.text; color = this.message.color; }
        else if (this.selected !== null && !this.coach) { text = 'TAP AGAIN TO CUT'; color = '#fbbf24'; }
        if (text) {
            ctx.fillStyle = color;
            ctx.font = text === 'TAP AGAIN TO CUT' ? '600 16px Rajdhani' : '700 20px Orbitron';
            ctx.textAlign = 'center';
            ctx.fillText(text, W / 2, B.y + B.h + 28);
        }
        ctx.restore();
    }
}

// Cut "snip" voice for Sound.playGood(theme).
NetworkCutMechanic.SOUND = { soundFreq: 520, soundType: 'square' };

if (typeof module !== 'undefined' && module.exports) module.exports = NetworkCutMechanic;
