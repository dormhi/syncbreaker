/* =========================================
   Campaign.js — Acts, stages and gates (single source of truth)

   Each act is ONE game; its 3-5 stages are that game's rising
   difficulty tiers. A gate (Packet Purge, harder each time) sits
   between consecutive acts. See docs/ACT_PLAN.md.

   - `themeId` picks the act's colour theme + icon from the legacy
     per-level tables (LevelThemes / LevelIcons).
   - `available: false` acts are shown as IN DEVELOPMENT.
   - Stage `params` are handed to the game as-is.
   - `hint` is the faint in-game controls line shown on an act's FIRST
     stage only, with a desktop and a touch variant.
   - `done` is how the main menu's status report names a cleared act.
   ========================================= */

const CAMPAIGN = {
    acts: [
        {
            id: 1,
            key: 'REMOVE_MALWARE', done: 'malware purged',
            story: 'Purge the infected nodes before the malware spreads',
            game: 'timingbar',
            themeId: 3,
            available: true,
            controls: 'SPACE / tap when the marker is inside the zone',
            hint: {
                desktop: 'Press SPACE when the marker is inside the zone',
                touch: 'Tap anywhere when the marker is inside the zone'
            },
            stages: [
                { tier: 'EASY',      params: { barSpeed: 0.7,  targetSize: 0.22, requiredHits: 8,  maxTime: 25, lives: 3 } },
                { tier: 'NORMAL',    params: { barSpeed: 0.9,  targetSize: 0.18, requiredHits: 10, maxTime: 28, lives: 3 } },
                { tier: 'HARD',      params: { barSpeed: 1.1,  targetSize: 0.15, requiredHits: 14, maxTime: 34, lives: 3 } },
                { tier: 'VERY HARD', params: { barSpeed: 1.25, targetSize: 0.12, requiredHits: 18, maxTime: 45, lives: 4 } }
            ]
        },
        {
            id: 2,
            key: 'REBUILD_FIREWALL', done: 'firewall rebuilt',
            story: 'Stack the firewall back up, block by block',
            game: 'stack',
            themeId: 5,
            available: true,
            controls: 'SPACE / tap to drop · blocks keep the crane\'s momentum',
            hint: {
                desktop: 'Press SPACE or click to drop · blocks keep the crane\'s momentum',
                touch: 'Tap anywhere to drop · blocks keep the crane\'s momentum'
            },
            stages: [
                { tier: 'EASY',   params: { targetBlocks: 5, maxDrops: 10, baseOmega: 1.30 } },
                { tier: 'NORMAL', params: { targetBlocks: 7, maxDrops: 12, baseOmega: 1.36 } },
                { tier: 'HARD',   params: { targetBlocks: 9, maxDrops: 14, baseOmega: 1.42 } }
            ]
        },
        {
            id: 3,
            key: 'CLOSE_PORTS', done: 'ports sealed',
            story: 'Block the attack packets hammering the open ports',
            game: 'orbital',
            themeId: 2,
            available: true,
            controls: '← / → or tap a port · block the packet at the blinking port',
            hint: {
                desktop: '← / → (or A / D) moves the shield to the blinking port',
                touch: 'Tap the blinking port to move the shield there'
            },
            // Tuned with a human-like bot sweep (see docs/ACT_PLAN.md).
            // HARD and VERY HARD share every setting except lives and packet
            // speed; VERY HARD adds packets that hop to a neighbouring port
            // mid-flight. Playtest tuning: lives 4/5/6/7 (3 was too few) and
            // VERY HARD packets slowed 270 -> 245 (hops made it too hard).
            stages: [
                { tier: 'EASY',      params: { ports: 4, speed: 150, blocksNeeded: 12, warn: 0.6,  gapMin: 0.8,  gapMax: 1.2, lives: 4 } },
                { tier: 'NORMAL',    params: { ports: 6, speed: 210, blocksNeeded: 16, warn: 0.35, gapMin: 0.55, gapMax: 0.85, stepCost: 0.1, lives: 5 } },
                { tier: 'HARD',      params: { ports: 8, speed: 270, blocksNeeded: 20, warn: 0.3,  gapMin: 0.42, gapMax: 0.68, stepCost: 0.1, burstChance: 0.25, lives: 6 } },
                { tier: 'VERY HARD', params: { ports: 8, speed: 245, blocksNeeded: 20, warn: 0.3,  gapMin: 0.42, gapMax: 0.68, stepCost: 0.1, burstChance: 0.25, switchChance: 0.35, lives: 7 } }
            ]
        },
        {
            id: 4,
            key: 'RESET_CREDS', done: 'credentials reset',
            story: 'Re-sync the compromised credential keys',
            game: 'signal',
            themeId: 4,
            available: true,
            controls: 'Hold SPACE / hold anywhere to raise your signal · release to lower it',
            hint: {
                desktop: 'Hold SPACE to raise your signal, release to lower it',
                touch: 'Hold anywhere to raise your signal, let go to lower it'
            },
            // Tuned with a human-like bot sweep (see docs/ACT_PLAN.md). EXPERT
            // stays playable: drift faster than ~1.1 rad/s made it impossible.
            stages: [
                { tier: 'EASY',      params: { keys: 3, timeLimit: 45, tol: 0.32, drain: 0 } },
                { tier: 'NORMAL',    params: { keys: 3, timeLimit: 40, tol: 0.26, drain: 0.6, driftAmp: 0.35, driftSpeed: 0.75 } },
                { tier: 'HARD',      params: { keys: 4, timeLimit: 45, tol: 0.23, drain: 1.0, driftAmp: 0.5, driftSpeed: 1.0, syncTime: 1.4 } },
                { tier: 'VERY HARD', params: { keys: 4, timeLimit: 45, tol: 0.23, drain: 1.0, driftAmp: 0.5, driftSpeed: 1.0, syncTime: 1.4, glitchMin: 5, glitchMax: 8 } },
                { tier: 'EXPERT',    params: { keys: 5, timeLimit: 50, tol: 0.22, drain: 1.0, driftAmp: 0.55, driftSpeed: 1.05, syncTime: 1.4, glitchMin: 5, glitchMax: 8 } }
            ]
        },
        {
            id: 5,
            key: 'TRACE_LOGS', done: 'attacker traced',
            story: 'Follow the log stream back to the attacker',
            game: 'route',
            themeId: 1,
            available: true,
            controls: 'Tap a tile to rotate it · or arrows to move, SPACE to rotate',
            hint: {
                desktop: 'Click a tile to rotate it (or arrows + SPACE) · connect YOU to the ATTACKER',
                touch: 'Tap a tile to rotate it · connect YOU to the ATTACKER'
            },
            // Time-based, no lives. Path lengths are capped per tier; time
            // limits are ~2-3x a simple solve-time model (docs/ACT_PLAN.md).
            // Playtest: 3 stages are enough (the 7x7 VERY HARD was dropped).
            stages: [
                { tier: 'EASY',      params: { size: 4, traces: 2, timeLimit: 45,  decoyRate: 0.45, teeRate: 0.15, minPath: 4,  maxPath: 7 } },
                { tier: 'NORMAL',    params: { size: 5, traces: 3, timeLimit: 70,  decoyRate: 0.6,  teeRate: 0.2,  minPath: 6,  maxPath: 11 } },
                { tier: 'HARD',      params: { size: 6, traces: 3, timeLimit: 85,  decoyRate: 0.7,  teeRate: 0.25, minPath: 9,  maxPath: 16, lockRate: 0.12 } }
            ]
        },
        {
            id: 6,
            key: 'CUT_ACCESS', done: 'access cut',
            story: 'Cut the attacker\'s cables and sever the link',
            game: 'cut',
            themeId: 6,
            available: true,
            controls: 'Tap a cable to select it, tap again to cut · arrows + SPACE',
            hint: {
                desktop: 'Click a cable to select it, click again to cut · cut every red path to the CORE',
                touch: 'Tap a cable to select it, tap again to cut · cut every red path to the CORE'
            },
            // Lives + logic, no timer (docs/ACT_PLAN.md). Tuned with a bot
            // sweep, approved 2026-10-24 (L2: lives 3/4/5/5, VERY HARD +1 scissor);
            // `cols` relay columns (3 rows), `minCut` is the cheapest solution
            // in scissors (a hidden bottleneck) and `slack` the spare scissors.
            // Cables at ATK and the CORE are shielded. Owner lines (blue) cost a
            // life when cut, armored cables need two cuts, failover lines
            // wake when their tagged cable is cut.
            stages: [
                { tier: 'EASY',      params: { networks: 3, cols: 5, minCutMin: 2, minCutMax: 2, slack: 2, lives: 3 } },
                { tier: 'NORMAL',    params: { networks: 3, cols: 5, minCutMin: 2, minCutMax: 3, slack: 1, ownerMin: 2, ownerMax: 3, lives: 4 } },
                { tier: 'HARD',      params: { networks: 4, cols: 6, minCutMin: 3, minCutMax: 3, slack: 1, ownerMin: 3, ownerMax: 4, armoredMin: 1, armoredMax: 2, lives: 5 } },
                { tier: 'VERY HARD', params: { networks: 4, cols: 6, minCutMin: 3, minCutMax: 4, slack: 1, ownerMin: 3, ownerMax: 4, armoredMin: 2, armoredMax: 2, failoverMin: 1, failoverMax: 2, lives: 5 } }
            ]
        },
        { id: 7, key: 'DEFUSE_PAYLOAD', done: 'payload defused', story: 'Disarm the logic bomb the attacker left behind',     game: null, themeId: 7, available: false, stages: [] },
        { id: 8, key: 'RESTORE_CORE', done: 'core restored',   story: 'Bring the core back online from clean backups',      game: null, themeId: 8, available: false, stages: [] },
        // Act 9: a test of knowledge and reasoning — no timer, no lives.
        { id: 9, key: 'FINAL_AUDIT', done: 'audit passed',    story: 'Prove the system is clean — knowledge and logic only', game: null, themeId: 9, available: false, stages: [] },
        // Final act (HANDOVER status, outside the network layers): give control
        // back to the rightful owner and teach them to keep it. Educational.
        { id: 10, key: 'RETURN_CONTROL', done: 'control returned', story: 'Hand the system back to its owner — and teach them to keep it safe', game: null, themeId: 10, available: false, stages: [] }
    ],

    // gates[n - 1] opens act n + 1. Packet Purge tuning; gate 1 = original.
    // Gate 9 (act 9 -> 10) is tuned together with Act 10 (docs/ACT_PLAN.md).
    gates: [
        { id: 1, waves: 2, speedScale: 1.00 },
        { id: 2, waves: 2, speedScale: 1.08 },
        { id: 3, waves: 3, speedScale: 1.12 },
        { id: 4, waves: 3, speedScale: 1.18 },
        { id: 5, waves: 3, speedScale: 1.25 },
        { id: 6, waves: 3, speedScale: 1.30 },
        { id: 7, waves: 3, speedScale: 1.35 },
        { id: 8, waves: 3, speedScale: 1.40 }
    ],

    // Lockpick revive difficulty is the act number (1-6).
    maxStages: 5,
    finalAct: 10
};

