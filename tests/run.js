/* =========================================
   tests/run.js — Zero-dependency test runner
   Run: node tests/run.js
   ========================================= */

'use strict';

const { loadModules, loadLevelManager, loadGameManager, makeRng, makeFakeCanvas, makeFakeCtx } = require('./harness');

const api = loadModules();
const { Utils, Collision, TimingBarMechanic, GameLoop } = api;

let passed = 0;
let failed = 0;
const failures = [];

function ok(name, cond, detail) {
    if (cond) { passed++; return; }
    failed++;
    failures.push(name + (detail ? ' — ' + detail : ''));
}

function approx(a, b, eps = 1e-9) {
    return Math.abs(a - b) <= eps;
}

function suite(name, fn) {
    console.log('\n▸ ' + name);
    fn();
}

// ─────────────────────────────────────────────
suite('Collision', () => {
    ok('range: inside', Collision.pointInRange(0.5, 0.2, 0.8));
    ok('range: start inclusive', Collision.pointInRange(0.2, 0.2, 0.8));
    ok('range: end inclusive', Collision.pointInRange(0.8, 0.2, 0.8));
    ok('range: outside', !Collision.pointInRange(0.81, 0.2, 0.8));

    const zone = { start: 0.3, end: 0.5 };
    ok('zone: center distance 0', approx(Collision.normalizedDistanceFromCenter(0.4, zone), 0));
    ok('zone: boundary distance 1', approx(Collision.normalizedDistanceFromCenter(0.5, zone), 1));
    ok('zone: outside distance >1', Collision.normalizedDistanceFromCenter(0.6, zone) > 1);
    ok('zone: degenerate -> Infinity', Collision.normalizedDistanceFromCenter(0.4, { start: 0.4, end: 0.4 }) === Infinity);

    ok('angle: wrap forward', approx(Collision.angleDistanceDeg(350, 10), 20));
    ok('angle: wrap backward', approx(Collision.angleDistanceDeg(10, 350), 20));
    ok('angle: opposite', approx(Collision.angleDistanceDeg(0, 180), 180));
    ok('angle: past true', Collision.isAnglePast(100, 90, 5));
    ok('angle: past boundary false', !Collision.isAnglePast(95, 90, 5));
    ok('angle: behind false', !Collision.isAnglePast(300, 90, 5));
});

// ─────────────────────────────────────────────
suite('TimingBarMechanic — motion', () => {
    const bar = new TimingBarMechanic();
    const v = 1.7;
    bar.reset(v, 0.1);

    // Bounds across a full cycle.
    let bounded = true;
    for (let t = 0; t < 5; t += 0.001) {
        const p = bar.positionAt(t);
        if (p < -1e-12 || p > 1 + 1e-12) { bounded = false; break; }
    }
    ok('position always in [0,1]', bounded);

    // In-zone speed is EXACTLY the configured speed (difficulty contract).
    const t1 = 0.001, t2 = 0.002;
    ok('in-zone speed == nominal', approx(bar.positionAt(t2) - bar.positionAt(t1), v * (t2 - t1), 1e-9));

    // Analytic keyframes.
    const rise = 1 / v;
    const dwell = bar.edgeDwell;
    ok('positionAt(rise) == 1', approx(bar.positionAt(rise), 1, 1e-9));
    ok('dwell holds at 1', approx(bar.positionAt(rise + dwell), 1, 1e-9));
    ok('positionAt(2*rise+dwell) == 0', approx(bar.positionAt(2 * rise + dwell), 0, 1e-6));
    ok('full cycle returns to 0', approx(bar.positionAt((rise + dwell) * 2), 0, 1e-9));

    // Determinism: same time => same position.
    ok('deterministic', bar.positionAt(1.2345) === bar.positionAt(1.2345));

    // FPS independence: accumulated fixed steps match analytic time.
    for (const h of [1 / 30, 1 / 60, 1 / 144]) {
        let t = 0;
        const n = Math.floor(0.5 / h);
        for (let i = 0; i < n; i++) t += h;
        ok('FPS independent @ ' + Math.round(1 / h) + 'Hz',
            approx(bar.positionAt(t), bar.positionAt(n * h), 1e-9));
    }

    // Samples never mutate state.
    const before = bar.time;
    bar.sample(0.4);
    ok('sample() is pure', bar.time === before);
});

