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

/** Timing Bar stage config for act `actIdx` (0-based), stage `i`. */
function stageCfg(campaign, actIdx, i) {
    const a = campaign.acts[actIdx];
    return Object.assign({ id: a.themeId, name: a.key + ' · ' + a.stages[i].tier, desc: a.story }, a.stages[i].params);
}

/** Put a GameManager into `state` with no transition pending. */
function settle(gm, state) {
    gm.state.currentState = state;
    gm.state.transitioning = false;
    gm.state.pendingState = null;
    gm.state.pendingContext = null;
}

const pendingSuites = [];

function suite(name, fn) {
    console.log('\n▸ ' + name);
    const r = fn();
    // Async suites (network/DB fakes) are awaited before the summary.
    if (r && typeof r.then === 'function') {
        pendingSuites.push(r.catch((e) => { failed++; failures.push(name + ' — threw: ' + (e && e.stack || e)); }));
    }
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

    // Paused (phone held upright): renders, never simulates, and does not
    // catch up the paused time on resume.
    {
        const { loop, state } = makeLoop();
        loop._frame(0);
        loop._frame(100);
        const before = state.updates, renders = state.renders;
        loop.setPaused(true);
        for (let i = 1; i <= 60; i++) loop._frame(100 + i * 16.7);
        ok('paused loop does not simulate', state.updates === before);
        ok('paused loop keeps rendering', state.renders > renders);
        loop.setPaused(false);
        loop._frame(5000);
        loop._frame(5016.7);
        ok('resume does not catch up the paused time', state.updates - before <= 1, 'updates=' + (state.updates - before));
    }
});

