/* =========================================
   tests/run.js — Zero-dependency test runner
   Run: node tests/run.js
   ========================================= */

'use strict';

const { loadModules, loadLevelManager, loadGameManager, makeRng, makeFakeCanvas, makeFakeCtx } = require('./harness');

const api = loadModules();
const { Utils, Collision, TimingBarMechanic, GameLoop, ChallengeGate, DualRingMechanic, PacketPurgeMechanic, EnergySystem } = api;

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
    const world = new mod.PhysicsWorld({ gravity: 1000 });
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
        if (!lm.isBarLevel(idx)) continue; // node 5 is the physics mission
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
suite('EnergySystem — max 6 & addEnergy (regen untouched)', () => {
    const e = new EnergySystem();
    ok('max energy is 6', e.maxEnergy === 6);
    ok('starts full', e.currentEnergy === 6);

    e.currentEnergy = 5;
    const gained = e.addEnergy(3);
    ok('addEnergy clamps to cap', e.currentEnergy === 6 && gained === 1);

    e.currentEnergy = 2;
    ok('addEnergy grants full when room', e.addEnergy(3) === 3 && e.currentEnergy === 5);
    ok('addEnergy ignores non-positive', e.addEnergy(0) === 0 && e.addEnergy(-4) === 0);

    // Time-based regen must be independent of addEnergy.
    e.currentEnergy = 1;
    e.regenTimer = 10;
    e.addEnergy(2);
    ok('addEnergy does not touch regenTimer', e.regenTimer === 10);
    e.update(5);
    ok('regen still advances', e.regenTimer === 15);
    e.regenTimer = e.regenInterval - 1;
    e.update(2);
    ok('regen grants +1 and wraps', e.currentEnergy === 4 && e.regenTimer < e.regenInterval);
});

// ─────────────────────────────────────────────
suite('ChallengeGate — attempt windows', () => {
    const WINDOW = 5 * 60 * 1000;
    const t0 = 2_000_000;
    const g = new ChallengeGate('test_gate');
    g._stamps = [];

    ok('starts with 2 attempts', g.remaining(WINDOW, 2, t0) === 2);
    g.record(WINDOW, t0);
    ok('one used', g.attemptsUsed(WINDOW, t0 + 1) === 1);
    g.record(WINDOW, t0 + 1000);
    ok('two used, cannot attempt', !g.canAttempt(WINDOW, 2, t0 + 1000));
    ok('reset waits for the oldest to age out',
        Math.round(g.timeUntilReset(WINDOW, 2, t0 + 1000)) === (WINDOW - 1000) / 1000);

    // Once the first attempt ages out, an attempt is available again.
    ok('window rolls over', g.canAttempt(WINDOW, 2, t0 + WINDOW + 1));
});

// ─────────────────────────────────────────────
suite('DualRingMechanic — energy-scaled difficulty & multi-round', () => {
    // Lower energy → faster (harder), and always playable.
    const full = new DualRingMechanic({ maxEnergy: 6, currentEnergy: 6 });
    const empty = new DualRingMechanic({ maxEnergy: 6, currentEnergy: 0 });
    ok('low energy is faster', empty.speed > full.speed);
    ok('speed stays playable', empty.speed <= 205 && full.speed >= 100);
    ok('requires multiple rounds', full.rounds === 3);

    const ring = new DualRingMechanic({ maxEnergy: 6, currentEnergy: 3 });
    ring.init();
    ok('t=0 is not an instant win', !ring.evaluate(0).success);

    // Markers start +/-135deg around the target, so alignment is always
    // reached after 135 / speed regardless of where the target sits. Speed
    // is re-rolled every round, so recompute per round.
    const target0 = ring.targetAngle;
    const alignAt = () => ring.roundStart + 135 / ring.speed;

    // Round 1
    ring.time = alignAt();
    ring.handleConfirm();
    ok('round 1 accepted, run continues', ring.round === 1 && ring.result === null);
    ok('target moves to a new position each round', ring.targetAngle !== target0);
    ok('markers reset away from the new target', !ring.evaluate(ring.roundStart).success);
    ok('round speed stays playable', ring.speed >= 100 && ring.speed <= 215);

    // Round 2
    ring.time = alignAt();
    ring.handleConfirm();
    ok('round 2 accepted, run continues', ring.round === 2 && ring.result === null);

    // Round 3 completes the run with a bounded reward.
    ring.time = alignAt();
    ring.handleConfirm();
    ok('all rounds → success', ring.result === 'success');
    ok('reward within 1..3', ring.reward >= 1 && ring.reward <= 3);

    // A misaligned press ends the run.
    const ring2 = new DualRingMechanic({ maxEnergy: 6, currentEnergy: 3 });
    ring2.init();
    ring2.time = (135 / ring2.speed) + (360 / ring2.speed) / 2;
    ring2.handleConfirm();
    ok('misaligned press fails the run', ring2.result === 'fail');

    // Tolerance boundary counts as success (inclusive).
    const ring3 = new DualRingMechanic({ maxEnergy: 6, currentEnergy: 3 });
    ring3.init();
    ok('tolerance boundary is success', ring3.evaluate((135 - ring3.tolerance) / ring3.speed).success);

    // Per-round speed varies around the energy-based base.
    const dr = new DualRingMechanic({ maxEnergy: 6, currentEnergy: 3, rng: makeRng(9) });
    dr.init();
    const picks = [];
    for (let i = 0; i < 20; i++) picks.push(dr._pickRoundSpeed());
    ok('round speeds are variable', Math.min.apply(null, picks) !== Math.max.apply(null, picks));
    ok('round speeds stay playable', Math.min.apply(null, picks) >= 100 && Math.max.apply(null, picks) <= 215);
});