// Stage stars (bot-swept, approved 2026-10-23; docs/UI_PLAN.md 3e).
// Clearing a stage earns 1 star; these rules decide 2 and 3. A run that
// used a revive earns 1 star at most. `stats` comes from the game's
// starStats() (the Timing Bar's from LevelManager).
CAMPAIGN.starRules = (() => {
    // Seconds left needed for [3 stars, 2 stars], per tier.
    const bySeconds = (table) => (s, tier) => {
        const t = table[tier] || [Infinity, Infinity];
        return s.timeLeft >= t[0] ? 3 : s.timeLeft >= t[1] ? 2 : 1;
    };
    return {
        timingbar: (s) => (s.misses === 0 && s.perfectShare >= 0.8) ? 3 : s.misses <= 1 ? 2 : 1,
        stack: (s) => (s.lost === 0 && s.align >= 0.8) ? 3 : s.align >= 0.7 ? 2 : 1,
        orbital: (s) => s.breaches === 0 ? 3 : s.breaches <= 1 ? 2 : 1,
        signal: bySeconds({ 'EASY': [38, 36], 'NORMAL': [33, 31], 'HARD': [30, 22], 'VERY HARD': [30, 20], 'EXPERT': [20, 12] }),
        route: bySeconds({ 'EASY': [30, 20], 'NORMAL': [35, 15], 'HARD': [45, 20] })
    };
})();

/** Stars (1..3) for a cleared stage. */
CAMPAIGN.starsFor = function (game, tier, stats, revived) {
    const rule = CAMPAIGN.starRules[game];
    if (revived || !rule || !stats) return 1;
    return Math.max(1, Math.min(3, rule(stats, tier)));
};

if (typeof module !== 'undefined' && module.exports) module.exports = CAMPAIGN;