// ─────────────────────────────────────────────
suite('LevelManager integration (smoke)', () => {
    const game = loadLevelManager();
    const lm = new game.LevelManager();

    lm.startStage(stageCfg(game.CAMPAIGN, 0, 0));
    ok('stage started with the act theme', !!lm.currentLevel && lm.currentLevel.id === 3);
    ok('stage lives come from the tier', lm.maxLives === 3 && lm.lives === 3);
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

    // Jump into act 1 stage 1 and run frames.
    gm.levels.startStage(stageCfg(mod.CAMPAIGN, 0, 0));
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
suite('Act 1 stages are completable (auto-play)', () => {
    const game = loadLevelManager();
    const act = game.CAMPAIGN.acts[0];
    for (let i = 0; i < act.stages.length; i++) {
        const lm = new game.LevelManager();
        lm.startStage(stageCfg(game.CAMPAIGN, 0, i));

        let frames = 0;
        const limit = 60 * 180;
        while (!lm.levelComplete && !lm.levelFailed && frames < limit) {
            lm.update(1 / 60);
            const z = lm.timingBar.zone;
            const pos = lm.timingBar.position;
            if (pos >= z.start && pos <= z.end) lm.hit();
            frames++;
        }
        const p = act.stages[i].params;
        ok('act 1 stage ' + (i + 1) + ' completes', lm.levelComplete === true,
            'failed=' + lm.levelFailed + ' hits=' + lm.hitCount + '/' + p.requiredHits + ' frames=' + frames);
        // A human needs slack: the bot must finish well inside the timer.
        ok('act 1 stage ' + (i + 1) + ' leaves time to spare', frames / 60 < p.maxTime * 0.75,
            (frames / 60).toFixed(1) + 's of ' + p.maxTime + 's');
    }
});

// ─────────────────────────────────────────────
suite('Render interpolation freeze (NODE CLEANED jitter fix)', () => {
    const game = loadLevelManager();
    const lm = new game.LevelManager();
    lm.startStage(stageCfg(game.CAMPAIGN, 0, 0));

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
    lm2.startStage(stageCfg(game.CAMPAIGN, 0, 0));
    lm2.levelFailed = true;
    const f1 = lm2._renderPos(0.0);
    const f2 = lm2._renderPos(0.9);
    ok('failed bar does not jitter', f1 === f2, f1 + ' ' + f2);
});

// ─────────────────────────────────────────────
suite('Congratulations screen flow', () => {
    const mod = loadGameManager();
    const canvas = makeFakeCanvas();
    const ctx = makeFakeCtx(canvas);
    const gm = new mod.GameManager(canvas, ctx);

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

    gm.state.transitioning = false;
    gm.leaderboard.profile = { id: 'x', displayName: 'OP' };
    gm._finishCongrats();
    ok('with profile routes to HUB', gm.state.pendingState === gm.state.STATES.HUB);

    const handler = gm.state._handlers[gm.state.STATES.CONGRATS];
    settle(gm, gm.state.STATES.CONGRATS);
    handler.enter();
    ok('opening congrats marks it seen', gm.progress.congratsSeen === true);
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
suite('Campaign data — acts, stages, tuning', () => {
    const { CAMPAIGN } = loadGameManager();
    const acts = CAMPAIGN.acts;
    ok('10 acts', acts.length === 10);
    ok('act names follow the story',
        acts.map(a => a.key).join(',') === 'REMOVE_MALWARE,REBUILD_FIREWALL,CLOSE_PORTS,RESET_CREDS,TRACE_LOGS,CUT_ACCESS,DEFUSE_PAYLOAD,RESTORE_CORE,FINAL_AUDIT,RETURN_CONTROL');
    ok('final act is 10 (in development)', CAMPAIGN.finalAct === 10 && acts[9].available === false);
    ok('8 gates (one between every pair of acts)', CAMPAIGN.gates.length === 8);
    ok('available acts have 3-5 stages', acts.filter(a => a.available)
        .every(a => a.stages.length >= 3 && a.stages.length <= CAMPAIGN.maxStages));
    ok('acts 6-9 are in development', acts.slice(5).every(a => !a.available && a.stages.length === 0));
    const themes = loadLevelManager().LEVEL_THEMES;
    ok('every act has its own theme', acts.every(a => !!themes[a.themeId]) &&
        new Set(acts.map(a => a.themeId)).size === acts.length);

    const a1 = acts[0];
    ok('act 1 is the Timing Bar with 4 stages', a1.game === 'timingbar' && a1.stages.length === 4);
    ok('act 1 hits are 8/10/14/18', a1.stages.map(s => s.params.requiredHits).join('/') === '8/10/14/18');
    const sp = a1.stages.map(s => s.params.barSpeed);
    ok('act 1 bar speed rises', sp.every((v, i) => i === 0 || v > sp[i - 1]), sp.join(', '));
    for (const st of a1.stages) {
        const p = st.params;
        const maxSpeed = Math.min(p.barSpeed + 0.01 * p.requiredHits, 1.9);
        const zoneTimeMs = (p.targetSize / maxSpeed) * 1000;
        ok(`act 1 ${st.tier} zone window playable`, zoneTimeMs >= 40, zoneTimeMs.toFixed(1) + 'ms');
    }

    const a2 = acts[1];
    ok('act 2 is Stack Overflow with 3 stages', a2.game === 'stack' && a2.stages.length === 3);
    ok('act 2 heights are 5/7/9', a2.stages.map(s => s.params.targetBlocks).join('/') === '5/7/9');
    const om = a2.stages.map(s => s.params.baseOmega);
    ok('act 2 crane speed rises in micro steps',
        om.every((v, i) => i === 0 || (v > om[i - 1] && v - om[i - 1] <= 0.1 + 1e-9)), om.join(', '));
    ok('act 2 budget is height + 5', a2.stages.every(s => s.params.maxDrops === s.params.targetBlocks + 5));

    ok('gate 1 is the original Packet Purge', CAMPAIGN.gates[0].waves === 2 && CAMPAIGN.gates[0].speedScale === 1);
    const gs = CAMPAIGN.gates.map(g => g.speedScale);
    ok('gates get harder', gs.every((v, i) => i === 0 || v > gs[i - 1]));
});

// ─────────────────────────────────────────────
suite('CampaignProgress — lock rules', () => {
    const mod = loadGameManager();
    const P = new mod.CampaignProgress(mod.CAMPAIGN, mod.storage);

    ok('act 1 open, act 2 locked', P.isActUnlocked(1) && !P.isActUnlocked(2));
    ok('act 1 stage 1 open, stage 2 locked', P.isStageUnlocked(1, 0) && !P.isStageUnlocked(1, 1));
    ok('dev acts are never unlocked', !P.isActUnlocked(6) && !P.isActAvailable(6));
    ok('locked stage cannot be completed', P.completeStage(1, 1, 100).actCompleted === false && !P.isStageCompleted(1, 1));

    for (let i = 0; i < 3; i++) P.completeStage(1, i, 100 * (i + 1));
    ok('3 of 4 stages: act not complete', !P.isActComplete(1) && P.stagesDone(1) === 3);
    ok('gate not playable yet', !P.isGatePlayable(1));
    const r = P.completeStage(1, 3, 900);
    ok('last stage completes the act', r.actCompleted === true && P.isActComplete(1));
    ok('gate 1 playable after act 1', P.isGatePlayable(1) && !P.isActUnlocked(2));
    ok('replay does not re-report completion', P.completeStage(1, 3, 50).actCompleted === false);
    ok('best score kept on a worse replay', P.stage(1, 3).best === 900);

    P.openGate(1);
    ok('gate opens act 2', P.isActUnlocked(2) && P.isStageUnlocked(2, 0) && !P.isGatePlayable(1));
    for (let i = 0; i < 3; i++) P.completeStage(2, i, 10);
    ok('act 2 complete', P.isActComplete(2));
    ok('gate 2 playable once act 2 is done (act 3 exists)', P.isGatePlayable(2) && !P.isActUnlocked(3));
    P.openGate(2);
    ok('gate 2 opens act 3', P.isActUnlocked(3) && P.isStageUnlocked(3, 0));
    for (let i = 0; i < 4; i++) P.completeStage(3, i, 10);
    ok('gate 3 playable once act 3 is done (act 4 exists)', P.isActComplete(3) && P.isGatePlayable(3));
    P.openGate(3);
    for (let i = 0; i < 5; i++) P.completeStage(4, i, 10);
    ok('gate 4 playable once act 4 is done (act 5 exists)', P.isActComplete(4) && P.isGatePlayable(4));
    P.openGate(4);
    for (let i = 0; i < 3; i++) P.completeStage(5, i, 10);
    ok('gate 5 not playable while act 6 is in development', P.isActComplete(5) && !P.isGatePlayable(5));
    ok('endless still locked (act 6 not done)', !P.isEndlessUnlocked());
    ok('current act points at the last open act', P.currentActId() === 5);

    // Persistence round-trip.
    const P2 = new mod.CampaignProgress(mod.CAMPAIGN, mod.storage);
    ok('progress persists', P2.isActComplete(1) && P2.isGateOpen(1) && P2.stage(1, 3).best === 900);

    P2.reset();
    ok('reset clears everything', !P2.isActComplete(1) && !P2.isGateOpen(1));

    // Endless rule against a fully available fake campaign.
    const fake = JSON.parse(JSON.stringify(mod.CAMPAIGN));
    fake.acts.forEach(a => { a.available = true; if (!a.stages.length) a.stages = [{ tier: 'EASY', params: {} }, { tier: 'NORMAL', params: {} }, { tier: 'HARD', params: {} }]; });
    const F = new mod.CampaignProgress(fake, { getItem: () => null, setItem: () => {} });
    for (const a of fake.acts) {
        if (a.id > 1) F.openGate(a.id - 1);
        let last = null;
        for (let i = 0; i < a.stages.length; i++) last = F.completeStage(a.id, i, 1);
        if (a.id < fake.finalAct) ok(`endless locked after act ${a.id}`, !F.isEndlessUnlocked() && !last.endlessUnlocked);
        else ok(`act ${fake.finalAct} (final) unlocks endless`, F.isEndlessUnlocked() && last.endlessUnlocked === true);
    }
    ok('campaign complete', F.isCampaignComplete());
});

// ─────────────────────────────────────────────
suite('CampaignProgress — legacy save migration', () => {
    const legacy = (doneIds, extra = {}) => Object.assign({
        sb_progress: JSON.stringify([1, 2, 3, 4, 5, 6].map(id => ({
            id, unlocked: true, completed: doneIds.indexOf(id) >= 0, bestScore: id * 100
        })))
    }, extra);

    const migrate = (store) => {
        const mod = loadGameManager(store);
        return { mod, P: new mod.CampaignProgress(mod.CAMPAIGN, mod.storage) };
    };

    let { P } = migrate({});
    ok('fresh install: nothing done', P.stagesDone(1) === 0 && !P.isGateOpen(1) && !P.isEndlessUnlocked());

    ({ P } = migrate(legacy([1, 2])));
    ok('old 1-2 -> act 1 stages 1-2', P.isStageCompleted(1, 0) && P.isStageCompleted(1, 1) && !P.isStageCompleted(1, 2));
    ok('best scores carried', P.stage(1, 0).best === 100 && P.stage(1, 1).best === 200);

    ({ P } = migrate(legacy([1, 2, 3])));
    ok('old ACT I -> act 1 stages 1-3, stage 4 open', P.stagesDone(1) === 3 && P.isStageUnlocked(1, 3) && !P.isActComplete(1));

    ({ P } = migrate(legacy([1, 2, 3], { sb_group2_unlocked: '1' })));
    ok('old gate -> gate 1 open, act 2 reachable', P.isGateOpen(1) && P.isActUnlocked(2) && P.isStageUnlocked(2, 0));

    ({ P } = migrate(legacy([1, 2, 3, 4, 5], { sb_group2_unlocked: '1' })));
    ok('old 4-5 -> act 2 stages 1-2', P.isStageCompleted(2, 0) && P.isStageCompleted(2, 1) && !P.isStageCompleted(2, 2));
    ok('old 4/5 bests land on act 2 stages 1/2', P.stage(2, 0).best === 400 && P.stage(2, 1).best === 500);
    ok('endless not granted without all 6', !P.isEndlessUnlocked());

    const all = legacy([1, 2, 3, 4, 5, 6], { sb_group2_unlocked: '1', sb_congrats_seen: '1' });
    let m;
    ({ mod: m, P } = migrate(all));
    ok('all 6 old nodes -> act 2 complete', P.isActComplete(2));
    ok('all 6 old nodes keep Endless', P.isEndlessUnlocked());
    ok('congrats seen carried', P.congratsSeen === true);

    // Idempotent: a second boot reads the new key and changes nothing.
    const snap = JSON.stringify(P.data);
    const again = new m.CampaignProgress(m.CAMPAIGN, m.storage);
    ok('migration is idempotent', JSON.stringify(again.data) === snap);
    m.storage.setItem('sb_progress', '[]');
    const later = new m.CampaignProgress(m.CAMPAIGN, m.storage);
    ok('legacy keys are not re-read once migrated', later.isEndlessUnlocked() && later.isActComplete(2));

    ({ P } = migrate({ sb_progress: '{broken' }));
    ok('corrupt legacy save starts fresh', P.stagesDone(1) === 0);
});

// ─────────────────────────────────────────────
suite('Act map HUB + gates', () => {
    const mod = loadGameManager();
    const canvas = makeFakeCanvas();
    const ctx = makeFakeCtx(canvas);
    const gm = new mod.GameManager(canvas, ctx);
    const S = gm.state.STATES;

    settle(gm, S.HUB);
    gm.state._handlers[S.HUB].enter();
    const btn = (id) => gm.ui.buttons.find(b => b.id === id);
    // Carousel: the focused act in the centre, neighbours peeking, a rail on top.
    ok('carousel starts on the current act', gm._mapIndex === 0 && !!btn('act1') && !!btn('act2') && !btn('act3'));
    ok('no previous chevron on act 1', !btn('map-prev') && !!btn('map-next'));
    ok('rail has a node per act', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].every(n => !!btn('rail' + n)));
    ok('Endless node at the end of the rail', !!btn('rail-endless') && btn('rail-endless').x > btn('rail10').x &&
        btn('rail-endless').y === btn('rail10').y);
    btn('rail-endless').onClick();
    ok('locked Endless node explains itself', gm.state.pendingState === null && /Complete ACT 10/.test(gm._hubMessage));
    gm.progress.data.endlessUnlocked = true;
    btn('rail-endless').onClick();
    ok('unlocked Endless node moves the carousel to the Endless slot', gm._mapIndex === 10 && !!btn('endless-card'));
    gm.progress.data.endlessUnlocked = false;
    gm._mapGo(0);
    settle(gm, S.HUB);
    ok('gate next to the focused act', !!btn('gate1') && btn('gate1').w >= 44 && btn('gate1').h >= 44);
    const overlap = (a, b) => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
    const noClash = () => {
        const all = gm.ui.buttons;
        for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
            if (overlap(all[i], all[j])) return all[i].id + '/' + all[j].id;
        }
        return null;
    };
    const inside = () => gm.ui.buttons.every(b => b.x - b.w / 2 >= 0 && b.x + b.w / 2 <= 960 && b.y - b.h / 2 >= 0 && b.y + b.h / 2 <= 640);
    ok('no HUB tap targets overlap (act 1)', noClash() === null, noClash());
    ok('all HUB tap targets inside the canvas (act 1)', inside());
    gm._mapGo(4);
    ok('no HUB tap targets overlap (middle act)', noClash() === null, noClash());
    ok('all HUB tap targets inside the canvas (middle act)', inside());
    ok('both chevrons in the middle', !!btn('map-prev') && !!btn('map-next') && !!btn('gate4') && !!btn('gate5'));
    gm._mapGo(9);
    ok('no next chevron on the last act', !btn('map-next') && !!btn('map-prev'));
    ok('no Endless or leaderboard on the HUB for a new player', !btn('endless') && !btn('leaderboard') && !btn('endless-card') &&
        gm._mapCount() === 10);

    // Rail node jumps; side card scrolls; chevron scrolls.
    btn('rail1').onClick();
    ok('rail node jumps to its act', gm._mapIndex === 0);
    btn('act2').onClick();
    ok('tapping the side card scrolls to it', gm._mapIndex === 1);
    btn('map-prev').onClick();
    ok('chevron scrolls back', gm._mapIndex === 0);

    for (let i = 0; i < 30; i++) gm.update(1 / 60);
    ok('scroll eases onto the focused act', Math.abs(gm._mapScroll - gm._mapIndex) < 0.01);
    gm.render(ctx, 0);
    ok('HUB render runs', true);

    // Wheel scrolls with a cooldown.
    gm._handleWheel(40);
    gm._handleWheel(40);
    ok('wheel scrolls one act per notch', gm._mapIndex === 1);
    gm._wheelCooldown = 0;
    gm._handleWheel(-40);
    ok('wheel scrolls back', gm._mapIndex === 0);

    // Dev act and locked act give a message instead of opening.
    settle(gm, S.HUB);
    gm._mapGo(5);
    btn('act6').onClick();
    ok('dev act shows a message', gm.state.pendingState === null && /development/.test(gm._hubMessage));
    gm._mapGo(1);
    btn('act2').onClick();
    ok('locked act shows a message', gm.state.pendingState === null && /gate 1/i.test(gm._hubMessage));
    gm._mapGo(0);
    btn('act1').onClick();
    ok('open act goes to the ACT screen', gm.state.pendingState === S.ACT && gm.state.pendingContext.actId === 1);

    // Gate before the act is cleared.
    settle(gm, S.HUB);
    gm._tryStartGate(1);
    ok('gate blocked until act 1 is complete', gm.state.pendingState === null && /ACT 1/.test(gm._hubMessage));

    // Clear act 1, breach gate 1 through the MINIGAME host.
    for (let i = 0; i < 4; i++) gm.progress.completeStage(1, i, 100);
    settle(gm, S.HUB);
    gm._hitTestUI(btn('gate1').x, btn('gate1').y);
    ok('gate click starts Packet Purge', gm.state.pendingState === S.MINIGAME);
    const pending = gm.state.pendingContext;
    ok('gate 1 uses the original tuning', pending.mechanic.waves === 2 && pending.mechanic.speedScale === 1);
    settle(gm, S.HUB);
    gm.state.change(S.MINIGAME, pending);
    for (let i = 0; i < 20; i++) { gm.update(1 / 60); gm.render(ctx, 0); }
    ok('gate minigame active', !!gm._activeMinigame);
    if (gm._activeMinigame) gm._activeMinigame.result = 'success';
    for (let i = 0; i < 120; i++) { gm.update(1 / 60); gm.render(ctx, 0); }
    ok('gate success opens act 2', gm.progress.isGateOpen(1) && gm.progress.isActUnlocked(2));

    // Gate 2 now opens act 3; gate 3 waits while act 4 is in development.
    for (let i = 0; i < 3; i++) gm.progress.completeStage(2, i, 100);
    settle(gm, S.HUB);
    gm._tryStartGate(2);
    ok('gate 2 starts once act 2 is done', gm.state.pendingState === S.MINIGAME &&
        gm.state.pendingContext.mechanic.speedScale === mod.CAMPAIGN.gates[1].speedScale);
    gm.progress.openGate(2);
    for (let i = 0; i < 4; i++) gm.progress.completeStage(3, i, 100);
    gm.progress.openGate(3);
    for (let i = 0; i < 5; i++) gm.progress.completeStage(4, i, 100);
    gm.progress.openGate(4);
    for (let i = 0; i < 3; i++) gm.progress.completeStage(5, i, 100);
    settle(gm, S.HUB);
    gm._tryStartGate(5);
    ok('gate 5 waits for act 6', gm.state.pendingState === null && /development/.test(gm._hubMessage));

    // Hidden energy easter egg still starts Dual Ring.
    settle(gm, S.HUB);
    gm.ui.clearButtons();
    gm._buildActMapButtons();
    gm.energy.currentEnergy = 4;
    gm._pickEnergyEggCell();
    const cell = gm.ui.getEnergyCellRect(gm._energyEggCell, gm.energy.maxEnergy);
    ok('clicking hidden energy cell starts Dual Ring', gm._hitTestUI(cell.x + 2, cell.y + 2) === true &&
        gm.state.pendingState === S.MINIGAME);

    // Packet Purge gate tiers scale speeds (same RNG -> scaled values).
    const a = new mod.PacketPurgeMechanic({ rng: makeRng(5) });
    const b = new mod.PacketPurgeMechanic({ rng: makeRng(5), speedScale: 1.25, waves: 3 });
    a.init({}); b.init({});
    ok('harder gate: faster packets', approx(b.badSpeed, a.badSpeed * 1.25, 1e-9) && approx(b.goodSpeed, a.goodSpeed * 1.25, 1e-9));
    ok('harder gate: more waves', b.waves === 3);
});

// ─────────────────────────────────────────────
suite('Keyboard navigation of menus', () => {
    const mod = loadGameManager();
    const canvas = makeFakeCanvas();
    const ctx = makeFakeCtx(canvas);
    const gm = new mod.GameManager(canvas, ctx);
    const S = gm.state.STATES;

    settle(gm, S.HUB);
    gm.state._handlers[S.HUB].enter();
    ok('map starts on act 1', gm._mapIndex === 0);
    gm._dispatchKey({ code: 'ArrowRight' });
    ok('ArrowRight scrolls to act 2', gm._mapIndex === 1);
    gm._dispatchKey({ code: 'KeyA' });
    ok('A scrolls back to act 1', gm._mapIndex === 0);
    gm._dispatchKey({ code: 'ArrowLeft' });
    ok('cannot scroll before act 1', gm._mapIndex === 0);
    gm._dispatchKey({ code: 'Enter' });
    ok('Enter opens the focused act', gm.state.pendingState === S.ACT && gm.state.pendingContext.actId === 1);
    settle(gm, S.HUB);
    gm.state._handlers[S.HUB].enter();
    gm._dispatchKey({ code: 'ArrowDown' });
    ok('↓ moves focus to the buttons below', gm.ui.focusId !== null);

    gm.ui.updateMouse(10, 10);
    ok('mouse movement clears keyboard focus', gm.ui.focusId === null);
    settle(gm, S.ACT);
    gm.state._handlers[S.ACT].enter({ actId: 1 });
    gm.ui.updateMouse(10, 10);
    gm._dispatchKey({ code: 'Enter' });
    ok('Enter without focus starts the next stage on the act screen', gm.state.pendingState === S.LEVEL);

    // In gameplay, arrows are NOT eaten by the menu navigation.
    settle(gm, S.LOCKPICK);
    ok('arrows pass through during the lockpick', gm._handleUiNavKey('ArrowUp') === false);
});

// ─────────────────────────────────────────────
suite('Act screen + stage flow', () => {
    const mod = loadGameManager();
    const canvas = makeFakeCanvas();
    const ctx = makeFakeCtx(canvas);
    const gm = new mod.GameManager(canvas, ctx);
    const S = gm.state.STATES;
    const btn = (id) => gm.ui.buttons.find(b => b.id === id);

    settle(gm, S.ACT);
    gm.state._handlers[S.ACT].enter({ actId: 1 });
    ok('act 1 screen has 4 stage cards', [0, 1, 2, 3].every(i => !!btn('stage' + i)) && !btn('stage4'));
    ok('first stage focused', gm.ui.focusId === 'stage0');
    ok('no gate button yet', !btn('gate'));
    gm.render(ctx, 0);
    gm.state._handlers[S.ACT].render(ctx, 0);
    ok('ACT render runs', true);

    settle(gm, S.ACT);
    btn('stage1').onClick();
    ok('locked stage does not start', gm.state.pendingState === null);

    btn('stage0').onClick();
    ok('stage 1 starts the Timing Bar', gm.state.pendingState === S.LEVEL);
    ok('tier params applied', gm.levels.currentLevel.requiredHits === 8 && gm.levels.currentLevel.id === 3);

    // Clear it through the LEVEL handler.
    settle(gm, S.LEVEL);
    gm.levels.levelComplete = true;
    gm._onStageCleared(1234, 0);
    ok('cleared stage recorded', gm.progress.isStageCompleted(1, 0) && gm.progress.stage(1, 0).best === 1234);
    ok('back to the act screen', gm.state.pendingState === S.ACT && gm.state.pendingContext.actId === 1);

    // Failure on a Timing Bar stage offers the lockpick revive at act difficulty.
    settle(gm, S.ACT);
    gm._startStage(1, 1);
    settle(gm, S.LEVEL);
    gm._onStageFailed({ score: 50, revivesUsed: 0 });
    ok('failure goes to GAME_OVER', gm.state.pendingState === S.GAME_OVER);
    const go = gm.state._handlers[S.GAME_OVER];
    const goCtx = gm.state.pendingContext;
    settle(gm, S.GAME_OVER);
    go.enter(goCtx);
    ok('revive offered for the Timing Bar', !!btn('revive'));
    ok('back button returns to the act', !!btn('hub') && btn('hub').label === '← ACT');
    btn('revive').onClick();
    ok('revive opens the lockpick at act difficulty',
        gm.state.pendingState === S.LOCKPICK && gm.state.pendingContext.difficulty === 1);

    // Finish act 1 -> act complete message + gate button on the act screen.
    for (let i = 1; i < 3; i++) gm.progress.completeStage(1, i, 100);
    gm._stage = { actId: 1, index: 3 };
    settle(gm, S.LEVEL);
    gm._onStageCleared(500, 0);
    ok('act complete message', /ACT 1 COMPLETE/.test(gm._hubMessage));
    settle(gm, S.ACT);
    gm.ui.clearButtons();
    gm.state._handlers[S.ACT].enter({ actId: 1 });
    ok('gate button on the cleared act', !!btn('gate'));
    ok('gate button focused once all stages are done', gm.ui.focusId === 'gate');

    // Act 2 stage runs Stack Overflow with the tier params.
    gm.progress.openGate(1);
    settle(gm, S.ACT);
    gm._startStage(2, 0);
    ok('act 2 runs in the MINIGAME host', gm.state.pendingState === S.MINIGAME);
    const cfg = gm.state.pendingContext;
    const mech = cfg.mechanic;
    ok('act 2 stage 1 is Stack Overflow EASY',
        mech instanceof mod.StackOverflowMechanic && mech.targetBlocks === 5 && mech.baseOmega === 1.30);
    ok('first stack stage shows the faint controls hint', cfg.footHint && /tap/i.test(cfg.footHint.touch) && /SPACE/.test(cfg.footHint.desktop));

    // Host forwards the sub-frame offset; a tap anywhere drops.
    const host = gm.state._handlers[S.MINIGAME];
    settle(gm, S.MINIGAME);
    host.enter(cfg);
    for (let i = 0; i < 10; i++) { host.update(1 / 60); host.render(ctx, 0.5); }
    gm._pendingInputOffset = 0.25 * mech.stepDt;
    const expected = mech.craneX(mech.time - mech.stepDt + gm._pendingInputOffset);
    host.onKey({ code: 'Space' });
    gm._pendingInputOffset = 0;
    ok('host forwards the sub-frame input offset',
        mech.falling && approx(mech.falling.body.position.x, expected, 1e-9));
    for (let i = 0; i < 120 && !mech.canDrop; i++) host.update(1 / 60);
    const drops = mech.drops;
    ok('tap anywhere drops', gm._hitTestUI(100, 500) === true && mech.drops === drops + 1);

    // Stack failure: no revive, own message, RETRY restarts the stage.
    settle(gm, S.MINIGAME);
    cfg.onComplete(false, mech);
    const fail = gm.state.pendingContext;
    ok('stack failure has no revive', gm.state.pendingState === S.GAME_OVER && fail.noRevive === true && /firewall/i.test(fail.message));
    settle(gm, S.GAME_OVER);
    go.enter(fail);
    ok('no revive button for the stack', !btn('revive'));
    for (let i = 0; i < 70; i++) go.update(1 / 60);
    go.onKey({ code: 'Space' });
    ok('RETRY restarts the same stack stage',
        gm.state.pendingState === S.MINIGAME && gm.state.pendingContext.mechanic.targetBlocks === 5);

    // Escape asks first; LEAVE returns to the act.
    settle(gm, S.MINIGAME);
    host.enter(cfg);
    host.onKey({ code: 'Escape' });
    ok('Escape opens the pause panel, not an instant exit', !!gm._quit && gm._quit.mode === 'pause' && gm.state.pendingState === null);
    gm.ui.buttons.find(b => b.id === 'pause-leave').onClick();
    ok('LEAVE asks first', gm._quit && gm._quit.mode === 'leave' && gm.state.pendingState === null);
    gm.ui.buttons.find(b => b.id === 'quit-leave').onClick();
    ok('LEAVE returns to the act screen', !gm._quit && gm.state.pendingState === S.ACT && gm.state.pendingContext.actId === 2);

    // Stack success records the stage.
    settle(gm, S.MINIGAME);
    gm._stage = { actId: 2, index: 0 };
    cfg.onComplete(true, { score: 1650 });
    ok('stack success records the stage', gm.progress.isStageCompleted(2, 0) && gm.progress.stage(2, 0).best === 1650);
});

// ─────────────────────────────────────────────
suite('Lockpick — revive-only tuning', () => {
    const mod = loadGameManager();
    const lp = new mod.LockpickSystem();
    const want = [[3, 60, 30], [4, 75, 27], [4, 90, 24], [5, 105, 21], [5, 125, 18], [6, 150, 16]];
    let okAll = true;
    for (let d = 1; d <= 6; d++) {
        lp.start(d, () => {});
        const [n, sp, tol] = want[d - 1];
        if (lp.nodeCount !== n || lp.cursorSpeed !== sp || lp.hitTolerance !== tol) okAll = false;
    }
    ok('lockpick table matches the plan', okAll);
    lp.start(1, () => {});
    ok('nodes generated', lp.nodes.length === 3);
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

    gm.levels.startStage(stageCfg(mod.CAMPAIGN, 0, 3)); // hardest stage
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
    gm._stage = { actId: 1, index: 0 };
    handler.enter({ stage: gm._stage, score: 0, revivesUsed: 0 });

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
    gm._buildActMapButtons();

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
suite('LeaderboardService — operator name + password', () => {
    const { LeaderboardService } = loadGameManager();
    const V = LeaderboardService;
    ok('valid name', V.validateName('Neo_01') === null);
    ok('short name rejected', V.validateName('ab') !== null);
    ok('bad characters rejected', V.validateName('neo!') !== null);
    ok('8-char password ok', V.validatePassword('abcdefgh') === null);
    ok('7-char password rejected', V.validatePassword('abcdefg') !== null);
    ok('over 72 bytes rejected', V.validatePassword('x'.repeat(73)) !== null);
    ok('duplicate -> taken', /taken/.test(V.friendlyError({ message: 'duplicate key value violates unique constraint' })));
    ok('rate limit message', /15 minutes/.test(V.friendlyError({ message: 'Too many attempts. Try again in 15 minutes' })));

    // Fake Supabase client: records RPC calls and returns scripted rows.
    const calls = [];
    const script = {};
    const fakeClient = {
        auth: {
            getSession: async () => ({ data: { session: { id: 's' } }, error: null }),
            getUser: async () => ({ data: { user: { id: 'u1' } }, error: null })
        },
        rpc: async (name, args) => { calls.push([name, args]); return script[name] ? script[name](args) : { data: null, error: null }; },
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { display_name: 'Legacy' }, error: null }) }) }) })
    };
    const make = () => { const lb = new LeaderboardService(); lb.client = fakeClient; return lb; };
    const run = async () => {
        const lb = make();
        script.get_my_operator = () => ({ data: [], error: null });
        await lb.loadProfile();
        ok('no operator yet', lb.profile === null && !lb.hasProfile());

        script.create_operator = (a) => ({ data: [{ id: 'p1', display_name: a.p_display_name, has_password: true }], error: null });
        await lb.createProfile('  Neo  ', 'hunter2222');
        ok('createProfile sends trimmed name + password',
            calls.some(([n, a]) => n === 'create_operator' && a.p_display_name === 'Neo' && a.p_password === 'hunter2222'));
        ok('created profile is protected', lb.profile.displayName === 'Neo' && !lb.needsPassword());

        let threw = null;
        try { await make().createProfile('Neo', 'short'); } catch (e) { threw = e.message; }
        ok('short password never reaches the server', /8–72/.test(threw || ''));

        const other = make();
        script.sign_in_operator = (a) => ({ data: a.p_password === 'hunter2222' ? [{ id: 'p1', display_name: 'Neo', has_password: true }] : [], error: null });
        ok('wrong password -> null', (await other.signIn('neo', 'nope-nope')) === null && other.profile === null);
        const p = await other.signIn('neo', 'hunter2222');
        ok('right password -> same operator', p && p.id === 'p1' && other.profile.displayName === 'Neo');

        const legacy = make();
        script.get_my_operator = () => ({ data: [{ id: 'u1', display_name: 'Oldie', has_password: false }], error: null });
        await legacy.loadProfile();
        ok('legacy operator needs a password', legacy.needsPassword());
        await legacy.setPassword('oldiepass1');
        ok('setPassword clears the prompt', !legacy.needsPassword() &&
            calls.some(([n, a]) => n === 'set_operator_password' && a.p_password === 'oldiepass1'));

        // Database not migrated yet: fall back to the old profile lookup.
        const old = make();
        script.get_my_operator = () => ({ data: null, error: { message: 'Could not find the function public.get_my_operator without parameters' } });
        await old.loadProfile();
        ok('falls back before the migration', old.profile && old.profile.displayName === 'Legacy' && !old.needsPassword());
    };
    return run();
});