// ─────────────────────────────────────────────
suite('PacketPurgeMechanic — two waves, infected are faster', () => {
    function make(seed) {
        const rng = makeRng(seed);
        const m = new PacketPurgeMechanic({ rng });
        m.init({ width: 960, height: 640 });
        return m;
    }
    const m = make(7);
    ok('two waves configured', m.waves === 2);
    ok('infected packets are faster than clean ones', m.badSpeed > m.goodSpeed);
    ok('speeds within a fair band', m.badSpeed >= 120 && m.badSpeed <= 165 && m.goodSpeed >= 70 && m.goodSpeed <= 95);
    ok('field computed at init', m.field.w > 0 && m.field.h > 0);

    // Clicking a bad packet clears it.
    m.packets = [{ id: 1, x: 300, y: 300, w: 46, h: 30, bad: true, speed: 150, dead: false }];
    m.handlePointer(300, 300, 'down');
    ok('bad packet cleared', m.hits === 1 && m.packets.length === 0);

    // Clicking a clean packet costs health.
    m.packets = [{ id: 2, x: 300, y: 300, w: 46, h: 30, bad: false, speed: 80, dead: false }];
    const hp = m.health;
    m.handlePointer(300, 300, 'down');
    ok('clean packet is a mistake', m.health === hp - 1);

    // Missing a bad packet (reaching the core) costs health too.
    const m2 = make(11);
    m2.packets = [{ id: 3, x: m2.field.x + m2.field.w - 5, y: 300, w: 46, h: 30, bad: true, speed: 300, dead: false }];
    m2.update(1);
    ok('leaked bad packet costs health', m2.health === 2);

    // Surviving both waves succeeds.
    const m3 = make(3);
    m3.packets = [];
    m3.phaseTimer = m3.waveDuration;
    m3.update(0.001);
    ok('wave 1 ends into the breach break', m3.phase === 'break');
    m3.phaseTimer = m3.breakDuration;
    m3.update(0.001);
    ok('wave 2 begins', m3.wave === 2 && m3.phase === 'spawn');
    m3.phaseTimer = m3.waveDuration;
    m3.update(0.001);
    ok('surviving both waves succeeds', m3.result === 'success');

    // Losing all health fails.
    const m4 = make(5);
    m4.health = 1;
    m4.packets = [{ id: 4, x: m4.field.x + m4.field.w - 5, y: 300, w: 46, h: 30, bad: true, speed: 300, dead: false }];
    m4.update(1);
    ok('zero health fails the purge', m4.result === 'fail');
});

// ─────────────────────────────────────────────
suite('LevelManager — ACT II gate & revives', () => {
    const game = loadLevelManager();
    const lm = new game.LevelManager();
    lm.levels.forEach(l => { l.unlocked = false; l.completed = false; });
    lm.levels[0].unlocked = true;
    lm.group2Unlocked = false;

    ok('ACT II starts locked', !lm.levels[3].unlocked && !lm.levels[4].unlocked && !lm.levels[5].unlocked);
    ok('ACT I not complete initially', !lm.isActOneComplete());

    // Simulate ACT I being nearly cleared.
    lm.levels[0].completed = true;
    lm.levels[1].completed = true;
    lm.currentLevelIndex = 2;
    lm.currentLevel = lm.levels[2];
    lm.score = 100;
    lm._onComplete();
    ok('completing ACT I does not unlock level 4', !lm.levels[3].unlocked);
    ok('ACT I is now complete', lm.isActOneComplete());

    lm.unlockGroup2();
    ok('gate opens level 4 ONLY', lm.levels[3].unlocked && !lm.levels[4].unlocked && !lm.levels[5].unlocked);

    // Sequential progression continues inside ACT II.
    lm.currentLevelIndex = 3;
    lm.currentLevel = lm.levels[3];
    lm.score = 200;
    lm._onComplete();
    ok('completing 4 unlocks 5 (not 6)', lm.levels[4].unlocked && !lm.levels[5].unlocked);

    lm.currentLevelIndex = 4;
    lm.currentLevel = lm.levels[4];
    lm.score = 300;
    lm._onComplete();
    ok('completing 5 unlocks 6', lm.levels[5].unlocked);

    lm.startLevel(0);
    ok('revives reset per level', lm.revivesUsed === 0 && lm.maxRevives === 2);
});

