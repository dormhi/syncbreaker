/* =========================================
   Campaign.js — Acts, stages and gates (single source of truth)

   Each act is ONE game; its 3-5 stages are that game's rising
   difficulty tiers. A gate (Packet Purge, harder each time) sits
   between consecutive acts. See docs/ACT_PLAN.md.

   - `themeId` picks the act's colour theme + icon from the legacy
     per-level tables (LevelThemes / LevelIcons).
   - `available: false` acts are shown as IN DEVELOPMENT.
   - Stage `params` are handed to the game as-is.
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
            stages: [
                { tier: 'EASY',   params: { targetBlocks: 5, maxDrops: 10, baseOmega: 1.30 } },
                { tier: 'NORMAL', params: { targetBlocks: 7, maxDrops: 12, baseOmega: 1.36 } },
                { tier: 'HARD',   params: { targetBlocks: 9, maxDrops: 14, baseOmega: 1.42 } }
            ]
        },
        { id: 3, key: 'CLOSE_PORTS',  story: 'Block the attack packets hammering the open ports', game: null, themeId: 2, available: false, stages: [] },
        { id: 4, key: 'RESET_CREDS',  story: 'Re-sync the compromised credential keys',           game: null, themeId: 4, available: false, stages: [] },
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