// ─────────────────────────────────────────────
suite('Profile setup flow (overlay form)', () => {
    const mod = loadGameManager();
    const canvas = makeFakeCanvas();
    const ctx = makeFakeCtx(canvas);
    const gm = new mod.GameManager(canvas, ctx);
    const S = gm.state.STATES;
    ok('no DOM form in headless tests', gm.profileForm === null);

    const opened = [];
    gm.profileForm = { mode: null, open(m, h) { this.mode = m; this.h = h; opened.push(m); }, close() { this.closed = true; } };
    gm.leaderboard.configurationError = null;

    const run = async () => {
        // New player -> create form.
        gm.leaderboard.initialize = async () => null;
        gm.leaderboard.profile = null;
        settle(gm, S.PROFILE_SETUP);
        gm.state._handlers[S.PROFILE_SETUP].enter({ returnState: S.LEADERBOARD });
        await new Promise(r => setTimeout(r, 0));
        ok('new player gets the create form', opened[opened.length - 1] === 'create');

        gm.leaderboard.createProfile = async () => { throw new Error('duplicate key value violates unique constraint'); };
        const err = await gm._submitProfileForm('create', { name: 'Neo', password: 'hunter2222' });
        ok('taken name is reported in the form', /taken/.test(err) && gm.state.pendingState === null);

        gm.leaderboard.signIn = async () => null;
        ok('wrong sign-in is reported', /incorrect/.test(await gm._submitProfileForm('signin', { name: 'Neo', password: 'x' })));
        gm.leaderboard.signIn = async () => ({ id: 'p1', displayName: 'Neo', hasPassword: true });
        ok('good sign-in succeeds', (await gm._submitProfileForm('signin', { name: 'Neo', password: 'hunter2222' })) === null);
        ok('sign-in returns to the leaderboard', gm.state.pendingState === S.LEADERBOARD && gm.profileForm.closed);

        // Legacy operator -> secure form; "later" is remembered this session.
        gm.leaderboard.profile = { id: 'u', displayName: 'Oldie', hasPassword: false };
        gm.leaderboard.initialize = async () => gm.leaderboard.profile;
        settle(gm, S.PROFILE_SETUP);
        gm.state._handlers[S.PROFILE_SETUP].enter({ returnState: S.LEADERBOARD, mode: 'secure' });
        await new Promise(r => setTimeout(r, 0));
        ok('legacy operator gets the secure form', opened[opened.length - 1] === 'secure');
        settle(gm, S.PROFILE_SETUP);
        gm.profileForm.h.onCancel();
        ok('LATER dismisses the prompt for the session', gm._securePromptDismissed === true);

        // Protected operator -> no form at all.
        gm.leaderboard.profile = { id: 'p1', displayName: 'Neo', hasPassword: true };
        const before = opened.length;
        settle(gm, S.PROFILE_SETUP);
        gm.state._handlers[S.PROFILE_SETUP].enter({ returnState: S.HUB });
        await new Promise(r => setTimeout(r, 0));
        ok('protected operator skips the form', opened.length === before && gm.state.pendingState === S.HUB);

        gm.state._handlers[S.PROFILE_SETUP].render(ctx, 0);
        ok('profile screen renders', true);
    };
    return run();
});

// ─────────────────────────────────────────────
suite('Tip bar + field guide', () => {
    const mod = loadGameManager();
    const canvas = makeFakeCanvas();
    const ctx = makeFakeCtx(canvas);
    const gm = new mod.GameManager(canvas, ctx);
    const S = gm.state.STATES;
    const { TipBar } = mod;

    const tb = new TipBar();
    tb.setTips('x', [{ desktop: 'Press H', touch: 'Tap ?' }, 'second']);
    ok('desktop variant', tb.current('desktop') === 'Press H');
    ok('touch variant', tb.current('touch') === 'Tap ?');
    ok('starts faded in from 0', tb.alpha === 0);
    tb.update(3);
    ok('fully visible mid-slot', tb.alpha === 1);
    tb.update(4.1);
    ok('rotates after the hold time', tb.current('desktop') === 'second');
    tb.setTips('x', ['ignored']);
    ok('same key keeps rotating', tb.current('desktop') === 'second');

    settle(gm, S.HUB);
    gm.state._handlers[S.HUB].enter();
    ok('map tips on the HUB', gm.tipBar.key === 'map');
    ok('guide button on the map', !!gm.ui.buttons.find(b => b.id === 'guide'));
    gm.render(ctx, 0);
    ok('HUB renders the tip line', true);

    settle(gm, S.ACT);
    gm.state._handlers[S.ACT].enter({ actId: 2 });
    ok('act tips follow the game', gm.tipBar.key === 'act2' && gm.tipBar.tips.some(t => /momentum/.test(t)));
    ok('guide button on the act screen', !!gm.ui.buttons.find(b => b.id === 'guide'));

    // H opens the guide from the act screen and returns there.
    settle(gm, S.ACT);
    gm.state._handlers[S.ACT].onKey({ code: 'KeyH' });
    ok('H opens the guide', gm.state.pendingState === S.GUIDE);
    const gctx = gm.state.pendingContext;
    ok('guide remembers the act', gctx.returnState === S.ACT && gctx.returnContext.actId === 2);
    ok('guide not seen before', gm._guideSeen === false);
    const guide = gm.state._handlers[S.GUIDE];
    settle(gm, S.GUIDE);
    guide.enter(gctx);
    ok('opening marks the guide seen', gm._guideSeen === true && mod.storage.getItem('sb_guide_seen') === '1');
    const pages = mod.GameManager.GUIDE_PAGES.length;
    for (let i = 0; i < pages; i++) { gm._setGuidePage(i); guide.render(ctx, 0); }
    ok('every guide page renders', true);
    gm._setGuidePage(0);
    guide.onKey({ code: 'ArrowLeft' });
    ok('pages wrap around', gm._guidePage === pages - 1);
    ok('4 tabs + prev/close/next', gm.ui.buttons.filter(b => /^guide-/.test(b.id)).length === pages + 3);
    settle(gm, S.GUIDE);
    guide.onKey({ code: 'Escape' });
    ok('Esc returns to the same act', gm.state.pendingState === S.ACT && gm.state.pendingContext.actId === 2);
});

// ─────────────────────────────────────────────
suite('Typing in a form field is not gameplay', () => {
    const mod = loadGameManager();
    const canvas = makeFakeCanvas();
    const ctx = makeFakeCtx(canvas);
    const gm = new mod.GameManager(canvas, ctx);
    const seen = [];
    gm._handleKeyAction = (a) => seen.push(a.code);
    let prevented = 0;
    const ev = (tagName, code) => ({ code, key: ' ', repeat: false, timeStamp: 1, target: { tagName }, preventDefault: () => { prevented++; } });

    mod.fireDocument('keydown', ev('INPUT', 'Space'));
    ok('keys typed into an input are ignored', seen.length === 0 && prevented === 0);
    mod.fireDocument('keydown', ev('BODY', 'Space'));
    ok('keys on the page still reach the game', seen.length === 1 && prevented === 1);
    ok('keyboard switches hints to desktop', gm.input.mode === 'desktop');
});