// ─────────────────────────────────────────────
suite('TimingBarMechanic — hit detection', () => {
    const bar = new TimingBarMechanic();
    bar.reset(2.0, 0.1);
    const z = bar.zone;

    ok('zone inside [0.05,0.95]', z.start >= 0.05 - 1e-9 && z.end <= 0.95 + 1e-9);
    ok('boundary start inclusive', bar.hitTest(z.start).inZone);
    ok('boundary end inclusive', bar.hitTest(z.end).inZone);
    ok('outside below excluded', !bar.hitTest(z.start - 1e-6).inZone);
    ok('outside above excluded', !bar.hitTest(z.end + 1e-6).inZone);
    ok('center is perfect', bar.hitTest((z.start + z.end) / 2).dist < 0.35);
});

// ─────────────────────────────────────────────
suite('Calibration vs legacy clamp (no difficulty change)', () => {
    // Legacy model: frame-quantized ping-pong with clamp truncation.
    function legacyCycleSteps(v, dt) {
        let pos = 0, dir = 1, steps = 0, bounces = 0;
        while (bounces < 2) {
            pos += v * dir * dt;
            if (pos >= 1) { pos = 1; dir = -1; bounces++; }
            else if (pos <= 0) { pos = 0; dir = 1; bounces++; }
            steps++;
            if (steps > 1e6) break;
        }
        return steps;
    }

    const dt = 1 / 60;
    for (const v of [0.7, 0.9, 1.1, 1.4, 1.7, 2.0, 3.5, 4.0]) {
        const legacy = legacyCycleSteps(v, dt) * dt;
        const modern = 2 / v + 2 * (dt / 2); // analytic cycle incl. edge dwell
        const rel = Math.abs(modern - legacy) / legacy;
        ok('cycle within 5% @ v=' + v, rel < 0.05, 'legacy=' + legacy.toFixed(4) + ' modern=' + modern.toFixed(4) + ' rel=' + (rel * 100).toFixed(2) + '%');
    }

    // In-zone movement per frame must be identical between models.
    for (const v of [0.7, 2.0, 4.0]) {
        const legacyStep = v * dt;
        const modernBar = new TimingBarMechanic();
        modernBar.setSpeed(v);
        const modernStep = modernBar.positionAt(dt) - modernBar.positionAt(0);
        ok('per-frame in-zone step identical @ v=' + v, approx(legacyStep, modernStep, 1e-9));
    }
});

// ─────────────────────────────────────────────
suite('Sub-frame input cannot miss a visually-correct press', () => {
    const rng = makeRng(1234);
    const bar = new TimingBarMechanic();
    let misses = 0;
    let checks = 0;

    for (const speed of [0.7, 2.0, 4.0]) {
        for (let trial = 0; trial < 800; trial++) {
            bar.setSpeed(speed);
            bar.setTargetSize(0.08);
            bar.regenerateZone();
            const z = bar.zone;
            // A press that lands anywhere inside the zone (off-grid time).
            const frac = rng();
            const pressTime = 0.0001 + frac * 2; // arbitrary non-multiple time
            const pos = bar.positionAt(pressTime);
            // Only assert when the analytic position is inside the zone.
            if (pos >= z.start && pos <= z.end) {
                checks++;
                if (!bar.hitTest(pos).inZone) misses++;
            }
        }
    }
    ok('every in-zone press registers', misses === 0, misses + ' misses / ' + checks);
    ok('test exercised real cases', checks > 50);
});

// ─────────────────────────────────────────────
suite('GameLoop — fixed timestep / no slow motion', () => {
    function makeLoop() {
        const state = { updates: 0, renders: 0, alpha: 0 };
        const loop = new GameLoop({
            fixedDt: 1 / 60,
            maxSubSteps: 5,
            update: () => { state.updates++; },
            render: (a) => { state.renders++; state.alpha = a; }
        });
        return { loop, state };
    }

    // 15 fps for 1 second must advance ~1 second of simulation (old loop
    // clamped dt to 1/30 and would only advance ~0.5s).
    {
        const { loop, state } = makeLoop();
        const frameMs = 1000 / 15;
        for (let i = 0; i <= 15; i++) loop._frame(i * frameMs);
        ok('15fps advances real time', Math.abs(loop.simulatedTime - 1.0) <= 1 / 60,
            'simulated=' + loop.simulatedTime.toFixed(4));
        ok('15fps ran ~60 updates', Math.abs(state.updates - 60) <= 2, 'updates=' + state.updates);
    }

    // 144 fps renders smoothly without over-stepping simulation.
    {
        const { loop } = makeLoop();
        const frameMs = 1000 / 144;
        for (let i = 0; i <= 144; i++) loop._frame(i * frameMs);
        ok('144fps advances real time', Math.abs(loop.simulatedTime - 1.0) <= 1 / 60,
            'simulated=' + loop.simulatedTime.toFixed(4));
    }

    // A 2s stall must not spiral: bounded catch-up.
    {
        const { loop, state } = makeLoop();
        loop._frame(0);
        loop._frame(2000);
        ok('stall is bounded by maxSubSteps', state.updates <= 5, 'updates=' + state.updates);
        ok('alpha stays in [0,1)', loop.accumulator / loop.fixedDt >= 0 && loop.accumulator / loop.fixedDt < 1);
    }
});