// ─────────────────────────────────────────────
suite('HUB redesign + generic MINIGAME host', () => {
    const mod = loadGameManager();
    const canvas = makeFakeCanvas();
    const ctx = makeFakeCtx(canvas);
    const gm = new mod.GameManager(canvas, ctx);

    // ACT I cleared, ACT II still gated.
    gm.levels.levels.forEach(l => { l.unlocked = false; l.completed = false; });
    gm.levels.levels[0].unlocked = true;
    gm.levels.group2Unlocked = false;
    gm.levels.levels.forEach((l, i) => { if (i < 3) { l.unlocked = true; l.completed = true; } });

    gm.state.currentState = gm.state.STATES.HUB;
    gm.state.transitioning = false;
    gm._buildHubButtons();
    gm._pickEnergyEggCell();

    ok('ACT II cards start locked', gm.levels.levels[3].unlocked === false);
    ok('6 level cards registered', gm.ui.buttons.filter(b => b.card).length === 6);
    const gate = gm.ui.buttons.find(b => b.id === 'packet-purge');
    ok('gate node exists while locked', !!gate);

    // HUB renders (panels, gate node, cards, energy bar) without error.
    gm.render(ctx, 0);
    ok('HUB render runs', true);

    // Hidden energy easter egg starts Dual Ring.
    gm.energy.currentEnergy = 4;
    gm._pickEnergyEggCell();
    const cell = gm.ui.getEnergyCellRect(gm._energyEggCell, gm.energy.maxEnergy);
    ok('egg cell rect valid', !!cell);
    gm.state.transitioning = false;
    const handled = gm._hitTestUI(cell.x + 2, cell.y + 2);
    ok('clicking hidden energy cell starts Dual Ring', handled === true);
    ok('Dual Ring state queued', gm.state.pendingState === gm.state.STATES.MINIGAME);

    // Clicking the gate node starts Packet Purge (ACT I is cleared here).
    gm.state.currentState = gm.state.STATES.HUB;
    gm.state.transitioning = false;
    gm.state.pendingState = null;
    const gy = gm._hubLockY;
    const handledGate = gm._hitTestUI(canvas.width / 2, gy);
    ok('clicking the gate starts Packet Purge', handledGate === true);
    ok('Packet Purge state queued', gm.state.pendingState === gm.state.STATES.MINIGAME);
    const pending = gm.state.pendingContext;
    ok('Packet Purge mechanic provided', pending && pending.mechanic);

    // Run the MINIGAME host to completion and confirm the gate opens level 4 only.
    gm.state.pendingState = null;
    gm.state.transitioning = false;
    gm.state.change(gm.state.STATES.MINIGAME, pending);
    for (let i = 0; i < 20; i++) { gm.update(1 / 60); gm.render(ctx, 0); }
    ok('minigame became active', !!gm._activeMinigame);
    if (gm._activeMinigame) gm._activeMinigame.result = 'success';
    for (let i = 0; i < 120; i++) { gm.update(1 / 60); gm.render(ctx, 0); }
    ok('Packet Purge success unlocks ACT II gate', gm.levels.isGroup2Unlocked() === true);
    ok('gate opens level 4 only, 5/6 stay sequential',
        gm.levels.levels[3].unlocked === true &&
        gm.levels.levels[4].unlocked === false &&
        gm.levels.levels[5].unlocked === false);
});

// ─────────────────────────────────────────────
suite('Packet Purge gate is blocked before ACT I is cleared', () => {
    const mod = loadGameManager();
    const canvas = makeFakeCanvas();
    const ctx = makeFakeCtx(canvas);
    const gm = new mod.GameManager(canvas, ctx);

    gm.levels.levels.forEach((l, i) => { l.unlocked = i === 0; l.completed = false; });
    gm.levels.group2Unlocked = false;
    gm.state.currentState = gm.state.STATES.HUB;
    gm.state.transitioning = false;
    gm.state.pendingState = null;

    gm._tryStartPacketPurge();
    ok('gate does not start before ACT I', gm.state.pendingState !== gm.state.STATES.MINIGAME);
    ok('a helpful message is shown', !!gm._hubMessage);
});