// ─────────────────────────────────────────────
suite('Leave prompt in every game + first-stage hint', () => {
    const mod = loadGameManager();
    const canvas = makeFakeCanvas();
    const ctx = makeFakeCtx(canvas);
    const gm = new mod.GameManager(canvas, ctx);
    const S = gm.state.STATES;
    const btn = (id) => gm.ui.buttons.find(b => b.id === id);
    const enter = (state, c) => { settle(gm, state); gm.state._handlers[state].enter(c); };

    // MENU badge
    const texts = [];
    const spyCtx = makeFakeCtx(canvas);
    spyCtx.fillText = (t) => { texts.push(String(t)); return spyCtx; };
    gm.state._handlers[S.MENU].render(spyCtx, 0);
    ok('menu badge says v3', texts.indexOf('(v3)') >= 0 && texts.indexOf('(v2)') < 0);
    ok('menu footer: v3.0 written by dormhi', texts.indexOf('v3.0 · Written by dormhi') >= 0);
    ok('menu footer: no beta line', !texts.some(t => /beta/i.test(t)));
    ok('menu footer: birlikterutin credits kept',
        texts.indexOf('thanks for birlikterutin family') >= 0 && texts.indexOf('alpyso and ezgyso') >= 0);

    // Timing Bar stage: ⏸ button, pause panel, warnings, restart.
    gm._startStage(1, 0);
    enter(S.LEVEL);
    ok('⏸ button in the Timing Bar', !!btn('pause'));
    ok('⏸ is a comfortable tap target', btn('pause').w >= 56 && btn('pause').h >= 44);
    const t0 = gm.levels.timer;
    btn('pause').onClick();
    ok('⏸ opens the PAUSED panel', !!gm._quit && gm._quit.mode === 'pause' &&
        !!btn('pause-resume') && !!btn('pause-restart') && !!btn('pause-leave'));
    ok('RESUME is focused by default', gm.ui.focusId === 'pause-resume');
    for (let i = 0; i < 30; i++) gm.update(1 / 60);
    ok('game is paused under the panel', gm.levels.timer === t0);
    const hits = gm.levels.hitCount, lives = gm.levels.lives;
    gm._dispatchKey({ code: 'Space' });
    ok('Space does nothing while paused', gm.levels.hitCount === hits && gm.levels.lives === lives);
    ok('taps outside the panel are swallowed', gm._hitTestUI(5, 5) === true);
    gm.render(ctx, 0.5);
    ok('pause panel renders', true);
    gm._dispatchKey({ code: 'Enter' });
    ok('Enter on RESUME continues', !gm._quit && !!btn('pause') && gm.state.pendingState === null);
    for (let i = 0; i < 6; i++) gm.update(1 / 60);
    ok('game resumes', gm.levels.timer < t0);

    // Esc walks the same panel: open -> resume; warning -> back to panel.
    gm._dispatchKey({ code: 'Escape' });
    ok('Esc opens the panel', gm._quit && gm._quit.mode === 'pause');
    gm._dispatchKey({ code: 'Escape' });
    ok('Esc again resumes', !gm._quit);
    btn('pause').onClick();
    btn('pause-leave').onClick();
    ok('LEAVE shows a warning with STAY focused', gm._quit.mode === 'leave' && gm.ui.focusId === 'quit-stay');
    gm.render(ctx, 0.5);
    gm._dispatchKey({ code: 'Escape' });
    ok('Esc from the warning returns to the panel', gm._quit && gm._quit.mode === 'pause');
    btn('pause-restart').onClick();
    ok('RESTART shows a warning too', gm._quit.mode === 'restart' && !!btn('quit-restart') && gm.ui.focusId === 'quit-stay');
    btn('quit-stay').onClick();
    ok('CANCEL goes back to the panel', gm._quit && gm._quit.mode === 'pause');
    btn('pause-restart').onClick();
    btn('quit-restart').onClick();
    ok('confirmed RESTART starts the same stage again', !gm._quit && gm.state.pendingState === S.LEVEL &&
        gm._stage.actId === 1 && gm._stage.index === 0);
    enter(S.LEVEL);
    btn('pause').onClick();
    btn('pause-leave').onClick();
    gm._dispatchKey({ code: 'ArrowRight' });
    gm._dispatchKey({ code: 'Enter' });
    ok('→ + Enter on the warning leaves to the act', gm.state.pendingState === S.ACT && gm.state.pendingContext.actId === 1);

    // First-stage hint only on stage 1 of an act.
    const seen = [];
    const hintCtx = makeFakeCtx(canvas);
    hintCtx.fillText = (t) => { seen.push(String(t)); return hintCtx; };
    gm._stage = { actId: 1, index: 0 };
    gm._renderStageHint(hintCtx, 960, 600);
    ok('hint on the first stage', seen.some(t => /SPACE when the marker/.test(t)));
    seen.length = 0;
    gm._stage = { actId: 1, index: 1 };
    gm._renderStageHint(hintCtx, 960, 600);
    ok('no hint on later stages', seen.length === 0);
    gm.input.mode = 'touch';
    gm._stage = { actId: 1, index: 0 };
    gm._renderStageHint(hintCtx, 960, 600);
    ok('touch players get the tap wording', seen.some(t => /^Tap anywhere/.test(t)));
    gm.input.mode = 'desktop';

    // Stack stage 2 has no hint; gates go back to the map.
    gm.progress.data.stages[1].forEach(x => { x.completed = true; });
    gm.progress.openGate(1);
    gm.progress.completeStage(2, 0, 10);
    settle(gm, S.ACT);
    gm._startStage(2, 1);
    ok('later stack stage has no hint', gm.state.pendingContext.footHint === null);

    for (let i = 0; i < 4; i++) gm.progress.completeStage(1, i, 10);
    gm.progress.data.gates = [];
    settle(gm, S.HUB);
    gm._tryStartGate(1);
    enter(S.MINIGAME, gm.state.pendingContext);
    ok('⏸ button on the gate', !!btn('pause'));
    btn('pause').onClick();
    ok('no RESTART on a gate (each try spends an attempt)', !btn('pause-restart') && !!btn('pause-leave'));
    btn('pause-leave').onClick();
    ok('gate prompt warns the attempt counts', /attempt will still count/.test(gm._quit.cfg.detail));
    btn('quit-leave').onClick();
    ok('leaving a gate returns to the map', gm.state.pendingState === S.HUB);

    // Lockpick revive: leaving goes back to the act.
    gm._stage = { actId: 1, index: 0 };
    enter(S.LOCKPICK, { reason: 'revive', difficulty: 1, score: 10 });
    ok('⏸ button in the code breaker', !!btn('pause'));
    gm._dispatchKey({ code: 'ArrowUp' });
    ok('arrows still drive the code breaker', gm.lockpick.started === true && !gm._quit);
    gm._dispatchKey({ code: 'Escape' });
    ok('no RESTART in the code breaker', !btn('pause-restart'));
    btn('pause-leave').onClick();
    btn('quit-leave').onClick();
    ok('aborting recovery returns to the act', gm.state.pendingState === S.ACT);

    // Endless: leaving ends the run but keeps the score.
    enter(S.ENDLESS);
    gm.levels.score = 1234;
    gm._dispatchKey({ code: 'Escape' });
    ok('no RESTART in Endless (the run score counts)', !btn('pause-restart'));
    btn('pause-leave').onClick();
    btn('quit-leave').onClick();
    ok('leaving Endless goes to the results with the score',
        gm.state.pendingState === S.ENDLESS_OVER && gm.state.pendingContext.score === 1234 && gm.state.pendingContext.noRevive === true);
});

// ─────────────────────────────────────────────
suite('Orbital Shield (Act 3) — rules, fairness, controls', () => {
    const mod = loadGameManager();
    const { OrbitalShieldMechanic, CAMPAIGN } = mod;
    const act = CAMPAIGN.acts[2];
    ok('act 3 is Orbital Shield with 4 stages', act.available && act.game === 'orbital' && act.stages.length === 4);
    ok('ports 4/6/8/8', act.stages.map(x => x.params.ports).join('/') === '4/6/8/8');
    ok('packets to block 12/16/20/20', act.stages.map(x => x.params.blocksNeeded).join('/') === '12/16/20/20');
    const h = act.stages[2].params, vh = act.stages[3].params;
    const strip = (o) => JSON.stringify(Object.assign({}, o, { switchChance: undefined, lives: undefined, speed: undefined }));
    ok('very hard = hard + hopping packets (+1 life)', strip(h) === strip(vh) && !h.switchChance && vh.switchChance > 0);
    ok('very hard packets are slightly slower than hard', vh.speed < h.speed && vh.speed >= h.speed * 0.85);
    ok('lives 4/5/6/7', act.stages.map(x => x.params.lives).join('/') === '4/5/6/7');
    ok('only very hard hops', act.stages.slice(0, 3).every(x => !x.params.switchChance));

    const make = (i, seed) => {
        const m = new OrbitalShieldMechanic(Object.assign({ rng: makeRng(seed) }, act.stages[i].params));
        m.init({ width: 960, height: 640 });
        return m;
    };

    // Controls
    const c = make(0, 1);
    c.handleKey('ArrowRight');
    ok('→ moves one port clockwise', c.shieldPort === 1);
    c.handleKey('KeyA'); c.handleKey('KeyA');
    ok('A moves back and wraps', c.shieldPort === 3);
    const p2 = c.portAngle(2);
    c.handlePointer(c.cx + Math.cos(p2) * 200, c.cy + Math.sin(p2) * 200, 'down');
    ok('tap snaps to the nearest port', c.shieldPort === 2);
    c.handlePointer(c.cx + 3, c.cy + 3, 'down');
    ok('tap on the core does nothing', c.shieldPort === 2);

    // Fairness: every arrival leaves time to walk the shield from the
    // previous packet's port.
    for (let i = 0; i < 4; i++) {
        const m = make(i, 7 + i);
        const plan = [];
        for (let k = 0; k < 120; k++) m._planNext();
        let prev = { finalPort: 0, arrive: 1.2 }, okGap = true, okHop = true, okWarn = true;
        for (const a of m.attacks) {
            const need = m.portDistance(prev.finalPort, a.finalPort) * m.stepCost;
            if (a.arrive - prev.arrive + 1e-9 < Math.min(need, m.burstGap)) okGap = false;
            if (a.port !== a.finalPort && m.portDistance(a.port, a.finalPort) !== 1) okHop = false;
            if (a.hop && a.arrive - a.hop.at < 0.3) okHop = false;
            if (a.launch - a.warnAt + 1e-9 < m.warn) okWarn = false;
            prev = a;
        }
        ok(`${act.stages[i].tier}: arrivals are reachable`, okGap);
        ok(`${act.stages[i].tier}: every launch is announced`, okWarn);
        if (i === 3) ok('hops go to a neighbour, early enough', okHop && m.attacks.some(a => a.hop));
        else ok(`${act.stages[i].tier}: no hops`, m.attacks.every(a => !a.hop));
        if (i >= 2) {
            let burst = false;
            for (let k = 2; k < m.attacks.length; k++) {
                const [a, b, x] = [m.attacks[k - 2], m.attacks[k - 1], m.attacks[k]];
                if (a.port === b.port && b.port === x.port && approx(x.arrive - b.arrive, m.burstGap, 1e-9)) burst = true;
            }
            ok(`${act.stages[i].tier}: bursts of 3 exist`, burst);
        }
    }

    // A shield that follows the alerts wins; a frozen shield loses.
    const follow = (m) => {
        let t = 0;
        while (m.result === null && t < 120) {
            m.update(1 / 60); t += 1 / 60;
            const next = m.attacks.filter(a => !a.done && m.time >= a.warnAt).sort((a, b) => a.arrive - b.arrive)[0];
            if (next) m.setShield(m.time >= (next.hop ? next.hop.at : Infinity) ? next.finalPort : next.port);
        }
        return m;
    };
    const win = follow(make(3, 11));
    ok('following the alerts clears very hard', win.result === 'success' && win.blocked === 20 && win.lives === 7);
    ok('score = blocks*100 + lives*250', win.score === 20 * 100 + 7 * 250);

    const idle = make(0, 3);
    let t = 0;
    while (idle.result === null && t < 60) { idle.update(1 / 60); t += 1 / 60; }
    ok('a parked shield eventually loses', idle.result === 'fail' && idle.lives === 0 && idle.breaches === 4);

    // A schedule that fell behind never asks for a reaction in the past.
    const late = make(3, 5);
    for (let i = 0; i < 300; i++) late.update(1 / 60);
    late._lastArrive = late.time - 2;
    late.attacks = [];
    late._planNext();
    ok('late plans still warn from now on', late.attacks[0].warnAt >= late.time - 1e-9 &&
        late.attacks[0].arrive - late.time + 1e-9 >= late.warn + late.travel);

    // Revive: one life, same run, fresh schedule in the future.
    const blockedBefore = idle.blocked;
    idle.revive();
    ok('revive gives one life and clears the result', idle.lives === 1 && idle.result === null);
    ok('revive keeps the progress', idle.blocked === blockedBefore);
    ok('revive schedules ahead of now', idle.attacks.every(a => a.warnAt >= idle.time - 1e-9));

    // Frame-rate independence: 30/60/144 Hz steps give the same outcome.
    const run = (dt) => {
        const m = make(2, 21);
        let n = 0;
        while (m.result === null && n < 20000) {
            m.update(dt); n++;
            const next = m.attacks.filter(a => !a.done && m.time >= a.warnAt).sort((a, b) => a.arrive - b.arrive)[0];
            if (next) m.setShield(next.port);
        }
        return m.result + ':' + m.blocked + ':' + m.lives;
    };
    const r60 = run(1 / 60);
    ok('same result at 30, 60 and 144 Hz', r60 === run(1 / 30) && r60 === run(1 / 144), r60);

    const canvas = makeFakeCanvas();
    win.render(makeFakeCtx(canvas), 960, 640, 0, 0.5);
    ok('render runs', true);

    // 7 hearts fit between the LEAVE button and the progress bar.
    const xs = [];
    const spy = makeFakeCtx(canvas);
    spy.fillText = (t, x) => { if (t === '♥') xs.push(x); return spy; };
    win._renderHud(spy, 960, 640);
    ok('7 hearts drawn', xs.length === 7);
    ok('hearts clear the ⏸ button and the bar', Math.min(...xs) > 40 + 30 + 8 && Math.max(...xs) + 22 < 960 / 2 - 80,
        xs[0] + '..' + xs[xs.length - 1]);
});

// ─────────────────────────────────────────────
suite('Orbital Shield in the campaign (stage flow + revive)', () => {
    const mod = loadGameManager();
    const canvas = makeFakeCanvas();
    const ctx = makeFakeCtx(canvas);
    const gm = new mod.GameManager(canvas, ctx);
    const S = gm.state.STATES;
    const btn = (id) => gm.ui.buttons.find(b => b.id === id);

    for (let i = 0; i < 4; i++) gm.progress.completeStage(1, i, 10);
    gm.progress.openGate(1);
    for (let i = 0; i < 3; i++) gm.progress.completeStage(2, i, 10);
    gm.progress.openGate(2);

    settle(gm, S.ACT);
    gm.state._handlers[S.ACT].enter({ actId: 3 });
    ok('act 3 screen has 4 stage cards', [0, 1, 2, 3].every(i => !!btn('stage' + i)));
    ok('stage card shows packets + ports', gm._stageSummary(gm.progress.act(3), gm.progress.act(3).stages[0]) === '12 PACKETS · 4 PORTS');
    ok('act 3 tips', gm.tipBar.tips.some(t => /blinking port/.test(t)));

    settle(gm, S.ACT);
    gm._startStage(3, 0);
    const cfg = gm.state.pendingContext;
    ok('stage runs Orbital Shield', gm.state.pendingState === S.MINIGAME && cfg.mechanic instanceof mod.OrbitalShieldMechanic);
    ok('first stage shows the faint hint', cfg.footHint && /blinking port/.test(cfg.footHint.touch));

    const host = gm.state._handlers[S.MINIGAME];
    settle(gm, S.MINIGAME);
    host.enter(cfg);
    const m = cfg.mechanic;
    host.onKey({ code: 'ArrowRight' });
    ok('arrows reach the shield through the host', m.shieldPort === 1);
    ok('tap reaches the shield through the host', gm._hitTestUI(m.cx, m.cy + 200) === true && m.shieldPort === 2);
    for (let i = 0; i < 20; i++) { host.update(1 / 60); host.render(ctx, 0.5); }

    // Lose -> GAME_OVER with a revive button.
    m.lives = 1; m.blocked = 5;
    m.attacks.forEach(a => { a.arrive = m.time; });
    m.setShield((m.attacks[0].finalPort + 1) % m.ports);
    for (let i = 0; i < 100 && gm.state.pendingState !== S.GAME_OVER; i++) host.update(1 / 60);
    ok('a breach on the last life fails the stage', gm.state.pendingState === S.GAME_OVER);
    const go = gm.state.pendingContext;
    ok('revivable: no "no revive" flag and the run is kept', go.noRevive === false && go.resume === cfg);
    settle(gm, S.GAME_OVER);
    gm.state._handlers[S.GAME_OVER].enter(go);
    ok('revive button offered', !!btn('revive'));
    btn('revive').onClick();
    ok('revive runs the code breaker at act 3 difficulty', gm.state.pendingState === S.LOCKPICK && gm.state.pendingContext.difficulty === 3);

    // Win the code breaker -> back into the SAME run with one life.
    settle(gm, S.LOCKPICK);
    gm.state._handlers[S.LOCKPICK].enter(gm.state.pendingContext || { reason: 'revive', difficulty: 3 });
    gm.lockpick.onComplete(true);
    ok('recovery resumes the same Orbital Shield run', gm.state.pendingState === S.MINIGAME &&
        gm.state.pendingContext.mechanic === m && gm.state.pendingContext.resume === true);
    const resumed = gm.state.pendingContext;
    settle(gm, S.MINIGAME);
    host.enter(resumed);
    ok('resume does not reset the run', m.lives === 1 && m.blocked === 5 && m.result === null);
    ok('revive count tracked for the stage', gm._stageRevives === 1);

    // Second failure: one revive left, then none.
    m.attacks.forEach(a => { a.arrive = m.time; });
    m.setShield((m.attacks[0].finalPort + 1) % m.ports);
    for (let i = 0; i < 100 && gm.state.pendingState !== S.GAME_OVER; i++) host.update(1 / 60);
    const go2 = gm.state.pendingContext;
    ok('revives used carried to GAME_OVER', go2.revivesUsed === 1);
    gm._stageRevives = 2;
    settle(gm, S.MINIGAME);
    cfg.onComplete(false, m);
    const go3 = gm.state.pendingContext;
    settle(gm, S.GAME_OVER);
    gm.state._handlers[S.GAME_OVER].enter(go3);
    ok('no revive after two', go3.revivesUsed === 2 && !btn('revive'));
});

