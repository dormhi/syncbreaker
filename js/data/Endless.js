/* =========================================
   data/Endless.js — The new Endless Mode (docs/ACT_PLAN.md 8b)

   The endless version of games 1-9 (Act 10 stays a teaching act). The
   player picks a game in the Endless lobby and plays round after round
   until the run ends:
   - 'health': one health bar for the whole run; every mistake cuts it by
     `damage` (a share of the bar). `refillEvery` cleared rounds give back
     `refill`.
   - 'timer':  every round has its own timer; a cleared round starts the
     next one with a fresh timer, time out ends the run.
   - 'pool':   one shared time pool; every cleared round adds time.
   `ready` games can be played; the others are built in phases E2-E5 and
   show as coming soon. Endless still unlocks after the final act.

   Mechanic games (all but Timing Bar) play one mechanic per round:
   `round(r)` gives round r's parameters, starting near the campaign's
   EASY tier and climbing past its hardest; `points(m)` scores a cleared
   round without the mechanic's own lives (the run's health bar replaces
   them). DRAFT numbers: a bot sweep and the user's approval come later.
   ========================================= */

/** Linear ramp from `a` (round 1) by `step` per round, held at `cap`. */
const endlessRamp = (r, a, step, cap) => (step >= 0 ? Math.min(cap, a + step * (r - 1)) : Math.max(cap, a + step * (r - 1)));

