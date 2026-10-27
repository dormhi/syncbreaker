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
    'js/data/Campaign.js',
    'js/data/Endless.js',
    'js/core/EndlessRun.js',
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
    'LEVEL_THEMES',
    'CAMPAIGN'
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
    'js/core/I18n.js',
    'js/i18n/tr.js',
    'js/UITheme.js',
    'js/core/Collision.js',
    'js/core/GameLoop.js',
    'js/core/ChallengeGate.js',
    'js/core/InputManager.js',
    'js/core/BackGuard.js',
    'js/core/Coach.js',
    'js/core/EndlessRun.js',
    'js/data/Campaign.js',
    'js/data/Endless.js',
    'js/core/PhysicsWorld.js',
    'js/mechanics/Mechanic.js',
    'js/mechanics/TimingBarMechanic.js',
    'js/mechanics/DualRingMechanic.js',
    'js/mechanics/PacketPurgeMechanic.js',
    'js/mechanics/PhysicsMechanic.js',
    'js/mechanics/StackOverflowMechanic.js',
    'js/mechanics/OrbitalShieldMechanic.js',
    'js/mechanics/SignalLockMechanic.js',
    'js/mechanics/RouteTraceMechanic.js',
    'js/mechanics/NetworkCutMechanic.js',
    'js/mechanics/LogicBombMechanic.js',
    'js/mechanics/DefragMechanic.js',
    'js/mechanics/ChecksumGridMechanic.js',
    'js/mechanics/MissionMechanic.js',
    'js/mechanics/HandoverMissions.js',
    'js/core/GameRegistry.js',
    'js/CampaignProgress.js',
    'js/EndlessProgress.js',
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
    'js/ProfileForm.js',
    'js/TipBar.js',
    'js/GameManager.js'
];

const FULL_EXPORTS = ['GameManager', 'UITheme', 'Matter', 'TimingBarMechanic', 'PhysicsWorld', 'PhysicsMechanic', 'StackOverflowMechanic', 'Sound',
    'CAMPAIGN', 'CampaignProgress', 'GameRegistry', 'LockpickSystem', 'PacketPurgeMechanic',
    'LeaderboardService', 'TipBar', 'OrbitalShieldMechanic', 'SignalLockMechanic', 'RouteTraceMechanic', 'NetworkCutMechanic', 'LogicBombMechanic', 'DefragMechanic', 'ChecksumGridMechanic', 'MissionMechanic', 'HandoverMissions', 'BackGuard', 'Coach', 'I18n', 'ENDLESS', 'EndlessRun', 'EndlessProgress'];

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

/**
 * Loads the entire game with DOM stubs. `initialStorage` pre-fills
 * localStorage (e.g. a legacy save for migration tests).
 */
function loadGameManager(initialStorage = {}) {
    const store = new Map(Object.entries(initialStorage).map(([k, v]) => [k, String(v)]));
    const localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => { store.set(k, String(v)); },
        removeItem: (k) => { store.delete(k); }
    };
    const listeners = {};
    const document = {
        addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
        removeEventListener: (type, fn) => {
            const list = listeners[type] || [];
            const i = list.indexOf(fn);
            if (i >= 0) list.splice(i, 1);
        }
    };
    // Silent Web Audio: any member is a chainable no-op, numbers coerce to 0.
    const silent = new Proxy(function () {}, {
        get: (t, p) => (p === Symbol.toPrimitive ? () => 0 : silent),
        apply: () => silent,
        construct: () => silent
    });
    const window = {
        AudioContext: silent,
        addEventListener: (type, fn) => { (listeners['window:' + type] = listeners['window:' + type] || []).push(fn); }
    };
    const api = runFiles(FULL_FILES, FULL_EXPORTS, { localStorage, document, window });
    api.storage = localStorage;
    // Fire a document event at the registered listeners (keyboard tests).
    api.fireDocument = (type, event) => (listeners[type] || []).slice().forEach(fn => fn(event));
    return api;
}

module.exports = { loadModules, loadLevelManager, loadGameManager, makeRng, makeFakeCanvas, makeFakeCtx };