// ─────────────────────────────────────────────
suite('LevelManager — sequential self-heal', () => {
    const game = loadLevelManager();
    const lm = new game.LevelManager();

    // Stale save from the earlier "unlock all at once" build.
    lm.levels.forEach(l => { l.completed = false; l.unlocked = true; });
    lm.group2Unlocked = false;
    lm._enforceSequentialUnlocks();
    ok('stale save: only level 1 stays open',
        lm.levels[0].unlocked && !lm.levels[1].unlocked && !lm.levels[3].unlocked && !lm.levels[5].unlocked);

    lm.levels[0].completed = true;
    lm._enforceSequentialUnlocks();
    ok('level 2 opens after 1 is completed',
        lm.levels[1].unlocked && !lm.levels[2].unlocked);

    lm.levels[1].completed = true;
    lm.levels[2].completed = true;
    lm.group2Unlocked = true;
    lm._enforceSequentialUnlocks();
    ok('gate + ACT I completion opens level 4 only',
        lm.levels[3].unlocked && !lm.levels[4].unlocked && !lm.levels[5].unlocked);
});

// ─────────────────────────────────────────────
suite('Bar speed is normalized across levels', () => {
    const game = loadLevelManager();
    const lm = new game.LevelManager();
    const barLevels = lm.levels.filter((l, i) => lm.isBarLevel(i));
    const speeds = barLevels.map(l => l.barSpeed);

    let monotonic = true;
    for (let i = 1; i < speeds.length; i++) if (speeds[i] <= speeds[i - 1]) monotonic = false;
    ok('base speeds strictly increase', monotonic, speeds.join(', '));

    // Even the hardest level must stay readable on a 60 Hz screen.
    for (let i = 0; i < barLevels.length; i++) {
        const lvl = barLevels[i];
        const maxSpeed = Math.min(lvl.barSpeed + 0.01 * lvl.requiredHits, 1.9);
        const zoneTimeMs = (lvl.targetSize / maxSpeed) * 1000;
        ok(`level ${lvl.id} zone window playable`, zoneTimeMs >= 40,
            `${zoneTimeMs.toFixed(1)}ms maxSpeed=${maxSpeed.toFixed(2)}`);
    }

    // The hardest level is meaningfully tamer than the old 2.0/3.5 curve.
    const last = lm.levels[5];
    ok('level 6 final speed is bounded',
        Math.min(last.barSpeed + 0.01 * last.requiredHits, 1.9) <= 1.7);
});

// ─────────────────────────────────────────────
suite('Input sampling aligns with the rendered bar', () => {
    const mod = loadGameManager();
    const canvas = makeFakeCanvas();
    const ctx = makeFakeCtx(canvas);
    const gm = new mod.GameManager(canvas, ctx);

    // Capture the wall time at the END of state.update (the sim frontier).
    let wallAtStateEnd = 0;
    const origUpdate = gm.state.update.bind(gm.state);
    gm.state.update = (dt) => { origUpdate(dt); wallAtStateEnd = performance.now(); };

    gm.levels.levels[5].unlocked = true; // unlock the hardest level for the test
    gm.levels.startLevel(5); // hardest level
    gm.state.currentState = gm.state.STATES.LEVEL;
    gm.state.transitioning = false;
    gm.update(1 / 60);

    ok('sim-time anchor captured AFTER the update',
        gm._lastSimWall >= wallAtStateEnd,
        `anchor=${gm._lastSimWall} frontier=${wallAtStateEnd}`);

    // A press exactly at the frontier has zero offset and matches the render.
    ok('zero offset at the frontier', gm._computeInputOffset(gm._lastSimWall) === 0);
    const rendered = gm.levels._renderPos(0);
    const pressed = gm.levels.timingBar.sample(gm._computeInputOffset(gm._lastSimWall));
    ok('press at frontier matches rendered position', Math.abs(rendered - pressed) < 1e-12);

    // Pressing a hair after the frontier must still land where it looks.
    const pos = gm.levels.timingBar.position;
    gm.levels.timingBar.zone.start = pos - 0.04;
    gm.levels.timingBar.zone.end = pos + 0.04;
    gm.levels._syncZone();
    const before = gm.levels.hitCount;
    gm._dispatchKey({ code: 'Space', timestamp: gm._lastSimWall + 1 });
    ok('press just after the frontier registers', gm.levels.hitCount === before + 1,
        'hits=' + gm.levels.hitCount);

    // A line visually on the zone boundary must count as inside (inclusive).
    const pos2 = gm.levels.timingBar.position;
    gm.levels.timingBar.zone.start = pos2;
    gm.levels.timingBar.zone.end = pos2 + 0.08;
    gm.levels._syncZone();
    const before2 = gm.levels.hitCount;
    gm._dispatchKey({ code: 'Space', timestamp: gm._lastSimWall });
    ok('boundary press is a hit, not a miss', gm.levels.hitCount === before2 + 1);
});