const ENDLESS = {
    games: [
        // Timing Bar keeps the balance of the old Endless: six misses end
        // a run, and waves 3, 6, 9… give one back (up to five).
        { key: 'timingbar', act: 1, kind: 'health', ready: true, damage: 1 / 6, refillEvery: 3, refill: 1 / 6, refillCap: 5 / 6 },
        // A round is one tower: one block higher each round up to nine,
        // then the crane keeps speeding up. A fallen block costs a quarter.
        { key: 'stack', act: 2, kind: 'health', ready: true, damage: 0.25, refillEvery: 3, refill: 0.25,
            round: (r) => {
                const targetBlocks = Math.min(9, 4 + r);
                return { targetBlocks, maxDrops: targetBlocks + 5, baseOmega: endlessRamp(r, 1.30, 0.03, 1.75) };
            },
            points: (m) => m.placed.length * 100 + (m.maxDrops - m.drops) * 50 },
        // A round is a set of packets: more ports, faster packets, shorter
        // warnings; bursts from round 6, packets that switch port from 9.
        { key: 'orbital', act: 3, kind: 'health', ready: true, damage: 0.2, refillEvery: 3, refill: 0.2,
            round: (r) => {
                const gapMin = endlessRamp(r, 0.8, -0.04, 0.38);
                return {
                    ports: r <= 2 ? 4 : r <= 5 ? 6 : 8,
                    speed: endlessRamp(r, 150, 12, 300),
                    blocksNeeded: Math.min(20, 10 + r),
                    warn: endlessRamp(r, 0.6, -0.04, 0.25),
                    gapMin, gapMax: gapMin + 0.35,
                    stepCost: r <= 1 ? 0.12 : 0.1,
                    burstChance: r >= 6 ? 0.25 : 0,
                    switchChance: r >= 9 ? 0.35 : 0
                };
            },
            points: (m) => m.blocked * 100 },
        // A round is a set of keys against the round's own timer: fewer
        // seconds per key, a narrower window, a faster drifting target;
        // glitches from round 6. Drift stops at 1.0 rad/s (above ~1.1 the
        // game turns unplayable, docs/ACT_PLAN.md Act 4): later rounds
        // only get shorter, down to 8 s per key.
        { key: 'signal', act: 4, kind: 'timer', ready: true,
            round: (r) => {
                const keys = r <= 3 ? 3 : r <= 8 ? 4 : 5;
                const glitchMin = r >= 6 ? endlessRamp(r - 5, 8, -0.3, 4) : 0;
                return {
                    keys,
                    timeLimit: Math.round(keys * endlessRamp(r, 15, -0.35, 8)),
                    tol: endlessRamp(r, 0.32, -0.01, 0.21),
                    syncTime: r <= 4 ? 1.2 : 1.4,
                    drain: r <= 1 ? 0 : r <= 3 ? 0.6 : 1.0,
                    driftAmp: r <= 1 ? 0 : endlessRamp(r - 1, 0.35, 0.02, 0.6),
                    driftSpeed: r <= 1 ? 0 : endlessRamp(r - 1, 0.75, 0.03, 1.0),
                    glitchMin, glitchMax: glitchMin ? glitchMin + 3 : 0
                };
            },
            points: (m) => m.score },
        // A round is a set of traces against the round's own timer: the
        // grid grows to 6 × 6, then locked tiles (round 6) and scrambles
        // (round 9) join and the time per trace shrinks.
        { key: 'route', act: 5, kind: 'timer', ready: true,
            round: (r) => {
                const size = r <= 2 ? 4 : r <= 5 ? 5 : 6;
                const traces = r <= 2 ? 2 : 3;
                const path = { 4: [4, 7], 5: [6, 11], 6: [9, 16] }[size];
                const perTrace = size === 4 ? 22 : size === 5 ? 23 : Math.max(22, 28 - Math.max(0, r - 6));
                const scrambleMin = r >= 9 ? endlessRamp(r - 8, 12, -0.5, 6) : 0;
                return {
                    size, traces, timeLimit: traces * perTrace,
                    minPath: path[0], maxPath: path[1],
                    decoyRate: endlessRamp(r, 0.45, 0.04, 0.8),
                    teeRate: endlessRamp(r, 0.15, 0.015, 0.3),
                    lockRate: r >= 6 ? endlessRamp(r - 5, 0.12, 0.01, 0.2) : 0,
                    scrambleMin, scrambleMax: scrambleMin ? scrambleMin + 4 : 0
                };
            },
            points: (m) => m.score },
        // A round is one network: wider, with owner lines from round 3,
        // armored cables from 6 and failover lines from 9.
        { key: 'cut', act: 6, kind: 'health', ready: true, damage: 0.25, refillEvery: 3, refill: 0.25,
            round: (r) => ({
                networks: 1,
                cols: r <= 3 ? 5 : 6,
                minCutMin: r <= 4 ? 2 : 3,
                minCutMax: r <= 2 ? 2 : r <= 7 ? 3 : 4,
                slack: r <= 2 ? 2 : 1,
                ownerMin: r >= 5 ? 3 : r >= 3 ? 2 : 0,
                ownerMax: r >= 5 ? 4 : r >= 3 ? 3 : 0,
                armoredMin: r >= 8 ? 2 : r >= 6 ? 1 : 0,
                armoredMax: r >= 6 ? 2 : 0,
                failoverMin: r >= 9 ? 1 : 0,
                failoverMax: r >= 11 ? 2 : r >= 9 ? 1 : 0
            }),
            points: (m) => m.solved * 300 + m.spare * 50 },
        // A round is one payload with its own timer, adding the campaign's
        // new things in its order (trigger circuit, cipher pad, kill switch
        // with SIG / flag rules); from round 6 the timer gets shorter. A
        // detonated payload (3 strikes or time out) ends the run.
        { key: 'bomb', act: 7, kind: 'timer', ready: true,
            round: (r) => {
                const lv = r <= 1 ? 0 : r <= 2 ? 1 : r <= 4 ? 2 : 3;
                const p = [
                    { modules: 2, kinds: ['wires'], timeLimit: 60, wireMin: 3, wireMax: 4, rules: 3 },
                    { modules: 2, kinds: ['wires', 'circuit'], timeLimit: 75, wireMin: 3, wireMax: 4, rules: 3, inputs: 3, gates: 3, flipSlack: 1 },
                    { modules: 3, kinds: ['wires', 'circuit', 'pad'], timeLimit: 90, wireMin: 4, wireMax: 5, rules: 4, inputs: 3, gates: 3, xor: true, flipSlack: 1, padColumns: 3 },
                    { modules: 4, kinds: ['wires', 'circuit', 'pad', 'button'], timeLimit: 120, wireMin: 5, wireMax: 6, rules: 4, edgework: true, compound: true, inputs: 3, gates: 3, clock: true, flipSlack: 1, padColumns: 4 }
                ][lv];
                // Past round 5: 4 s less a round, down to 85 s.
                const timeLimit = r <= 5 ? p.timeLimit : Math.max(85, 120 - 4 * (r - 5));
                return Object.assign({}, p, { payloads: 1, strikes: 3, timeLimit });
            },
            points: (m) => m.score },
        // A round is one disk with its own timer, in the campaign's order:
        // 5 × 5 with the full map, 6 × 6 with turned blocks and corrupted
        // sectors, 7 × 6 with half the map; from round 5 snapshot disks
        // and half-map disks take turns and the timer gets shorter.
        { key: 'defrag', act: 8, kind: 'timer', ready: true,
            round: (r) => {
                const half = { cols: 7, rows: 6, pieceMin: 9, pieceMax: 11, sizeMin: 3, sizeMax: 5, blockedMin: 4, blockedMax: 5, turned: true, map: 'half', timeLimit: 97 };
                const snap = { cols: 6, rows: 6, pieceMin: 7, pieceMax: 8, sizeMin: 4, sizeMax: 5, blockedMin: 2, blockedMax: 2, image: true, twinMin: 2, twinMax: 3, penaltyTime: 10, timeLimit: 125 };
                const p = r <= 1 ? { cols: 5, rows: 5, pieceMin: 6, pieceMax: 8, sizeMin: 3, sizeMax: 4, map: 'all', timeLimit: 60 }
                    : r <= 2 ? { cols: 6, rows: 6, pieceMin: 7, pieceMax: 9, sizeMin: 3, sizeMax: 5, blockedMin: 2, blockedMax: 3, turned: true, map: 'all', timeLimit: 83 }
                    : r <= 4 ? half
                    : r % 2 ? snap : half;
                // Past round 5: 3 % less time a round, down to 70 %.
                const share = r <= 5 ? 1 : Math.max(0.7, 1 - 0.03 * (r - 5));
                return Object.assign({}, p, { disks: 1, timeLimit: Math.round(p.timeLimit * share) });
            },
            points: (m) => m.score },
        { key: 'checksum',  act: 9, kind: 'pool',   ready: false }
    ],

    /** A game entry by key (null when the game has no endless version). */
    game(key) {
        return ENDLESS.games.find(g => g.key === key) || null;
    },

    /** Games that can be played now, in act order. */
    readyGames() {
        return ENDLESS.games.filter(g => g.ready);
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = ENDLESS;
