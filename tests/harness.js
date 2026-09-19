/* =========================================
   tests/harness.js — Load browser-global modules in a VM

   The game ships as plain global classes with no bundler. This harness
   concatenates the relevant files into one script scope (so top-level
   `class`/`const` bindings can reference each other) and exposes them
   back out via globalThis.__api.
   ========================================= */

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');

const FILES = [
    'js/utils.js',
    'js/core/Collision.js',
    'js/mechanics/Mechanic.js',
    'js/mechanics/TimingBarMechanic.js',
    'js/core/GameLoop.js',
    'js/core/ChallengeGate.js',
    'js/mechanics/DualRingMechanic.js',
    'js/mechanics/PacketPurgeMechanic.js',
    'js/EnergySystem.js'
];

const EXPORTS = [
    'Utils',
    'Collision',
    'Mechanic',
    'TimingBarMechanic',
    'GameLoop',
    'ChallengeGate',
    'DualRingMechanic',
    'PacketPurgeMechanic',
    'EnergySystem'
];

const GAME_FILES = [
    'js/utils.js',
    'js/core/Collision.js',
    'js/mechanics/Mechanic.js',
    'js/mechanics/TimingBarMechanic.js',
    'js/LevelThemes.js',
    'js/LevelIcons.js',
    'js/LevelManager.js'
];

const GAME_EXPORTS = [
    'Utils',
    'Collision',
    'TimingBarMechanic',
    'LevelManager',
    'getLevelTheme',
    'LEVEL_THEMES'
];

function makeSandbox(extra = {}) {
    const sandbox = {
        console,
        Math,
        Date,
        isFinite,
        Infinity,
        NaN,
        performance: { now: () => Date.now() },
        requestAnimationFrame: () => 0,
        cancelAnimationFrame: () => {},
        setTimeout,
        clearTimeout,
        ...extra
    };
    sandbox.globalThis = sandbox;
    return sandbox;
}

function runFiles(files, exportsList, extra) {
    const source = files
        .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8'))
        .join('\n;\n') +
        `\n;globalThis.__api = { ${exportsList.join(', ')} };\n`;

    const sandbox = makeSandbox(extra);
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'syncbreaker-bundle.js' });
    return sandbox.__api;
}

function loadModules() {
    const store = new Map();
    const localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); }
    };
    return runFiles(FILES, EXPORTS, { localStorage });
}

/** Loads LevelManager + dependencies with browser stubs (Sound, localStorage). */
function loadLevelManager() {
    const noop = () => {};
    const Sound = {
        playPerfect: noop, playGood: noop, playMiss: noop,
        playLevelFail: noop, playLevelComplete: noop, playWaveUp: noop,
        startAmbient: noop, stopAmbient: noop
    };
    const store = new Map();
    const localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); }
    };
    return runFiles(GAME_FILES, GAME_EXPORTS, { Sound, localStorage });
}

/** Deterministic RNG so zone generation and simulations are reproducible. */
function makeRng(seed = 1) {
    let s = seed >>> 0;
    return function rand() {
        // xorshift32
        s ^= s << 13; s >>>= 0;
        s ^= s >> 17;
        s ^= s << 5; s >>>= 0;
        return s / 4294967296;
    };
}

const FULL_FILES = [
    'js/utils.js',
    'js/core/Collision.js',
    'js/core/GameLoop.js',
    'js/core/ChallengeGate.js',
    'js/core/InputManager.js',
    'js/core/PhysicsWorld.js',
    'js/mechanics/Mechanic.js',
    'js/mechanics/TimingBarMechanic.js',
    'js/mechanics/DualRingMechanic.js',
    'js/mechanics/PacketPurgeMechanic.js',
    'js/mechanics/PhysicsMechanic.js',
    'vendor/matter.min.js',
    'js/EnergySystem.js',
    'js/StateManager.js',
    'js/UIManager.js',
    'js/LockpickSystem.js',
    'js/SoundManager.js',
    'js/LevelThemes.js',
    'js/LevelIcons.js',
    'js/LevelManager.js',
    'js/LeaderboardService.js',
    'js/GameManager.js'
];

const FULL_EXPORTS = ['GameManager', 'Matter', 'TimingBarMechanic', 'PhysicsWorld', 'PhysicsMechanic'];

/** Chainable no-op 2D context so render() can run outside a browser. */
function makeFakeCtx(canvas) {
    const target = { canvas };
    const proxy = new Proxy(target, {
        get(t, p) {
            if (p in t) return t[p];
            // Any unknown member is a chainable no-op method.
            t[p] = () => proxy;
            return t[p];
        },
        set(t, p, v) { t[p] = v; return true; }
    });
    return proxy;
}

function makeFakeCanvas() {
    return {
        width: 960,
        height: 640,
        style: {},
        addEventListener: () => {},
        removeEventListener: () => {},
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 640 })
    };
}

/** Loads the entire game with DOM stubs; returns { GameManager, Matter }. */
function loadGameManager() {
    const store = new Map();
    const localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); }
    };
    const document = {
        addEventListener: () => {},
        removeEventListener: () => {}
    };
    return runFiles(FULL_FILES, FULL_EXPORTS, { localStorage, document });
}

module.exports = { loadModules, loadLevelManager, loadGameManager, makeRng, makeFakeCanvas, makeFakeCtx };


