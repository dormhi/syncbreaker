/* =========================================
   LevelThemes.js — Per-Level Visual Themes
   Unique colors, icons, particles per level
   CG Concept: Themed rendering, color palettes
   ========================================= */

const LEVEL_THEMES = {

    // Level 1: CLEAR_LOGS — Terminal green, binary data
    1: {
        icon: '📄',
        zoneColor: '#22c55e',
        zoneBg: 'rgba(34,197,94,0.15)',
        barGlow: '#22c55e',
        indicatorColor: '#22c55e',
        particleSymbols: ['0', '1', '{', '}'],
        hitWords: { perfect: 'PURGED', good: 'CLEARED', miss: 'ERROR' },
        hitColors: { perfect: '#22c55e', good: '#4ade80', miss: '#ef4444' },
        soundType: 'sine',
        soundFreq: 600,
    },

    // Level 2: CLOSE_PORTS — Amber warning, gate/lock
    2: {
        icon: '🚪',
        zoneColor: '#f59e0b',
        zoneBg: 'rgba(245,158,11,0.15)',
        barGlow: '#f59e0b',
        indicatorColor: '#f59e0b',
        particleSymbols: ['▮', '█', '▬', '|'],
        hitWords: { perfect: 'SEALED', good: 'CLOSED', miss: 'BREACH' },
        hitColors: { perfect: '#f59e0b', good: '#fbbf24', miss: '#ef4444' },
        soundType: 'square',
        soundFreq: 400,
    },

    // Level 3: REMOVE_MALWARE — Danger red, skulls/virus
    3: {
        icon: '☠',
        zoneColor: '#ef4444',
        zoneBg: 'rgba(239,68,68,0.15)',
        barGlow: '#ef4444',
        indicatorColor: '#ef4444',
        particleSymbols: ['☠', '✕', '×', '⚠'],
        hitWords: { perfect: 'DESTROYED', good: 'REMOVED', miss: 'INFECTED' },
        hitColors: { perfect: '#ef4444', good: '#f87171', miss: '#7f1d1d' },
        soundType: 'sawtooth',
        soundFreq: 300,
    },

    // Level 4: RESET_CREDS — Cyan/teal, key/password
    4: {
        icon: '🔑',
        zoneColor: '#06b6d4',
        zoneBg: 'rgba(6,182,212,0.15)',
        barGlow: '#06b6d4',
        indicatorColor: '#06b6d4',
        particleSymbols: ['*', '#', '@', '&'],
        hitWords: { perfect: 'RESET', good: 'CHANGED', miss: 'LEAKED' },
        hitColors: { perfect: '#06b6d4', good: '#22d3ee', miss: '#ef4444' },
        soundType: 'sine',
        soundFreq: 700,
    },

    // Level 5: FIREWALL — Orange fire, bricks/flame
    5: {
        icon: '🔥',
        zoneColor: '#f97316',
        zoneBg: 'rgba(249,115,22,0.15)',
        barGlow: '#f97316',
        indicatorColor: '#f97316',
        particleSymbols: ['█', '▓', '░', '■'],
        hitWords: { perfect: 'FORTIFIED', good: 'BUILT', miss: 'BREACHED' },
        hitColors: { perfect: '#f97316', good: '#fb923c', miss: '#ef4444' },
        soundType: 'triangle',
        soundFreq: 200,
    },

    // Level 6: CUT_ACCESS — Electric purple, sparks
    6: {
        icon: '⚡',
        zoneColor: '#a855f7',
        zoneBg: 'rgba(168,85,247,0.15)',
        barGlow: '#a855f7',
        indicatorColor: '#a855f7',
        particleSymbols: ['⚡', '✂', '—', '~'],
        hitWords: { perfect: 'SEVERED', good: 'CUT', miss: 'LINKED' },
        hitColors: { perfect: '#a855f7', good: '#c084fc', miss: '#ef4444' },
        soundType: 'square',
        soundFreq: 500,
    },

    // Endless mode — Gold
    999: {
        icon: '∞',
        zoneColor: '#f59e0b',
        zoneBg: 'rgba(245,158,11,0.15)',
        barGlow: '#f59e0b',
        indicatorColor: '#f59e0b',
        particleSymbols: ['∞', '◆', '●', '▲'],
        hitWords: { perfect: 'PERFECT', good: 'GOOD', miss: 'MISS' },
        hitColors: { perfect: '#f59e0b', good: '#fbbf24', miss: '#ef4444' },
        soundType: 'sine',
        soundFreq: 500,
    }
};

// Default fallback
const DEFAULT_THEME = LEVEL_THEMES[1];

/** Get theme for a level id */
function getLevelTheme(levelId) {
    return LEVEL_THEMES[levelId] || DEFAULT_THEME;
}