// ─────────────────────────────────────────────
suite('Signal Lock (Act 4) — rules', () => {
    const mod = loadGameManager();
    const { SignalLockMechanic, CAMPAIGN } = mod;
    const act = CAMPAIGN.acts[3];
    ok('act 4 is Signal Lock with 5 stages', act.available && act.game === 'signal' && act.stages.length === 5);
    ok('tiers EASY..EXPERT', act.stages.map(x => x.tier).join('/') === 'EASY/NORMAL/HARD/VERY HARD/EXPERT');
    ok('keys 3/3/4/4/5', act.stages.map(x => x.params.keys).join('/') === '3/3/4/4/5');
    const tol = act.stages.map(x => x.params.tol);
    ok('tolerance never widens', tol.every((v, i) => i === 0 || v <= tol[i - 1]));
    ok('glitches only on very hard + expert', act.stages.map(x => !!x.params.glitchMin).join() === 'false,false,false,true,true');
    ok('expert drift kept under the playable limit', act.stages[4].params.driftSpeed <= 1.1);

    const make = (i, seed) => {
        const m = new SignalLockMechanic(Object.assign({ rng: makeRng(seed) }, act.stages[i].params));
        m.init({});
        return m;
    };

    // Physics: hold raises, release lowers, both clamp.
    const p = make(0, 1);
    const f0 = p.f;
    p.handleKey('Space');
    for (let i = 0; i < 30; i++) p.update(1 / 60);
    ok('hold raises the frequency', p.f > f0 && p.v > 0);
    p.handleKeyUp('Space');
    for (let i = 0; i < 90; i++) p.update(1 / 60);
    ok('release lowers it', p.v < 0 || p.f === p.fMin);
    for (let i = 0; i < 600; i++) p.update(1 / 60);
    ok('clamped at the bottom', p.f === p.fMin);
    p.handlePointer(0, 0, 'down');
    for (let i = 0; i < 900 && p.result === null; i++) p.update(1 / 60);
    ok('clamped at the top', p.f <= p.fMax);

    // Sync meter: fills in tolerance, locks a key, picks a far new target.
    const s1 = make(1, 2);
    s1.f = s1.target; s1.v = 0;
    const firstTarget = s1.base;
    let n = 0;
    while (s1.locked === 0 && n++ < 600) { s1.f = s1.target; s1.v = 0; s1.update(1 / 60); }
    ok('holding the target locks a key in ~syncTime', s1.locked === 1 && Math.abs(n / 60 - s1.syncTime) < 0.05, (n / 60).toFixed(2));
    ok('next target is far from the last', Math.abs(s1.base - firstTarget) >= 0.9 - 1e-9 || s1.base !== firstTarget);
    s1.sync = 0.5;
    s1.f = s1.fMin; s1.v = 0; s1.base = s1.fMax - 0.3; s1.driftAmp = 0;
    s1.update(1 / 60);
    ok('meter drains out of sync (normal+)', s1.sync < 0.5);
    const e = make(0, 3);
    e.sync = 0.5; e.f = e.fMin; e.base = 4.2;
    e.update(1 / 60);
    ok('easy meter does not drain', e.sync === 0.5);

    // Win, lose, revive, score
    const w = make(0, 4);
    let guard = 0;
    while (w.result === null && guard++ < 6000) { w.f = w.target; w.v = 0; w.update(1 / 60); }
    ok('locking every key wins', w.result === 'success' && w.locked === 3);
    ok('score = keys*300 + time left*20', w.score === 3 * 300 + Math.floor(w.timeLeft) * 20);

    const l = make(2, 5);
    for (let i = 0; i < 6000 && l.result === null; i++) l.update(1 / 60);
    ok('time out fails', l.result === 'fail' && l.timeLeft === 0);
    l.locked = 2;
    l.revive();
    ok('revive adds 20 s and keeps the keys', l.result === null && Math.abs(l.timeLeft - 20) < 1e-9 && l.locked === 2);
    ok('revive drops any hold', !l.holding);

    // Glitch: warning flicker, then the target jumps.
    const g = make(3, 6);
    const at = g.glitchAt;
    ok('very hard schedules glitches', isFinite(at));
    // Make sync impossible so no key locks and reschedules the glitch.
    g.tol = -1;
    let steps = 0;
    while (g.time < at - 0.3 && steps++ < 2000) { g.f = g.fMin; g.v = 0; g.update(1 / 60); }
    ok('target flickers before a glitch', g.glitchWarning());
    const before = g.base;
    while (g.time < at + 0.05 && steps++ < 4000) { g.f = g.fMin; g.v = 0; g.update(1 / 60); }
    ok('target jumps at the glitch', g.base !== before);

    const c = makeFakeCanvas();
    w.render(makeFakeCtx(c), 960, 640, 0, 0.5);
    l.render(makeFakeCtx(c), 960, 640, 0, 0.3);
    ok('render runs', true);
});

// ─────────────────────────────────────────────
suite('Signal Lock — hold input routing + +20 s revive', () => {
    const mod = loadGameManager();
    const canvas = makeFakeCanvas();
    const ctx = makeFakeCtx(canvas);
    const gm = new mod.GameManager(canvas, ctx);
    const S = gm.state.STATES;
    const btn = (id) => gm.ui.buttons.find(b => b.id === id);
    const host = gm.state._handlers[S.MINIGAME];

    for (let a = 1; a <= 3; a++) {
        for (let i = 0; i < gm.progress.act(a).stages.length; i++) gm.progress.completeStage(a, i, 10);
        gm.progress.openGate(a);
    }
    ok('gate 3 opened act 4', gm.progress.isActUnlocked(4));

    settle(gm, S.ACT);
    gm._startStage(4, 0);
    const cfg = gm.state.pendingContext;
    const m = cfg.mechanic;
    ok('stage runs Signal Lock', m instanceof mod.SignalLockMechanic && m.keys === 3);
    ok('first stage hint', cfg.footHint && /Hold SPACE/.test(cfg.footHint.desktop) && /Hold anywhere/.test(cfg.footHint.touch));
    ok('stage card summary', gm._stageSummary(gm.progress.act(4), gm.progress.act(4).stages[4]) === '5 KEYS · 50s');
    settle(gm, S.MINIGAME);
    host.enter(cfg);

    // Keyboard: Space down / up
    gm._dispatchKey({ code: 'Space' });
    ok('Space starts a hold', m.holdKey === true);
    mod.fireDocument('keyup', { code: 'Space', target: { tagName: 'BODY' } });
    ok('Space key-up ends it', m.holdKey === false);

    // Mouse: press on the canvas holds; release anywhere ends it; the click
    // that follows does not start a new hold.
    gm._handleMouseDown(480, 300);
    ok('mouse press holds', m.holdPointer === true);
    mod.fireDocument('window:pointerup', { pointerType: 'mouse' });
    ok('mouse release (even off-canvas) ends it', m.holdPointer === false);
    gm._hitTestUI(480, 300, 'click');
    ok('trailing click does not re-hold', m.holdPointer === false);
    gm._handleMouseDown(btn('pause').x, btn('pause').y);
    ok('pressing ⏸ is not a hold', m.holdPointer === false);

    // Touch: press anywhere holds, release ends it.
    gm._hitTestUI(300, 200, 'touch');
    ok('touch press holds', m.holdPointer === true);
    gm._releaseHold('pointer');
    ok('touch release ends it', m.holdPointer === false);

    // Blur and the leave prompt drop every hold.
    gm._dispatchKey({ code: 'Space' });
    gm._hitTestUI(300, 200, 'touch');
    mod.fireDocument('window:blur', {});
    ok('window blur drops every hold', !m.holding);
    gm._dispatchKey({ code: 'Space' });
    gm._openPause();
    ok('pause panel drops the hold', !m.holding);
    gm._closeLeavePrompt();

    // Releases never reach tap-to-confirm games (Dual Ring).
    const ring = new mod.GameManager(canvas, ctx);
    ring._activeMinigame = { handlePointer: () => { ring._confirmed = true; return true; } };
    ring.state.currentState = S.MINIGAME;
    ring._releaseHold('pointer');
    ok('release is ignored by non-hold games', !ring._confirmed);

    // Time out -> GAME_OVER with a "+20s" recovery.
    m.timeLeft = 0.01;
    for (let i = 0; i < 100 && gm.state.pendingState !== S.GAME_OVER; i++) host.update(1 / 60);
    const go = gm.state.pendingContext;
    ok('time out offers recovery', gm.state.pendingState === S.GAME_OVER && go.noRevive === false && go.resume === cfg);
    settle(gm, S.GAME_OVER);
    gm.state._handlers[S.GAME_OVER].enter(go);
    ok('revive button says +20s', btn('revive') && /\+20s/.test(btn('revive').label));
    btn('revive').onClick();
    ok('code breaker at act 4 difficulty', gm.state.pendingState === S.LOCKPICK && gm.state.pendingContext.difficulty === 4);
    settle(gm, S.LOCKPICK);
    gm.state._handlers[S.LOCKPICK].enter({ reason: 'revive', difficulty: 4 });
    gm.lockpick.onComplete(true);
    ok('recovery resumes the same run', gm.state.pendingState === S.MINIGAME && gm.state.pendingContext.mechanic === m);
    ok('with 20 more seconds', Math.abs(m.timeLeft - 20) < 1e-6 && m.result === null);
});

// ─────────────────────────────────────────────
suite('Route Trace (Act 5) — puzzles, rules, flow', () => {
    const mod = loadGameManager();
    const { RouteTraceMechanic, CAMPAIGN } = mod;
    const act = CAMPAIGN.acts[4];
    ok('act 5 is Route Trace with 3 stages', act.available && act.game === 'route' && act.stages.length === 3);
    ok('grids 4/5/6', act.stages.map(x => x.params.size).join('/') === '4/5/6');
    ok('traces 2/3/3', act.stages.map(x => x.params.traces).join('/') === '2/3/3');
    const tl = act.stages.map(x => x.params.timeLimit);
    ok('time-based (no lives), time grows with the grid', tl.every((v, i) => i === 0 || v > tl[i - 1]) && act.stages.every(x => !x.params.lives));
    ok('locks only on HARD, no scrambles in the campaign',
        act.stages.map(x => !!x.params.lockRate).join() === 'false,false,true' &&
        act.stages.every(x => !x.params.scrambleMin));

    const make = (i, seed) => {
        const m = new RouteTraceMechanic(Object.assign({ rng: makeRng(seed) }, act.stages[i].params));
        m.init({});
        return m;
    };

    // Every generated puzzle: solvable, not pre-solved, path within bounds,
    // left edge -> right edge, locked route tiles already correct.
    let okAll = true, why = '';
    for (let i = 0; i < act.stages.length; i++) {
        const p = act.stages[i].params;
        for (let seed = 1; seed <= 60; seed++) {
            const m = make(i, seed * 7 + i);
            const path = m.solution;
            if (m._reach().solved) { okAll = false; why = 'pre-solved'; }
            if (path.length < p.minPath || path.length > p.maxPath) { okAll = false; why = 'length ' + path.length; }
            if (path[0].x !== 0 || path[path.length - 1].x !== p.size - 1) { okAll = false; why = 'edges'; }
            for (const c of path) {
                const t = m.grid[c.y][c.x];
                if (t.locked && (m.mask(c.x, c.y) & t.need) !== t.need) { okAll = false; why = 'locked wrong'; }
            }
            for (const c of path) {
                const t = m.grid[c.y][c.x];
                if (!t.locked) t.rot = m._rotFor(t.type, t.need);
            }
            if (!m._reach().solved) { okAll = false; why = 'unsolvable'; }
        }
    }
    ok('generated puzzles are always solvable and never pre-solved', okAll, why);
    const pre = make(2, 77);
    for (const c of pre.solution) { const t = pre.grid[c.y][c.x]; t.rot = pre._rotFor(t.type, t.need); }
    ok('setup: forced a solved grid', pre._reach().solved);
    pre._ensureUnsolved();
    ok('a solved grid is broken before it is handed out', !pre._reach().solved);

    // Rotation + lighting
    const r = make(0, 3);
    const c0 = r.solution[0];
    const t0 = r.grid[c0.y][c0.x];
    t0.locked = false;
    const rot0 = t0.rot;
    const B = r.boardRect();
    r.handlePointer(B.x + c0.x * B.tile + 5, B.y + c0.y * B.tile + 5, 'down');
    ok('tap rotates the tile clockwise', t0.rot === (rot0 + 1) % 4);
    ok('tap moves the cursor there', r.cursor.x === c0.x && r.cursor.y === c0.y);
    r.handleKey('Space');
    ok('SPACE rotates the cursor tile', t0.rot === (rot0 + 2) % 4);
    r.handleKey('ArrowRight');
    ok('arrows move the cursor', r.cursor.x === Math.min(c0.x + 1, r.size - 1));
    // A tile off the route, made a locked corner.
    let off = null;
    for (let y = 0; y < r.size && !off; y++) for (let x = 0; x < r.size && !off; x++) {
        if (!r.grid[y][x].onPath) off = { x, y };
    }
    Object.assign(r.grid[off.y][off.x], { type: 'corner', rot: 1, locked: true });
    ok('locked tiles do not rotate', r.rotateTile(off.x, off.y) === false && r.grid[off.y][off.x].rot === 1);
    t0.rot = r._rotFor(t0.type, t0.need);
    r._afterChange();
    ok('the first route tile lights up when it faces your node', r.lit.has(c0.y * r.size + c0.x));

    // Solve -> pause (timer stops) -> fresh grid -> win
    const solve = (m) => {
        for (const c of m.solution) {
            const t = m.grid[c.y][c.x];
            if (!t.locked) t.rot = m._rotFor(t.type, t.need);
        }
        m._afterChange();
    };
    const w = make(1, 9);
    solve(w);
    ok('a connected route counts as one trace', w.solved === 1 && w.pause > 0);
    const tl0 = w.timeLeft;
    const firstGrid = w.grid;
    ok('input is ignored during the pause', w.rotateTile(0, 0) === false);
    for (let i = 0; i < 30; i++) w.update(1 / 60);
    ok('the timer stops while a solved trace is shown', w.timeLeft === tl0 && w.pause > 0);
    for (let i = 0; i < 30; i++) w.update(1 / 60);
    ok('a new grid follows', w.grid !== firstGrid && w.pause <= 0);
    solve(w);
    for (let i = 0; i < 60; i++) w.update(1 / 60);
    solve(w);
    ok('tracing every route wins', w.result === 'success' && w.solved === 3);
    ok('score = traces*400 + time left*20', w.score === 3 * 400 + Math.floor(w.timeLeft) * 20);

    // Time out + revive
    const l = make(0, 4);
    for (let i = 0; i < 4000 && l.result === null; i++) l.update(1 / 60);
    ok('time out fails', l.result === 'fail' && l.timeLeft === 0);
    l.revive();
    ok('revive adds 20 s on the same grid', l.result === null && Math.abs(l.timeLeft - 20) < 1e-9);

    // Scramble (kept for later modes): flicker first, then turn the chosen tiles.
    const sc = new RouteTraceMechanic(Object.assign({ rng: makeRng(5) }, act.stages[2].params, { scrambleMin: 9, scrambleMax: 13 }));
    sc.init({});
    let steps = 0;
    while (!sc.scrambleWarning() && steps++ < 2000) sc.update(1 / 60);
    ok('scramble is announced', sc.scrambleWarning() && sc.scrambleTiles.length === 2);
    ok('scrambles never pick locked tiles', sc.scrambleTiles.every(c => !sc.grid[c.y][c.x].locked));
    const picked = sc.scrambleTiles.slice();
    const before = picked.map(c => sc.grid[c.y][c.x].rot);
    while (sc.scrambleWarning() && steps++ < 4000) sc.update(1 / 60);
    ok('scrambled tiles turned', picked.every((c, k) => sc.grid[c.y][c.x].rot !== before[k]));
    ok('next scramble scheduled', isFinite(sc.scrambleAt) && sc.scrambleAt > sc.time);

    const cv = makeFakeCanvas();
    sc.render(makeFakeCtx(cv), 960, 640);
    w.render(makeFakeCtx(cv), 960, 640);
    ok('render runs', true);

    // Campaign flow: stage card, host tap routing, +20 s recovery.
    const gm = new mod.GameManager(cv, makeFakeCtx(cv));
    const S = gm.state.STATES;
    for (let a = 1; a <= 4; a++) {
        for (let i = 0; i < gm.progress.act(a).stages.length; i++) gm.progress.completeStage(a, i, 10);
        gm.progress.openGate(a);
    }
    ok('gate 4 opened act 5', gm.progress.isActUnlocked(5));
    ok('stage card summary', gm._stageSummary(gm.progress.act(5), gm.progress.act(5).stages[2]) === '3 TRACES · 6×6 · 85s');
    settle(gm, S.ACT);
    gm._startStage(5, 0);
    const cfg = gm.state.pendingContext;
    const m = cfg.mechanic;
    ok('stage runs Route Trace', m instanceof RouteTraceMechanic && m.size === 4);
    ok('first stage hint', cfg.footHint && /Tap a tile/.test(cfg.footHint.touch));
    const host = gm.state._handlers[S.MINIGAME];
    settle(gm, S.MINIGAME);
    host.enter(cfg);
    const Bm = m.boardRect();
    const tc = m.solution[0];
    const tt = m.grid[tc.y][tc.x];
    const rb = tt.rot;
    ok('click on a tile is routed to the board', gm._hitTestUI(Bm.x + tc.x * Bm.tile + 8, Bm.y + tc.y * Bm.tile + 8, 'click') === true &&
        (tt.locked ? tt.rot === rb : tt.rot === (rb + 1) % 4));
    m.timeLeft = 0.01;
    for (let i = 0; i < 100 && gm.state.pendingState !== S.GAME_OVER; i++) host.update(1 / 60);
    const go = gm.state.pendingContext;
    ok('time out offers a +20s recovery', gm.state.pendingState === S.GAME_OVER && go.noRevive === false && go.resume === cfg);
    settle(gm, S.GAME_OVER);
    gm.state._handlers[S.GAME_OVER].enter(go);
    const rv = gm.ui.buttons.find(b => b.id === 'revive');
    ok('revive button says +20s', rv && /\+20s/.test(rv.label));
});

