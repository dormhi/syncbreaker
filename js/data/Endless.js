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
   ========================================= */

const ENDLESS = {
    games: [
        // Timing Bar keeps the balance of the old Endless: six misses end
        // a run, and waves 3, 6, 9… give one back (up to five).
        { key: 'timingbar', act: 1, kind: 'health', ready: true, damage: 1 / 6, refillEvery: 3, refill: 1 / 6, refillCap: 5 / 6 },
        { key: 'stack',     act: 2, kind: 'health', ready: false },
        { key: 'orbital',   act: 3, kind: 'health', ready: false },
        { key: 'signal',    act: 4, kind: 'timer',  ready: false },
        { key: 'route',     act: 5, kind: 'timer',  ready: false },
        { key: 'cut',       act: 6, kind: 'health', ready: false },
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