// ─────────────────────────────────────────────
suite('LevelManager integration (smoke)', () => {
    const game = loadLevelManager();
    const lm = new game.LevelManager();

    lm.startLevel(0);
    ok('level started', !!lm.currentLevel && lm.currentLevel.id === 1);
    ok('zone within bounds', lm.targetZoneStart >= 0.05 - 1e-9 && lm.targetZoneEnd <= 0.95 + 1e-9);

    for (let i = 0; i < 120; i++) lm.update(1 / 60);
    ok('bar stays in [0,1]', lm.barPosition >= -1e-9 && lm.barPosition <= 1 + 1e-9);

    // Force a guaranteed hit by aligning the zone to the current position.
    lm.timingBar.zone.start = lm.barPosition;
    lm.timingBar.zone.end = lm.barPosition + 0.05;
    lm._syncZone();
    const beforeHits = lm.hitCount;
    lm.hit();
    ok('guaranteed hit registers', lm.hitCount === beforeHits + 1);
    ok('hit awards score', lm.score > 0);

    // Endless mode path.
    lm.startEndless();
    ok('endless started', lm.endlessMode === true);
    for (let i = 0; i < 60; i++) lm.updateEndless(1 / 60);
    lm.timingBar.zone.start = lm.barPosition;
    lm.timingBar.zone.end = lm.barPosition + 0.05;
    lm._syncZone();
    const eHits = lm.hitCount;
    lm.hitEndless();
    ok('endless hit registers', lm.hitCount === eHits + 1);

    // Render must be pure: background state is advanced only in update().
    const fakeCtx = new Proxy({}, {
        get: (t, p) => (p in t ? t[p] : () => {}),
        set: (t, p, v) => { t[p] = v; return true; }
    });
    const theme = game.getLevelTheme(999);
    const o = lm.bgObjects[0];
    if (o) {
        const yBefore = o.y;
        lm._renderLevelBg(fakeCtx, 960, 640, theme);
        ok('render does not mutate background', o.y === yBefore);
        const yBefore2 = o.y;
        lm._updateLevelBg(1 / 60);
        ok('update advances background', o.y !== yBefore2);
    } else {
        ok('background objects exist', false);
    }
});

// ─────────────────────────────────────────────
suite('GameManager full boot (headless)', () => {
    const mod = loadGameManager();
    ok('Matter.js loaded from vendor', !!mod.Matter);
    ok('PhysicsWorld exported', typeof mod.PhysicsWorld === 'function');

    const canvas = makeFakeCanvas();
    const ctx = makeFakeCtx(canvas);
    const gm = new mod.GameManager(canvas, ctx);
    ok('GameManager constructed', !!gm);

    for (let i = 0; i < 5; i++) { gm.update(1 / 60); gm.render(ctx, 0.5); }
    ok('MENU loop runs without error', true);

    // Jump into level 1 and run frames.
    gm.levels.startLevel(0);
    gm.state.currentState = gm.state.STATES.LEVEL;
    gm.state.transitioning = false;
    for (let i = 0; i < 40; i++) { gm.update(1 / 60); gm.render(ctx, i / 40); }
    ok('LEVEL loop runs, bar bounded',
        gm.levels.barPosition >= -1e-9 && gm.levels.barPosition <= 1 + 1e-9);

    // A Space press that lands inside the zone must register through GameManager.
    gm.levels.timingBar.zone.start = gm.levels.timingBar.position;
    gm.levels.timingBar.zone.end = gm.levels.timingBar.position + 0.05;
    gm.levels._syncZone();
    const before = gm.levels.hitCount;
    gm.state.handleKey({ code: 'Space', preventDefault: () => {} });
    ok('Space reaches LevelManager.hit', gm.levels.hitCount === before + 1);

    // Endless boot.
    gm.levels.startEndless();
    gm.state.currentState = gm.state.STATES.ENDLESS;
    for (let i = 0; i < 20; i++) { gm.update(1 / 60); gm.render(ctx, 0); }
    ok('ENDLESS loop runs without error', true);

    // PhysicsWorld + Matter skeleton.
    const world = new mod.PhysicsWorld({ gravity: 1 });
    const body = mod.Matter.Bodies.rectangle(0, 0, 10, 10);
    world.addBody(body);
    world.step(1 / 60);
    world.removeBody(body);
    world.clear();
    ok('PhysicsWorld steps Matter bodies', true);
});