// ─────────────────────────────────────────────
suite('GAME OVER restart cooldown', () => {
    const mod = loadGameManager();
    const canvas = makeFakeCanvas();
    const ctx = makeFakeCtx(canvas);
    const gm = new mod.GameManager(canvas, ctx);
    const handler = gm.state._handlers[gm.state.STATES.GAME_OVER];

    gm.state.currentState = gm.state.STATES.GAME_OVER;
    gm.state.transitioning = false;
    gm.state.pendingState = null;
    handler.enter({ levelIndex: 0, score: 0, revivesUsed: 0 });

    ok('cooldown starts at 1s', Math.abs(gm._goCooldown - 1.0) < 1e-9);

    // Space during the cooldown must not restart.
    handler.onKey({ code: 'Space' });
    ok('Space is blocked during cooldown', gm.state.pendingState === null);

    // The RETRY button is disabled and shows the countdown.
    const retry = gm.ui.buttons.find(b => b.id === 'retry');
    ok('retry button disabled during cooldown', retry && retry.disabled === true);
    ok('retry button shows the countdown', retry && /RETRY \(\d\.\ds\)/.test(retry.label));

    // Tick the cooldown down.
    for (let i = 0; i < 70; i++) handler.update(1 / 60);
    ok('cooldown expires', gm._goCooldown === 0);
    ok('retry button re-enabled', retry && retry.disabled === false && retry.label === '↻ RETRY');

    // Now Space restarts.
    gm.state.pendingState = null;
    handler.onKey({ code: 'Space' });
    ok('Space restarts after cooldown', gm.state.pendingState === gm.state.STATES.LEVEL);
});

// ─────────────────────────────────────────────
suite('Sound mute toggle + HUB button', () => {
    const mod = loadGameManager();
    const s = mod.Sound;

    s.setMuted(false);
    ok('sound starts unmuted', !s.isMuted());
    ok('toggle mutes', s.toggleMute() === true && s.isMuted());
    ok('toggle unmutes', s.toggleMute() === false && !s.isMuted());

    const canvas = makeFakeCanvas();
    const ctx = makeFakeCtx(canvas);
    const gm = new mod.GameManager(canvas, ctx);
    gm._buildHubButtons();

    const btn = gm.ui.buttons.find(b => b.id === 'sound');
    ok('HUB has a sound button', !!btn);
    ok('sound button is compact', btn.w <= 60 && btn.h <= 40);

    s.setMuted(false);
    gm._updateSoundButton();
    ok('button reflects unmuted', btn.muted === false);

    s.setMuted(true);
    gm._updateSoundButton();
    ok('button reflects muted', btn.muted === true);

    s.setMuted(false);
    gm._updateSoundButton();
});