// ─────────────────────────────────────────────
suite('Field guide pages scroll', () => {
    const mod = loadGameManager();
    const canvas = makeFakeCanvas();
    const ctx = makeFakeCtx(canvas);
    ctx.measureText = (t) => ({ width: String(t).length * 7.5 });
    const gm = new mod.GameManager(canvas, ctx);
    const S = gm.state.STATES;
    const guide = gm.state._handlers[S.GUIDE];
    const pages = mod.GameManager.GUIDE_PAGES;
    const games = pages.findIndex(p => p.title === 'GAMES');

    settle(gm, S.GUIDE);
    guide.enter({ returnState: S.HUB });
    gm._setGuidePage(0);
    guide.render(ctx, 0);
    ok('a short page does not scroll', gm._guideMax === 0);

    gm._setGuidePage(games);
    guide.render(ctx, 0);
    ok('the GAMES page is taller than the viewport', gm._guideMax > 0, 'max=' + gm._guideMax);
    const settleScroll = () => { for (let i = 0; i < 60; i++) guide.update(1 / 60); guide.render(ctx, 0); };

    guide.onKey({ code: 'ArrowDown' });
    settleScroll();
    ok('↓ scrolls down', gm._guideScroll > 0);
    for (let i = 0; i < 50; i++) guide.onKey({ code: 'KeyS' });
    settleScroll();
    ok('scrolling stops at the bottom', gm._guideScroll === gm._guideMax);
    guide.onKey({ code: 'PageUp' });
    guide.onKey({ code: 'PageUp' });
    guide.onKey({ code: 'PageUp' });
    settleScroll();
    ok('PageUp scrolls back to the top', gm._guideScroll === 0);

    gm._handleWheel(120);
    settleScroll();
    ok('mouse wheel scrolls the guide', gm._guideScroll > 0);
    gm._handleSwipe('down');
    gm._handleSwipe('down');
    settleScroll();
    ok('swipe down (finger) scrolls back up', gm._guideScroll === 0);
    gm._handleSwipe('up');
    settleScroll();
    ok('swipe up (finger) scrolls down', gm._guideScroll > 0);

    gm._handleSwipe('left');
    ok('swipe left turns the page and resets the scroll', gm._guidePage === (games + 1) % pages.length && gm._guideScroll === 0);
    gm._handleSwipe('right');
    ok('swipe right turns back', gm._guidePage === games);
});

// ─────────────────────────────────────────────
suite('Back button / back swipe stays in the game', () => {
    const mod = loadGameManager();
    const { BackGuard } = mod;

    // BackGuard against a fake window + history.
    const listeners = {};
    const hist = { pushes: 0, backs: 0 };
    const win = {
        addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
        history: { pushState: () => { hist.pushes++; }, back: () => { hist.backs++; } }
    };
    const fire = (t) => (listeners[t] || []).forEach(fn => fn({}));
    let answer = true, calls = 0;
    const guard = new BackGuard(win, () => { calls++; return answer; });
    ok('no guard entry before the player interacts', hist.pushes === 0 && !guard.armed);
    fire('popstate');
    ok('an unarmed pop is ignored', calls === 0);
    fire('pointerdown');
    ok('first tap pushes the guard entry', hist.pushes === 1 && guard.armed);
    fire('keydown');
    ok('only one guard entry at a time', hist.pushes === 1);
    fire('popstate');
    ok('back is handed to the game', calls === 1);
    ok('handled back re-arms the guard', hist.pushes === 2 && guard.armed && hist.backs === 0);
    answer = false;
    fire('popstate');
    ok('an unhandled back really leaves the page', hist.backs === 1 && guard.leaving && !guard.armed);
    fire('pointerdown');
    ok('no re-arming while leaving', hist.pushes === 2);

    // GameManager.handleBrowserBack per screen.
    const canvas = makeFakeCanvas();
    const ctx = makeFakeCtx(canvas);
    const gm = new mod.GameManager(canvas, ctx);
    const S = gm.state.STATES;
    const enter = (state, c) => { settle(gm, state); gm.state._handlers[state].enter(c); };

    gm._startStage(1, 0);
    enter(S.LEVEL);
    ok('in play: back stays on the page', gm.handleBrowserBack() === true);
    ok('in play: back opens the PAUSED panel (a warning, not an exit)', gm._quit && gm._quit.mode === 'pause' && gm.state.pendingState === null);
    gm._setPauseMode('leave');
    gm.handleBrowserBack();
    ok('back on the leave warning returns to the panel', gm._quit && gm._quit.mode === 'pause');
    gm.handleBrowserBack();
    ok('back on the panel resumes', !gm._quit && gm.state.pendingState === null);

    enter(S.ACT, { actId: 1 });
    gm.handleBrowserBack();
    ok('act screen: back goes to the map', gm.state.pendingState === S.HUB);
    enter(S.HUB);
    gm.handleBrowserBack();
    ok('map: back goes to the menu', gm.state.pendingState === S.MENU);
    enter(S.GUIDE, { returnState: S.ACT, returnContext: { actId: 1 } });
    gm.handleBrowserBack();
    ok('guide: back closes it', gm.state.pendingState === S.ACT);
    gm._stage = { actId: 1, index: 0 };
    enter(S.GAME_OVER, { stage: gm._stage, score: 0 });
    gm.handleBrowserBack();
    ok('game over: back goes to the act', gm.state.pendingState === S.ACT);

    enter(S.MENU);
    ok('menu: first back stays and warns', gm.handleBrowserBack() === true && gm._exitArmed > 0);
    const texts = [];
    const spy = makeFakeCtx(canvas);
    spy.fillText = (t) => { texts.push(String(t)); return spy; };
    gm.state._handlers[S.MENU].render(spy, 0);
    ok('menu shows "press back again"', texts.some(t => /Press back again/.test(t)));
    ok('menu: second back leaves the site', gm.handleBrowserBack() === false);
    for (let i = 0; i < 200; i++) gm.state._handlers[S.MENU].update(1 / 60);
    ok('the warning expires', gm.handleBrowserBack() === true);

    gm.state.transitioning = true;
    ok('back during a screen transition is swallowed', gm.handleBrowserBack() === true);
});

// ─────────────────────────────────────────────
suite('UITheme + tap targets', () => {
    const mod = loadGameManager();
    const T = mod.UITheme;
    ok('tier by name', T.tier('VERY HARD').numeral === 'IV' && T.tier('very hard').numeral === 'IV');
    ok('tier by index', T.tier(4).key === 'EXPERT' && T.tier(0).key === 'EASY');
    ok('unknown tier falls back to EASY', T.tier('NOPE').key === 'EASY' && T.tier(9).key === 'EASY');
    ok('every campaign tier has a badge', mod.CAMPAIGN.acts.every(a => a.stages.every(st => T.tier(st.tier).key === st.tier)));
    ok('layers cover acts 1-9', [1, 2, 3].every(n => T.layerOf(n).key === 'PERIMETER') &&
        [4, 5, 6].every(n => T.layerOf(n).key === 'INTERNAL') && [7, 8, 9].every(n => T.layerOf(n).key === 'CORE'));
    ok('font roles', T.font('label') === '600 14px Rajdhani' && T.font('nope', 700, 'Orbitron') === '700 16px Orbitron');

    const canvas = makeFakeCanvas();
    const gm = new mod.GameManager(canvas, makeFakeCtx(canvas));
    const ui = gm.ui;
    const hits = [];
    ui.clearButtons();
    ui.addButton('small', '', 100, 100, 32, 32, () => hits.push('small'));
    ui.addButton('big', '', 300, 100, 200, 60, () => hits.push('big'));
    ui.addButton('exact', '', 100, 300, 32, 32, () => hits.push('exact'), { exact: true });
    ok('exact hit still works', ui.handleClick(110, 110) && hits.pop() === 'small');
    ok('near miss hits a small button', ui.handleClick(130, 100) && hits.pop() === 'small');
    ok('exact hit beats a nearer near miss', ui.handleClick(201, 100) && hits.pop() === 'big');
    ok('far tap hits nothing', !ui.handleClick(100, 180) && hits.length === 0);
    ok('exact buttons get no tap padding', !ui.handleClick(130, 300) && hits.length === 0);

    // The in-game pause button must not steal taps meant for the game.
    gm._addLeaveButton({});
    const pause = ui.buttons.find(b => b.id === 'pause');
    ok('pause button is exact-hit only', !!pause && pause.exact === true);
});

// ─────────────────────────────────────────────
suite('Act screen ladder + unlock effect', () => {
    const mod = loadGameManager();
    const canvas = makeFakeCanvas();
    const ctx = makeFakeCtx(canvas);
    const gm = new mod.GameManager(canvas, ctx);
    const S = gm.state.STATES;
    const GM = mod.GameManager;
    const btn = (id) => gm.ui.buttons.find(b => b.id === id);

    // Layout: 3, 4 and 5 stages, with and without a gate.
    for (const n of [3, 4, 5]) {
        for (const hasGate of [true, false]) {
            const L = gm._actScreenLayout(n, hasGate);
            const tag = `${n} stages${hasGate ? '' : ', no gate'}`;
            const half = L.cardW * 1.06 / 2;   // the NEXT card is drawn 6% larger
            ok(`ladder rises (${tag})`, L.ys.every((y, i) => i === 0 || y < L.ys[i - 1]));
            ok(`cards inside the canvas (${tag})`, L.xs.every((x, i) => x - half >= 0 && x + half <= 960 &&
                L.ys[i] - half >= 140 && L.trackYs[i] + 8 < L.statusY - 16));
            ok(`cards do not overlap (${tag})`, L.xs.every((x, i) => i === 0 || x - L.xs[i - 1] >= L.cardW * 1.06));
            if (hasGate) {
                ok(`gate node after the last card (${tag})`, L.gate.x - L.gate.r > L.xs[n - 1] + half &&
                    L.gate.x + L.gate.r <= 960);
            } else {
                ok(`no gate node (${tag})`, L.gate === null);
            }
        }
    }
    ok('final act has no gate; gate 9 comes with Act 10', !gm._actHasGate(10) && !gm._actHasGate(9) && gm._actHasGate(1) && gm._actHasGate(8));

    // Fresh player: stage 1 is next, the rest locked.
    const act1 = gm.progress.act(1);
    ok('fresh act: first stage is next', gm._stageView(act1, 0).status === 'next' && gm._stageView(act1, 1).status === 'locked');
    ok('fresh act: track empty', gm._ladderFill(act1, 0) === 0);

    // First clear of stage 1 plays the effect on the act screen.
    gm._stage = { actId: 1, index: 0 };
    settle(gm, S.LEVEL);
    gm._onStageCleared(300, 0);
    ok('first clear starts the effect', !!gm._ladderAnim && gm._ladderAnim.actId === 1 && gm._ladderAnim.seg === 0);
    settle(gm, S.ACT);
    const H = gm.state._handlers[S.ACT];
    H.enter({ actId: 1 });
    ok('during the fill the next card still looks locked', gm._stageView(act1, 1).status === 'locked');
    ok('the cleared card is cleared', gm._stageView(act1, 0).status === 'cleared');
    const t0 = gm._ladderAnim.t;
    H.render(ctx, 0);
    ok('render does not advance the effect', gm._ladderAnim.t === t0);
    const step = (sec) => { for (let k = 0; k < Math.round(sec * 60); k++) H.update(1 / 60); };
    step(GM.LADDER_DELAY + GM.LADDER_FILL / 2);
    const mid = gm._ladderFill(act1, 0);
    ok('track is filling', mid > 0 && mid < 1, String(mid));
    step(GM.LADDER_FILL / 2 + 0.1);
    const v = gm._stageView(act1, 1);
    ok('then the card unlocks with the effect', v.status === 'next' && v.unlock > 0 && v.unlock < 1);
    H.render(ctx, 0);
    step(GM.LADDER_BURST);
    ok('effect ends', gm._ladderAnim === null && gm._stageView(act1, 1).status === 'next' && gm._ladderFill(act1, 0) === 1);

    // A replay of a cleared stage does not play it again.
    gm._stage = { actId: 1, index: 0 };
    settle(gm, S.LEVEL);
    gm._onStageCleared(900, 0);
    ok('replay: no effect', gm._ladderAnim === null);

    // Leaving the act screen drops a running effect.
    gm._stage = { actId: 1, index: 1 };
    settle(gm, S.LEVEL);
    gm._onStageCleared(300, 0);
    settle(gm, S.ACT);
    H.enter({ actId: 1 });
    H.exit();
    ok('leaving drops the effect', gm._ladderAnim === null);

    // The last stage fills the track to the gate, which becomes tappable.
    gm.progress.completeStage(1, 2, 100);
    gm._stage = { actId: 1, index: 3 };
    settle(gm, S.LEVEL);
    gm._onStageCleared(300, 0);
    ok('last stage animates the gate segment', !!gm._ladderAnim && gm._ladderAnim.seg === 3);
    settle(gm, S.ACT);
    gm.ui.clearButtons();
    H.enter({ actId: 1 });
    ok('gate node is a tap target', !!btn('gate-node') && btn('gate-node').hidden === true);
    btn('gate-node').onClick();
    ok('tapping the gate node starts the gate', gm.state.pendingState !== null);
});