// ─────────────────────────────────────────────
suite('All 6 levels are completable (auto-play)', () => {
    const game = loadLevelManager();
    for (let idx = 0; idx < 6; idx++) {
        const lm = new game.LevelManager();
        lm.levels.forEach(l => { l.unlocked = true; });
        lm.startLevel(idx);

        let frames = 0;
        const limit = 60 * 180; // 3 minutes of game time @60Hz
        while (!lm.levelComplete && !lm.levelFailed && frames < limit) {
            lm.update(1 / 60);
            const z = lm.timingBar.zone;
            const pos = lm.timingBar.position;
            if (pos >= z.start && pos <= z.end) lm.hit();
            frames++;
        }

        ok('level ' + (idx + 1) + ' completes',
            lm.levelComplete === true,
            'failed=' + lm.levelFailed + ' hits=' + lm.hitCount + '/' + lm.currentLevel.requiredHits +
            ' frames=' + frames);
    }
});

// ─────────────────────────────────────────────
suite('Render interpolation freeze (NODE CLEANED jitter fix)', () => {
    const game = loadLevelManager();
    const lm = new game.LevelManager();
    lm.startLevel(0);

    const runningA = lm._renderPos(0.1);
    const runningB = lm._renderPos(0.9);
    ok('running bar DOES interpolate', runningA !== runningB);

    // Simulate completion: update is skipped, bar must render frozen.
    lm.levelComplete = true;
    const a = lm._renderPos(0.0);
    const b = lm._renderPos(0.5);
    const c = lm._renderPos(0.999);
    ok('frozen bar does not jitter', a === b && b === c, a + ' ' + b + ' ' + c);

    // Same for failure.
    const lm2 = new game.LevelManager();
    lm2.startLevel(0);
    lm2.levelFailed = true;
    const f1 = lm2._renderPos(0.0);
    const f2 = lm2._renderPos(0.9);
    ok('failed bar does not jitter', f1 === f2, f1 + ' ' + f2);
});

// ─────────────────────────────────────────────
suite('Endless unlock + congratulations flow', () => {
    const mod = loadGameManager();
    const canvas = makeFakeCanvas();
    const ctx = makeFakeCtx(canvas);
    const gm = new mod.GameManager(canvas, ctx);
    const lm = gm.levels;

    // First five nodes done; the sixth is about to be completed.
    lm.levels.forEach((l, i) => { l.unlocked = true; l.completed = i < 5; });
    lm.startLevel(5);
    lm.score = 4321;
    lm.currentLevel.bestScore = 0;
    lm._onComplete();

    ok('justUnlockedEndless set on final completion', lm.justUnlockedEndless === true);
    ok('all nodes completed', lm.isAllCompleted() === true);

    // Re-completing must not trigger the celebration again.
    lm._onComplete();
    ok('does not re-trigger once unlocked', lm.justUnlockedEndless === false);

    // The congrats screen renders and closing it opens the leaderboard path.
    gm._renderCongrats(ctx);
    ok('_renderCongrats runs without error', true);

    gm.state.transitioning = false;
    gm.leaderboard.configurationError = null; // configured
    gm.leaderboard.profile = null;            // no operator name yet
    gm._finishCongrats();
    ok('closing congrats routes to profile setup / hub',
        gm.state.pendingState === gm.state.STATES.PROFILE_SETUP ||
        gm.state.pendingState === gm.state.STATES.HUB,
        'pending=' + gm.state.pendingState);

    // With a profile present, closing goes straight to the hub.
    gm.state.transitioning = false;
    gm.leaderboard.profile = { id: 'x', displayName: 'OP' };
    gm._finishCongrats();
    ok('with profile routes to HUB', gm.state.pendingState === gm.state.STATES.HUB);
});

// ─────────────────────────────────────────────
console.log('\n' + '─'.repeat(50));
console.log(`PASS ${passed}   FAIL ${failed}`);
if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log('  ✗ ' + f);
    process.exit(1);
}
console.log('All tests passed.');