// ─────────────────────────────────────────────
suite('PhysicsWorld — fixed step, units, interpolation, events', () => {
    const mod = loadGameManager();
    const { PhysicsWorld, Matter: M } = mod;

    // Free fall in px/s^2: after 1 s, v ≈ g and y ≈ g/2 (semi-implicit Verlet).
    const w = new PhysicsWorld({ gravity: 1000 });
    const ball = w.addBody(M.Bodies.circle(0, 0, 5, { frictionAir: 0 }));
    for (let i = 0; i < 60; i++) w.step(1 / 60);
    ok('60 fixed steps for 1 s at 1/60', w.steps === 60);
    ok('gravity is px/s^2 (velocity)', Math.abs(w.getVelocity(ball).y - 1000) < 20,
        'vy=' + w.getVelocity(ball).y.toFixed(1));
    ok('gravity is px/s^2 (distance)', Math.abs(ball.position.y - 500) < 20,
        'y=' + ball.position.y.toFixed(1));

    // Velocity round-trip in px/s.
    w.setVelocity(ball, 240, -120);
    const v = w.getVelocity(ball);
    ok('setVelocity/getVelocity round-trip', Math.abs(v.x - 240) < 1e-6 && Math.abs(v.y + 120) < 1e-6);
    ok('speedOf in px/s', Math.abs(w.speedOf(ball) - Math.hypot(240, 120)) < 1e-6);
    w.destroy();

    // Frame-rate independence: 144 Hz and 30 Hz callers produce the exact
    // same fixed steps and therefore the exact same state.
    const simulate = (dt, seconds) => {
        const ww = new PhysicsWorld({ gravity: 1000 });
        const ground = ww.addBody(M.Bodies.rectangle(0, 300, 800, 20, { isStatic: true }));
        const box = ww.addBody(M.Bodies.rectangle(-30, 0, 40, 40));
        ww.setVelocity(box, 90, 0);
        const frames = Math.round(seconds / dt);
        for (let i = 0; i < frames; i++) ww.step(dt);
        const out = { steps: ww.steps, x: box.position.x, y: box.position.y, a: box.angle };
        ww.removeBody(ground);
        ww.destroy();
        return out;
    };
    const a60 = simulate(1 / 60, 2), a144 = simulate(1 / 144, 2), a30 = simulate(1 / 30, 2);
    ok('accumulator: 144 Hz -> 120 steps in 2 s', a144.steps === 120, 'steps=' + a144.steps);
    ok('accumulator: 30 Hz -> 120 steps in 2 s', a30.steps === 120, 'steps=' + a30.steps);
    ok('same state at 60 Hz and 144 Hz', a60.x === a144.x && a60.y === a144.y && a60.a === a144.a);
    ok('same state at 60 Hz and 30 Hz', a60.x === a30.x && a60.y === a30.y && a60.a === a30.a);
    ok('step() rejects NaN / negative dt', (() => {
        const ww = new PhysicsWorld();
        const r = ww.step(NaN) + ww.step(-1) + ww.step(Infinity);
        ww.destroy();
        return r === 0;
    })());

    // Interpolation blends previous -> current pose.
    const wi = new PhysicsWorld({ gravity: 1000 });
    const b = wi.addBody(M.Bodies.rectangle(0, 0, 10, 10, { frictionAir: 0 }));
    wi.step(1 / 60);
    const y0 = wi._prev.get(b.id).y, y1 = b.position.y;
    ok('interpolate alpha 0 = previous pose', wi.interpolate(b, 0).y === y0);
    ok('interpolate alpha 1 = current pose', wi.interpolate(b, 1).y === y1);
    ok('interpolate alpha 0.5 = midpoint', approx(wi.interpolate(b, 0.5).y, (y0 + y1) / 2, 1e-9));
    ok('interpolate clamps alpha', wi.interpolate(b, 7).y === y1);
    wi.destroy();

    // Collision events resolve to parent bodies and can be unsubscribed.
    const wc = new PhysicsWorld({ gravity: 1000 });
    const floor = wc.addBody(M.Bodies.rectangle(0, 100, 400, 20, { isStatic: true }));
    const part1 = M.Bodies.rectangle(-10, 0, 20, 20);
    const part2 = M.Bodies.rectangle(10, 0, 20, 20);
    const compound = wc.addBody(M.Body.create({ parts: [part1, part2] }));
    const hits = [];
    const off = wc.onCollision((x, y) => hits.push([x, y]));
    for (let i = 0; i < 60 && !hits.length; i++) wc.step(1 / 60);
    ok('collisionStart fires', hits.length > 0);
    ok('collision reports the parent body', hits.length > 0 &&
        hits.every(([x, y]) => (x === compound || y === compound) && (x === floor || y === floor)));
    off();
    const n = hits.length;
    compound.position.y = 0; M.Body.setPosition(compound, { x: 0, y: 0 });
    for (let i = 0; i < 60; i++) wc.step(1 / 60);
    ok('unsubscribed handler is not called', hits.length === n);
    wc.destroy();
    ok('destroy empties the world', wc.bodies.length === 0);
});