// ─────────────────────────────────────────────
suite('HUB carousel drag + game cards', () => {
    const mod = loadGameManager();
    const canvas = makeFakeCanvas();
    const ctx = makeFakeCtx(canvas);
    const gm = new mod.GameManager(canvas, ctx);
    const S = gm.state.STATES;
    const btn = (id) => gm.ui.buttons.find(b => b.id === id);
    // Open a few acts so the carousel has room on both sides.
    for (const [a, k] of [[1, 4], [2, 3], [3, 4]]) {
        for (let i = 0; i < k; i++) gm.progress.completeStage(a, i, 100);
        gm.progress.openGate(a);
    }
    settle(gm, S.HUB);
    const H = gm.state._handlers[S.HUB];
    gm._actView = null;
    H.enter();
    const L = gm._actMapLayout();
    const start = gm._mapIndex;
    ok('HUB starts on the current act', start === 3);

    ok('drag starts on the card band', gm._mapDragStart(480, L.cy, 0) === true);
    gm._mapDragEnd(true, 10);
    ok('a tap on the band opens the focused act', gm.state.pendingState === S.ACT && gm.state.pendingContext.actId === 4);
    settle(gm, S.HUB);
    H.enter();
    ok('no drag above or below the band', gm._mapDragStart(480, 60, 0) === false && gm._mapDragStart(480, L.cy + L.cardH / 2 + 10, 0) === false);

    // Slow drag a bit more than half a card to the left: snaps to the next act.
    gm._mapDragStart(700, L.cy, 0);
    for (let k = 1; k <= 30; k++) gm._mapDragMove(700 - k * 8, k * 50);
    ok('the carousel follows the finger', Math.abs(gm._mapScroll - (start + 240 / L.spacing)) < 1e-9);
    H.update(1 / 60);
    ok('no easing while dragging', Math.abs(gm._mapScroll - (start + 240 / L.spacing)) < 1e-9);
    gm._mapDragEnd(false, 30 * 50 + 300);
    ok('slow drag past half snaps to the next act', gm._mapIndex === start + 1);

    // Short quick flick to the right: moves back one act.
    const at = gm._mapIndex;
    gm._mapDragStart(400, L.cy, 0);
    for (let k = 1; k <= 4; k++) gm._mapDragMove(400 + k * 15, k * 16);
    gm._mapDragEnd(false, 70);
    ok('a quick flick moves one act', gm._mapIndex === at - 1);

    // A short slow drag snaps back (once the carousel has settled).
    for (let k = 0; k < 120; k++) H.update(1 / 60);
    const back = gm._mapIndex;
    gm._mapDragStart(400, L.cy, 0);
    for (let k = 1; k <= 10; k++) gm._mapDragMove(400 - k * 6, k * 60);
    gm._mapDragEnd(false, 900);
    ok('a short drag snaps back', gm._mapIndex === back);

    // Past the ends the carousel resists and never leaves the range.
    gm._mapGo(0);
    gm._mapScroll = 0;
    gm._mapDragStart(300, L.cy, 0);
    gm._mapDragMove(700, 500);
    ok('rubber band at the first act', gm._mapScroll < 0 && gm._mapScroll > -400 / L.spacing);
    gm._mapDragEnd(false, 1200);
    ok('snaps back to the first act', gm._mapIndex === 0);

    // Background parallax follows the carousel; leaving the HUB drops a drag.
    for (let k = 0; k < 120; k++) H.update(1 / 60);
    ok('parallax tracks the carousel', gm._bgShift === -gm._mapScroll * 30);
    gm._mapDragStart(480, L.cy, 0);
    H.exit();
    ok('leaving the HUB drops the drag', gm._mapDrag === null);

    // Every act status renders (complete, active, locked, dev) without errors.
    settle(gm, S.HUB);
    H.enter();
    let threw = null;
    try {
        for (let k = 0; k < 9; k++) { gm._mapGo(k); gm._mapScroll = k; H.render(ctx, 0); }
    } catch (e) { threw = e.message; }
    ok('all act cards render', threw === null, threw);
    ok('rail nodes are 48 px', btn('rail1').w === 48 && btn('rail1').h === 48);
});

// ─────────────────────────────────────────────
suite('Clearance, integrity + layer atmosphere', () => {
    const mod = loadGameManager();
    const canvas = makeFakeCanvas();
    const ctx = makeFakeCtx(canvas);
    const gm = new mod.GameManager(canvas, ctx);
    const S = gm.state.STATES;
    const T = mod.UITheme;
    const P = gm.progress;

    ok('fresh player: L0, integrity 0', P.clearanceLevel() === 0 && P.integrity() === 0);
    ok('clearance labels', T.clearanceLabel(0) === 'L0 GUEST' && T.clearanceLabel(4) === 'L4 OPERATOR' &&
        T.clearanceLabel(9) === 'L9 ROOT' && T.clearanceLabel(10) === 'L10 GUARDIAN' && T.clearanceLabel(42) === 'L10 GUARDIAN');
    ok('integrity colours', T.integrityColor(0.2) === T.color.danger && T.integrityColor(0.6) === T.color.warn && T.integrityColor(1) === T.color.ok);
    P.completeStage(1, 0, 100);
    P.completeStage(1, 1, 100);
    ok('half an act = half of one tenth', Math.abs(P.integrity() - 0.5 / 10) < 1e-9 && P.clearanceLevel() === 0);
    P.completeStage(1, 2, 100);
    P.completeStage(1, 3, 100);
    ok('a cleared act raises clearance', P.clearanceLevel() === 1 && Math.abs(P.integrity() - 1 / 10) < 1e-9);
    ok('act 10 has its own HANDOVER status', T.layerOf(10).key === 'HANDOVER' && T.layerOf(9).key === 'CORE');
    ok('colour mix', T.mix('#000000', '#ffffff', 0.5).join(',') === '128,128,128' && T.rgba([1, 2, 3], 0.5) === 'rgba(1,2,3,0.5)');

    // Background layer follows the screen: menu = perimeter, HUB = focused act, act screen = its act.
    settle(gm, S.MENU);
    ok('menu shows the perimeter', gm._bgLayerTarget() === 0);
    settle(gm, S.HUB);
    gm._mapScroll = 4;
    ok('HUB on act 5 shows the internal layer', gm._bgLayerTarget() === 1);
    gm._mapScroll = 7.4;
    ok('HUB on act 8 shows the core', gm._bgLayerTarget() === 2);
    settle(gm, S.ACT);
    gm._actView = 2;
    ok('act screen uses its act', gm._bgLayerTarget() === 0);
    gm._bgLayer = 0;
    gm._actView = 7;
    for (let k = 0; k < 120; k++) gm.update(1 / 60);
    ok('the background eases to the new layer', gm._bgLayer > 1.9 && gm._bgLayer <= 2);
    let threw = null;
    try { gm.render(ctx, 0); gm._bgLayer = 1.5; gm.render(ctx, 0); } catch (e) { threw = e.message; }
    ok('layered background renders, also mid-blend', threw === null, threw);

    // Clearing the last stage of an act announces the new clearance on the act screen.
    gm.progress.openGate(1);
    for (let i = 0; i < 2; i++) P.completeStage(2, i, 100);
    gm._stage = { actId: 2, index: 2 };
    settle(gm, S.LEVEL);
    gm._onStageCleared(300, 0);
    const c = gm._clearanceUp;
    ok('act clear queues the clearance moment', !!c && c.actId === 2 && c.level === 2 && c.t < 0);
    settle(gm, S.ACT);
    const H = gm.state._handlers[S.ACT];
    H.enter({ actId: 2 });
    const texts = [];
    const spy = makeFakeCtx(canvas);
    spy.fillText = (t) => { texts.push(String(t)); return spy; };
    for (let k = 0; k < Math.round((GM_T(mod) + 0.3) * 60); k++) H.update(1 / 60);
    H.render(spy, 0);
    ok('banner shows the new clearance', texts.includes('CLEARANCE GRANTED') && texts.includes('L2 TECH'));
    for (let k = 0; k < 4 * 60; k++) H.update(1 / 60);
    ok('banner goes away', gm._clearanceUp === null);
    gm._stage = { actId: 2, index: 2 };
    settle(gm, S.LEVEL);
    gm._onStageCleared(999, 0);
    ok('replaying a cleared act does not announce again', gm._clearanceUp === null);

    // Main menu reflects integrity.
    settle(gm, S.MENU);
    const menu = [];
    const spy2 = makeFakeCtx(canvas);
    spy2.fillText = (t) => { menu.push(String(t)); return spy2; };
    gm.state._handlers[S.MENU].render(spy2, 0);
    ok('menu shows clearance and integrity', menu.includes('CLEARANCE') && menu.includes('SYSTEM INTEGRITY') && menu.includes('L2 TECH'));
    ok('compromised menu warns', menu.some(t => /\[WARNING\]/.test(t)));
});

function GM_T(mod) { return mod.GameManager.LADDER_DELAY + mod.GameManager.LADDER_FILL; }

// ─────────────────────────────────────────────
suite('Stage stars (UI-5)', () => {
    const mod = loadGameManager({
        // A save from before stars existed: cleared stages carry no stars.
        sb_campaign_v1: JSON.stringify({ v: 1, stages: { 1: [{ completed: true, best: 500 }, { completed: false, best: 0 }] }, gates: [] })
    });
    const C = mod.CAMPAIGN;
    const canvas = makeFakeCanvas();
    const ctx = makeFakeCtx(canvas);
    const gm = new mod.GameManager(canvas, ctx);
    const S = gm.state.STATES;
    const P = gm.progress;

    // Rules
    const tb = (misses, perfectShare) => C.starsFor('timingbar', 'EASY', { misses, perfectShare }, false);
    ok('timing bar: no miss + 80% perfect = 3', tb(0, 0.8) === 3 && tb(0, 0.79) === 2);
    ok('timing bar: one miss = 2, two = 1', tb(1, 1) === 2 && tb(2, 1) === 1);
    ok('stack rules', C.starsFor('stack', 'EASY', { lost: 0, align: 0.85 }) === 3 && C.starsFor('stack', 'EASY', { lost: 1, align: 0.85 }) === 2 &&
        C.starsFor('stack', 'EASY', { lost: 0, align: 0.69 }) === 1);
    ok('orbital rules', C.starsFor('orbital', 'HARD', { breaches: 0 }) === 3 && C.starsFor('orbital', 'HARD', { breaches: 1 }) === 2 &&
        C.starsFor('orbital', 'HARD', { breaches: 3 }) === 1);
    ok('signal: seconds left per tier', C.starsFor('signal', 'HARD', { timeLeft: 30 }) === 3 && C.starsFor('signal', 'HARD', { timeLeft: 22 }) === 2 &&
        C.starsFor('signal', 'HARD', { timeLeft: 21.9 }) === 1 && C.starsFor('signal', 'EXPERT', { timeLeft: 20 }) === 3);
    ok('route: seconds left per tier', C.starsFor('route', 'NORMAL', { timeLeft: 35 }) === 3 && C.starsFor('route', 'NORMAL', { timeLeft: 15 }) === 2 &&
        C.starsFor('route', 'NORMAL', { timeLeft: 14 }) === 1);
    ok('a revive caps the run at one star', C.starsFor('orbital', 'EASY', { breaches: 0 }, true) === 1);
    ok('unknown game or no stats = one star', C.starsFor('nope', 'EASY', {}) === 1 && C.starsFor('orbital', 'EASY', null) === 1);
    ok('every campaign tier of the timed games has thresholds', C.acts.filter(a => a.game === 'signal' || a.game === 'route')
        .every(a => a.stages.every(st => C.starsFor(a.game, st.tier, { timeLeft: 999 }) === 3)));

    // Save
    ok('old clears count as one star', P.stageStars(1, 0) === 1 && P.stageStars(1, 1) === 0);
    P.completeStage(1, 1, 100, 2);
    P.completeStage(1, 1, 50, 1);
    ok('best stars are kept', P.stageStars(1, 1) === 2);
    P.completeStage(1, 1, 50, 3);
    ok('a better run raises them', P.stageStars(1, 1) === 3);
    ok('act star total', P.actStars(1).got === 4 && P.actStars(1).max === 12);

    // Timing Bar stage: the clear computes stars from misses and PERFECT share.
    settle(gm, S.ACT);
    gm._startStage(1, 2);
    settle(gm, S.LEVEL);
    const lm = gm.levels;
    ok('timing bar counts misses and perfects', lm.misses === 0 && lm.perfectCount === 0);
    lm.hitCount = 10; lm.perfectCount = 9; lm.misses = 0;
    lm.levelComplete = true;
    gm.state._handlers[S.LEVEL].update(1 / 60);
    ok('flawless timing bar clear = 3 stars', gm._resultStars && gm._resultStars.n === 3 && P.stageStars(1, 2) === 3);
    const texts = [];
    const spy = makeFakeCtx(canvas);
    spy.fillText = (t) => { texts.push(String(t)); return spy; };
    gm.state._handlers[S.LEVEL].render(spy, 0);
    ok('the result overlay renders', texts.includes('NODE CLEANED!'));

    // Minigame stage: stars after the result, stage holds longer, NEW BEST shows.
    gm.progress.completeStage(1, 3, 100);
    gm.progress.openGate(1);
    for (let i = 0; i < 3; i++) P.completeStage(2, i, 100, 1);
    gm.progress.openGate(2);
    settle(gm, S.ACT);
    gm._startStage(3, 0);
    const cfg = gm.state.pendingContext;
    settle(gm, S.MINIGAME);
    gm.state._handlers[S.MINIGAME].enter(cfg);
    const m = gm._activeMinigame;
    m.blocked = m.blocksNeeded - 1;
    m.breaches = 0;
    m.result = 'success';
    m.score = 999;
    const H = gm.state._handlers[S.MINIGAME];
    H.update(1 / 60);
    ok('cleared minigame stage reveals stars', gm._resultStars && gm._resultStars.n === 3);
    ok('and stays up long enough to see them', gm._mgEndTimer > 1.8);
    for (let k = 0; k < 2.5 * 60 && gm._activeMinigame; k++) H.update(1 / 60);
    ok('stars saved after the stage', P.stageStars(3, 0) === 3);

    // A revived Orbital run earns one star.
    settle(gm, S.ACT);
    gm._startStage(3, 1);
    const cfg2 = gm.state.pendingContext;
    settle(gm, S.MINIGAME);
    gm.state._handlers[S.MINIGAME].enter(cfg2);
    const m2 = gm._activeMinigame;
    gm._stageRevives = 1;
    m2.breaches = 0;
    m2.result = 'success';
    H.update(1 / 60);
    ok('a revived run shows one star', gm._resultStars.n === 1);

    // Replaying with a better result shows NEW BEST.
    gm._stage = { actId: 2, index: 0 };
    gm._stageRevives = 0;
    gm._beginResultStars({ starStats: () => ({ lost: 0, align: 0.9 }) });
    ok('improving a stage is a new best', gm._resultStars.n === 3 && gm._resultStars.newBest === true);
    gm._resultStars.t = 5;
    const t2 = [];
    const spy2 = makeFakeCtx(canvas);
    spy2.fillText = (t) => { t2.push(String(t)); return spy2; };
    gm._drawResultStars(spy2, 480, 400);
    ok('NEW BEST is shown', t2.includes('NEW BEST'));

    // Stack alignment is a 0..1 share.
    const so = new mod.StackOverflowMechanic({ rng: makeRng(5) });
    so.init({ width: 960, height: 640 });
    ok('empty stack has no alignment', so.starStats().align === 0 && so.starStats().lost === 0);
});

