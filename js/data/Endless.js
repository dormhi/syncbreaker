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
        { key: 'signal',    act: 4, kind: 'timer',  ready: false },
        { key: 'route',     act: 5, kind: 'timer',  ready: false },
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
        { key: 'bomb',      act: 7, kind: 'timer',  ready: false },
        { key: 'defrag',    act: 8, kind: 'timer',  ready: false },
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