// ─────────────────────────────────────────────
suite('Stack Overflow — physics minigame', () => {
    const mod = loadGameManager();
    const { StackOverflowMechanic } = mod;
    const make = (seed, opts) => {
        const m = new StackOverflowMechanic(Object.assign({ rng: makeRng(seed) }, opts));
        m.init({ width: 960, height: 640 });
        return m;
    };

    // Analytic crane: changing speed never makes it jump.
    const c = make(1);
    for (let i = 0; i < 37; i++) c.update(1 / 60);
    const xBefore = c.craneX(c.time);
    c._setOmega(c.omega * 1.5);
    ok('crane stays continuous across a speed change', approx(c.craneX(c.time), xBefore, 1e-9));

    // The frame drops from exactly where the crane was drawn.
    const d = make(2);
    for (let i = 0; i < 20; i++) d.update(1 / 60);
    const alpha = 0.4;
    const shown = d.craneX(d.renderTime(alpha));
    d.drop(alpha * d.stepDt);
    ok('release point equals the rendered crane position', approx(d.falling.body.position.x, shown, 1e-9));
    ok('release keeps a share of crane momentum',
        approx(d.world.getVelocity(d.falling.body).x, d.craneVX(d.time - d.stepDt + alpha * d.stepDt) * d.momentumKeep, 1e-6));
    ok('cannot drop while a frame is falling', d.drop(0) === false);

    // A bot that aims at the predicted landing point (ballistic: no air drag).
    const play = (seed, aimErr, maxT = 60) => {
        const m = make(seed);
        const r = makeRng(seed + 99);
        let target = m.cx + (r() * 2 - 1) * aimErr;
        let t = 0;
        while (m.result === null && t < maxT) {
            m.update(1 / 60); t += 1 / 60;
            if (m.canDrop) {
                const dist = Math.max(1, m.towerTop() - (m.hookY + m.blockH));
                const T = Math.sqrt(2 * dist / 1100);
                const land = m.craneX(m.time) + m.craneVX(m.time) * m.momentumKeep * T;
                if (Math.abs(land - target) < 3) { m.drop(0); target = m.cx + (r() * 2 - 1) * aimErr; }
            }
        }
        return m;
    };

    let wins = 0, perfect = true;
    for (let s = 1; s <= 8; s++) {
        const m = play(s, 8);
        if (m.result === 'success') wins++;
        if (m.result !== 'success' || m.lost !== 0) perfect = false;
    }
    ok('accurate play (±8 px) always builds a stable tower', wins === 8, wins + '/8');
    ok('accurate play loses no frames', perfect);

    const won = play(1, 0);
    ok('winning tower reaches the limit line', won.hasReachedTarget());
    ok('buried frames are frozen once settled',
        won.placed.slice(0, won.placed.length - won.freezeDepth).every(p => p.body.isStatic));
    ok('top frames stay dynamic',
        won.placed.slice(-won.freezeDepth).every(p => !p.body.isStatic));
    ok('frame budget respected', won.drops <= won.maxDrops);

    // Determinism: the same seed and inputs give the same run.
    const r1 = play(3, 8), r2 = play(3, 8);
    ok('runs are deterministic for a seed',
        r1.result === r2.result && r1.drops === r2.drops && r1.time === r2.time &&
        r1.towerTop() === r2.towerTop());

    // Dropping far off the platform loses frames until the run fails.
    const bad = make(4);
    let t = 0;
    while (bad.result === null && t < 60) {
        bad.update(1 / 60); t += 1 / 60;
        if (bad.canDrop && bad.craneX(bad.time) < bad.cx - bad.craneAmp + 5) bad.drop(0);
    }
    ok('frames dropped off the platform cost lives', bad.lost === bad.maxLives);
    ok('losing every life fails the run', bad.result === 'fail' && bad.score === 0);
    ok('lost frames are removed from the world',
        bad.world.bodies.length === 1 + bad.placed.length + (bad.falling ? 1 : 0));

    // Render runs headless with interpolation.
    const canvas = makeFakeCanvas();
    const rc = make(5);
    rc.update(1 / 60);
    rc.render(makeFakeCtx(canvas), 960, 640, 0, 0.5);
    rc.drop(0);
    for (let i = 0; i < 30; i++) { rc.update(1 / 60); rc.render(makeFakeCtx(canvas), 960, 640, 0, i / 30); }
    ok('render runs with interpolation', true);
});

// ─────────────────────────────────────────────
suite('Mission 5 + 6 tuning', () => {
    const game = loadLevelManager();
    const lm = new game.LevelManager();
    const l5 = lm.levels[4], l6 = lm.levels[5];

    ok('mission 5 is the physics stack mission', l5.mechanic === 'stack' && !lm.isBarLevel(4));
    ok('startLevel refuses the physics mission', (() => { l5.unlocked = true; return lm.startLevel(4) === false; })());
    ok('mission 6 needs 20 hits', l6.requiredHits === 20);
    ok('mission 6 bar is slightly slower', l6.barSpeed === 1.35);
    ok('mission 6 zone matches the old mission 5', l6.targetSize === 0.10);
    l6.unlocked = true;
    lm.startLevel(5);
    ok('mission 6 lives unchanged (5)', lm.maxLives === 5 && lm.lives === 5);
    ok('mission 6 still harder than mission 4',
        l6.barSpeed > lm.levels[3].barSpeed && l6.targetSize < lm.levels[3].targetSize &&
        l6.requiredHits > lm.levels[3].requiredHits);

    // completeExternal follows the normal progression.
    const lm2 = new game.LevelManager();
    lm2.levels.slice(0, 4).forEach(l => { l.completed = true; });
    lm2.group2Unlocked = true;
    lm2._enforceSequentialUnlocks();
    ok('mission 5 unlocks after mission 4', lm2.levels[4].unlocked && !lm2.levels[5].unlocked);
    ok('completeExternal clears mission 5', lm2.completeExternal(4, 1700) && lm2.levels[4].completed);
    ok('completeExternal unlocks mission 6', lm2.levels[5].unlocked);
    ok('completeExternal stores the best score', lm2.levels[4].bestScore === 1700);
    lm2.completeExternal(4, 900);
    ok('a lower score keeps the best', lm2.levels[4].bestScore === 1700);
    const lm3 = new (loadLevelManager().LevelManager)(); // fresh storage
    ok('completeExternal refuses a locked node', lm3.completeExternal(4, 100) === false && !lm3.levels[4].completed);
});

