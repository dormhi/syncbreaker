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
   ========================================= */

const CAMPAIGN = {
    acts: [
        {
            id: 1,
            key: 'REMOVE_MALWARE',
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
            key: 'REBUILD_FIREWALL',
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
            key: 'CLOSE_PORTS',
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
            key: 'RESET_CREDS',
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
        { id: 5, key: 'TRACE_LOGS',   story: 'Follow the log stream back to the attacker',         game: null, themeId: 1, available: false, stages: [] },
        { id: 6, key: 'CUT_ACCESS',   story: 'Cut the attacker\'s cables and sever the link',      game: null, themeId: 6, available: false, stages: [] }
    ],

    // gates[n - 1] opens act n + 1. Packet Purge tuning; gate 1 = original.
    gates: [
        { id: 1, waves: 2, speedScale: 1.00 },
        { id: 2, waves: 2, speedScale: 1.08 },
        { id: 3, waves: 3, speedScale: 1.12 },
        { id: 4, waves: 3, speedScale: 1.18 },
        { id: 5, waves: 3, speedScale: 1.25 }
    ],

    // Lockpick revive difficulty is the act number (1-6).
    maxStages: 5,
    finalAct: 6
};

if (typeof module !== 'undefined' && module.exports) module.exports = CAMPAIGN;