// ─────────────────────────────────────────────
suite('Polish: transitions, stamps, sounds, reduced motion (UI-6)', () => {
    const mod = loadGameManager();
    const T = mod.UITheme;
    const canvas = makeFakeCanvas();
    const ctx = makeFakeCtx(canvas);
    const gm = new mod.GameManager(canvas, ctx);
    const S = gm.state.STATES;
    const P = gm.progress;
    const heard = [];
    for (const k of ['playClick', 'playWhoosh', 'playStamp', 'playStar']) {
        mod.Sound[k] = (...a) => heard.push(k + (a.length ? a[0] : ''));
    }
    const counting = () => {
        const c = makeFakeCtx(canvas);
        c.rects = 0;
        c.fillRect = () => { c.rects++; return c; };
        return c;
    };

    // Transition: a cheap eased fade (at most two fills) with a thin line near full dark.
    gm.state.transitioning = true;
    let most = 0;
    for (let p = 0; p <= 1.0001; p += 0.05) {
        gm.state.transitionProgress = p;
        const c = counting();
        gm.state._renderTransition(c);
        most = Math.max(most, c.rects);
    }
    ok('transition stays cheap (at most two fills a frame)', most === 2, String(most));
    gm.state.transitionProgress = 0.5;
    const a = counting();
    gm.state._renderTransition(a);
    ok('fully dark mid-way, with the centre line', a.rects === 2);
    T.reducedMotion = true;
    const b = counting();
    gm.state._renderTransition(b);
    ok('reduced motion: a plain fade', b.rects === 1, String(b.rects));
    const g = counting();
    T.glitch(g, 960, 640, 1, 0.5);
    ok('reduced motion: no glitch overlay', g.rects === 0);
    T.reducedMotion = false;
    const g2 = counting();
    T.glitch(g2, 960, 640, 1, 0.5);
    ok('glitch overlay draws normally', g2.rects > 10);
    gm.state.transitioning = false;

    // Sounds: a screen change whooshes, buttons click (the pause button stays silent).
    heard.length = 0;
    settle(gm, S.MENU);
    gm.state.change(S.HUB);
    ok('screen change whooshes', heard.includes('playWhoosh'));
    settle(gm, S.HUB);
    heard.length = 0;
    gm.ui.clearButtons();
    gm.ui.addButton('x', 'X', 100, 100, 80, 40, () => {});
    gm.ui.addButton('pause', '', 300, 300, 60, 48, () => {}, { exact: true });
    gm.ui.handleClick(100, 100);
    gm.ui.handleClick(300, 300);
    ok('buttons click, pause is silent', heard.filter(h => h === 'playClick').length === 1);

    // Result: one stamp and one chime per lit star, each exactly once.
    heard.length = 0;
    gm._resultStars = { n: 2, t: 0, newBest: false };
    for (let k = 0; k < 120; k++) gm._tickResultStars(1 / 60);
    ok('stamp + a chime per lit star', heard.join(',') === 'playStamp,playStar0,playStar1', heard.join(','));
    const r = counting();
    gm._drawResultStars(r, 480, 400);
    ok('result panel renders', true);

    // SECURED stamp: armed by an act clear, slams when the HUB shows the act.
    for (let i = 0; i < 3; i++) P.completeStage(1, i, 100);
    gm._stage = { actId: 1, index: 3 };
    settle(gm, S.LEVEL);
    gm._onStageCleared(100, 0);
    ok('act clear arms the SECURED stamp', !!gm._securedAnim && gm._securedAnim.actId === 1 && gm._securedAnim.t === null);
    settle(gm, S.HUB);
    gm._actView = 1;
    const H = gm.state._handlers[S.HUB];
    H.enter();
    ok('HUB starts it after the screen change', gm._securedAnim.t < 0);
    heard.length = 0;
    for (let k = 0; k < 90; k++) H.update(1 / 60);
    H.render(ctx, 0);
    ok('the stamp lands with a thud', heard.includes('playStamp'));
    for (let k = 0; k < 60; k++) H.update(1 / 60);
    ok('and is done', gm._securedAnim === null);

    // Reduced motion skips the act-screen fill, the SECURED slam and parallax.
    T.reducedMotion = true;
    P.completeStage(2, 0, 0);   // locked: no effect
    gm.progress.openGate(1);
    gm._stage = { actId: 2, index: 0 };
    settle(gm, S.LEVEL);
    gm._onStageCleared(100, 0);
    ok('reduced motion: no ladder fill effect', gm._ladderAnim === null);
    settle(gm, S.HUB);
    H.enter();
    gm._mapScroll = 3;
    H.update(1 / 60);
    ok('reduced motion: no parallax', gm._bgShift === 0);
    T.reducedMotion = false;
});

// ─────────────────────────────────────────────
suite('Endless slot + lobby (only after the final act)', () => {
    const mod = loadGameManager();
    const canvas = makeFakeCanvas();
    const ctx = makeFakeCtx(canvas);
    const gm = new mod.GameManager(canvas, ctx);
    const S = gm.state.STATES;
    const btn = (id) => gm.ui.buttons.find(b => b.id === id);
    const go = (state, c) => { settle(gm, state); gm.state._handlers[state].enter(c); };

    // Locked: the lobby bounces back to the HUB.
    go(S.ENDLESS_HUB);
    ok('locked lobby sends you back', gm.state.pendingState === S.HUB);

    gm.progress.data.endlessUnlocked = true;
    go(S.HUB);
    ok('Endless players land on the Endless slot', gm._mapIndex === 10 && gm._mapCount() === 11 && !!btn('endless-card'));
    ok('no Endless buttons under the cards', !btn('endless') && !btn('leaderboard'));
    ok('previous act peeks on the left, nothing on the right', !!btn('act10') && !btn('map-next') && !!btn('map-prev'));
    gm.render(ctx, 0);
    gm.state._handlers[S.HUB].render(ctx, 0);
    ok('HUB with the Endless card renders', true);
    gm._mapGo(9);
    ok('act 10 has the Endless card peeking on its right', !!btn('endless-side') && !!btn('map-next'));
    gm._mapGo(10);
    btn('endless-card').onClick();
    ok('the card opens the Endless lobby', gm.state.pendingState === S.ENDLESS_HUB);

    // Lobby: play, leaderboard, back.
    go(S.ENDLESS_HUB);
    ok('lobby has play, leaderboard and back', !!btn('endless-play') && !!btn('endless-board') && !!btn('back'));
    ok('play is focused', gm.ui.focusId === 'endless-play');
    gm.state._handlers[S.ENDLESS_HUB].render(ctx, 0);
    btn('endless-play').onClick();
    ok('play starts a run', gm.state.pendingState === S.ENDLESS);
    go(S.ENDLESS_HUB);
    btn('endless-board').onClick();
    ok('leaderboard opens from the lobby', gm.state.pendingState === S.LEADERBOARD);

    // Everything Endless returns to the lobby.
    go(S.LEADERBOARD);
    btn('leaderboard-hub').onClick();
    ok('leaderboard back goes to the lobby', gm.state.pendingState === S.ENDLESS_HUB);
    go(S.ENDLESS_OVER, { score: 10, wave: 2, hitCount: 3, noRevive: true });
    btn('hub').onClick();
    ok('run over goes back to the lobby', gm.state.pendingState === S.ENDLESS_HUB);
    settle(gm, S.LEADERBOARD);
    gm.handleBrowserBack();
    ok('back gesture: leaderboard -> lobby', gm.state.pendingState === S.ENDLESS_HUB);
    settle(gm, S.ENDLESS_HUB);
    gm.handleBrowserBack();
    ok('back gesture: lobby -> HUB', gm.state.pendingState === S.HUB);

    // HUB focus follows where you were: an act after visiting it, Endless after the lobby.
    go(S.ACT, { actId: 3 });
    go(S.HUB);
    ok('after an act the HUB shows that act', gm._mapIndex === 2);
    go(S.ENDLESS_HUB);
    go(S.HUB);
    ok('after the lobby the HUB shows Endless again', gm._mapIndex === 10);

    // Keyboard: Enter on the Endless slot opens the lobby.
    gm.ui.focusId = null;
    gm._handleUiNavKey('Enter');
    ok('Enter opens the lobby', gm.state.pendingState === S.ENDLESS_HUB);
});

// ─────────────────────────────────────────────
suite('Endless welcome menu + campaign-complete screen', () => {
    const mod = loadGameManager();
    const canvas = makeFakeCanvas();
    const gm = new mod.GameManager(canvas, makeFakeCtx(canvas));
    const S = gm.state.STATES;
    const btn = (id) => gm.ui.buttons.find(b => b.id === id);
    const textsOf = (state) => {
        const out = [];
        const spy = makeFakeCtx(canvas);
        spy.fillText = (t) => { out.push(String(t)); return spy; };
        spy.measureText = () => ({ width: 100 });
        gm.state._handlers[state].render(spy, 0);
        return out;
    };
    const enter = (state) => { settle(gm, state); gm.ui.clearButtons(); gm.state._handlers[state].enter(); };

    enter(S.MENU);
    let t = textsOf(S.MENU);
    ok('new players get the story menu', t.some(x => /\[WARNING\]/.test(x)) && btn('start').label.indexOf('START MISSION') >= 0);

    gm.progress.data.endlessUnlocked = true;
    enter(S.MENU);
    t = textsOf(S.MENU);
    ok('Endless players get the welcome screen', t.includes('SYNCBREAKER') && t.includes('ENDLESS OPERATOR') && t.includes('> STATUS REPORT'));
    ok('no story on the welcome screen', !t.some(x => /\[WARNING\]|YOUR MISSION|infiltrated/.test(x)));
    ok('status says the game is endless now', t.some(x => /game is endless/.test(x)) && t.some(x => /Every node is clean/.test(x)));
    ok('gold ENTER button', /ENTER/.test(btn('start').label) && btn('start').color === '#facc15');
    ok('footer still shown', t.includes('v3.0 · Written by dormhi'));
    btn('start').onClick();
    ok('ENTER goes to the act map', gm.state.pendingState === S.HUB);

    enter(S.CONGRATS);
    t = textsOf(S.CONGRATS);
    ok('congrats tells the 10-act story', t.includes('CONTROL RETURNED') && t.some(x => /ALL 10 ACTS COMPLETE/.test(x)) &&
        t.some(x => /handed the system back to its owner/.test(x)));
    ok('every status cleared', ['PERIMETER', 'INTERNAL', 'CORE', 'HANDOVER'].every(k => t.includes('✓ ' + k)));
    ok('points to the Endless ring', t.includes('ENDLESS MODE UNLOCKED') && t.some(x => /∞ ring/.test(x)));
    ok('stars and best score totals', t.some(x => /★ \d+\/\d+/.test(x) && /TOTAL BEST SCORE/.test(x)));
});

// ─────────────────────────────────────────────
suite('Menu status report follows progress', () => {
    const mod = loadGameManager();
    const canvas = makeFakeCanvas();
    const gm = new mod.GameManager(canvas, makeFakeCtx(canvas));
    const P = gm.progress;
    const text = () => gm._menuStatusLines().map(l => l.text);

    ok('a new player reads the intro story', text().some(t => /under cyber attack/.test(t)) && text().some(t => /YOUR MISSION/.test(t)));
    P.completeStage(1, 0, 100, 2);
    let t = text();
    ok('after a first clear: perimeter warning', /inside the PERIMETER/.test(t[0]) && !t.some(x => /YOUR MISSION/.test(x)));
    ok('first stages line and next stage', t.some(x => /First stages cleared in ACT 1/.test(x)) &&
        t.some(x => /ACT 1 · REMOVE_MALWARE \(TIMING BAR\) — 1\/4 stages cleared/.test(x)));
    ok('stars counted', t.some(x => /0 of 10 acts cleared · ★ 2\//.test(x)));
    for (let i = 1; i < 4; i++) P.completeStage(1, i, 100);
    t = text();
    ok('cleared act is listed and the gate is next', t.some(x => x === 'Secured so far: malware purged.') && t.some(x => /Breach GATE 1 to reach ACT 2/.test(x)));
    // Through act 4: the INTERNAL layer, then a breachable gate 4.
    const clear = (a) => { P.act(a).stages.forEach((st, i) => P.completeStage(a, i, 100)); P.openGate(a); };
    P.openGate(1); clear(2); clear(3);
    P.act(4).stages.forEach((st, i) => P.completeStage(4, i, 100));
    t = text();
    ok('internal layer alert', /INTERNAL network/.test(t[0]));
    ok('four acts secured', t.some(x => x === 'Secured so far: malware purged, firewall rebuilt, ports sealed, credentials reset.'));
    clear(4); clear(5);
    t = text();
    ok('long lists keep the latest four', t.some(x => x === 'Secured so far: …, firewall rebuilt, ports sealed, credentials reset, attacker traced.'));
    ok('next act still in development', t.some(x => /ACT 6 · CUT_ACCESS is still in development/.test(x)));
    ok('the report fits the menu panel', gm._menuStatusLines().length <= 13);
});

// ─────────────────────────────────────────────
Promise.all(pendingSuites).then(() => {
    console.log('\n' + '─'.repeat(50));
    console.log(`PASS ${passed}   FAIL ${failed}`);
    if (failures.length) {
        console.log('\nFailures:');
        for (const f of failures) console.log('  ✗ ' + f);
        process.exit(1);
    }
    console.log('All tests passed.');
});