// ─────────────────────────────────────────────
suite('Mission 5 — HUB node + MINIGAME host', () => {
    const mod = loadGameManager();
    const canvas = makeFakeCanvas();
    const ctx = makeFakeCtx(canvas);
    const gm = new mod.GameManager(canvas, ctx);
    const S = gm.state.STATES;
    const ready = (state) => {
        gm.state.currentState = state;
        gm.state.transitioning = false;
        gm.state.pendingState = null;
        gm.state.pendingContext = null;
    };

    gm.levels.levels.slice(0, 4).forEach(l => { l.completed = true; });
    gm.levels.group2Unlocked = true;
    gm.levels._enforceSequentialUnlocks();
    gm.ui.clearButtons();
    gm._buildHubButtons();
    ok('no separate bonus button on the HUB', !gm.ui.buttons.find(b => /stack/i.test(b.id)));

    // Clicking node 5 launches the physics mission.
    ready(S.HUB);
    gm.ui.buttons.find(b => b.id === 'lvl4').onClick();
    ok('node 5 opens the MINIGAME state', gm.state.pendingState === S.MINIGAME);
    const cfg = gm.state.pendingContext;
    ok('node 5 runs StackOverflowMechanic', cfg && cfg.mechanic instanceof mod.StackOverflowMechanic);
    ok('mission hint mentions tapping (mobile)', cfg && /tap/i.test(cfg.hint));

    // Drive the MINIGAME handler with that context.
    const handler = gm.state._handlers[S.MINIGAME];
    ready(S.MINIGAME);
    handler.enter(cfg);
    const mech = cfg.mechanic;
    ok('mechanic initialised by the host', mech.world !== null && mech.hanging !== null);
    for (let i = 0; i < 10; i++) { handler.update(1 / 60); handler.render(ctx, 0.5); }

    gm._pendingInputOffset = 0.25 * mech.stepDt;
    const expected = mech.craneX(mech.time - mech.stepDt + gm._pendingInputOffset);
    handler.onKey({ code: 'Space' });
    gm._pendingInputOffset = 0;
    ok('Space drops a frame via the host', mech.falling !== null);
    ok('host forwards the sub-frame input offset',
        mech.falling && approx(mech.falling.body.position.x, expected, 1e-9));

    // A tap anywhere on the canvas drops (mobile path: hitTestUI -> handlePointer).
    for (let i = 0; i < 120 && !mech.canDrop; i++) handler.update(1 / 60);
    const dropsBefore = mech.drops;
    ok('tap is consumed by the mission', gm._hitTestUI(100, 500) === true);
    ok('tap anywhere drops a frame', mech.drops === dropsBefore + 1);

    // Failure -> GAME_OVER without revive, with its own message.
    ready(S.MINIGAME);
    cfg.onComplete(false, mech);
    ok('failure goes to GAME_OVER', gm.state.pendingState === S.GAME_OVER);
    const go = gm.state.pendingContext;
    ok('no lockpick revive for the physics mission', go.noRevive === true && go.levelIndex === 4);
    const goHandler = gm.state._handlers[S.GAME_OVER];
    ready(S.GAME_OVER);
    goHandler.enter(go);
    ok('no revive button', !gm.ui.buttons.find(b => b.id === 'revive'));
    for (let i = 0; i < 70; i++) goHandler.update(1 / 60);
    goHandler.onKey({ code: 'Space' });
    ok('RETRY restarts the stack mission', gm.state.pendingState === S.MINIGAME &&
        gm.state.pendingContext.mechanic instanceof mod.StackOverflowMechanic);

    // Success -> node cleared, mission 6 unlocked, back to HUB.
    ready(S.MINIGAME);
    cfg.onComplete(true, { score: 1650 });
    ok('success clears node 5', gm.levels.levels[4].completed && gm.levels.levels[4].bestScore === 1650);
    ok('success unlocks node 6', gm.levels.levels[5].unlocked);
    ok('success returns to the HUB', gm.state.pendingState === S.HUB);

    // Escape leaves a minigame.
    ready(S.MINIGAME);
    handler.onKey({ code: 'Escape' });
    ok('Escape leaves the mission', gm.state.pendingState === S.HUB);

    // Node 6 still starts the timing bar.
    ready(S.HUB);
    gm._startNode(5);
    ok('node 6 starts a LEVEL', gm.state.pendingState === S.LEVEL && gm.levels.currentLevelIndex === 5);
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
