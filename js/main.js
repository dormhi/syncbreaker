/* =========================================
   main.js — Entry Point + Game Loop
   ========================================= */

(function() {
    'use strict';

    // The owner's data wipe (save epoch): once per browser, before anything reads a save.
    try { ProgressSync.applyEpoch(window.localStorage); } catch (e) { }

    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    const GAME_WIDTH = VIEW.W;
    const GAME_HEIGHT = VIEW.H;

    // Backing-store pixels per logical pixel: matches the screen's real
    // pixel density so text and lines stay sharp, capped at 2 for speed.
    let renderScale = 1;

    function resizeCanvas() {
        const wW = window.innerWidth;
        const wH = window.innerHeight;
        const aspect = GAME_WIDTH / GAME_HEIGHT;
        const wAspect = wW / wH;

        let dW, dH;
        if (wAspect > aspect) {
            dH = wH;
            dW = dH * aspect;
        } else {
            dW = wW;
            dH = dW / aspect;
        }

        // Sharp on big screens: up to 3× with a mouse (a full-screen 4K canvas is
        // ~3200 px wide), 2× on touch screens, where more pixels only cost battery.
        const dpr = window.devicePixelRatio || 1;
        const touch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
        renderScale = Math.round(Math.min(touch ? 2 : 3, Math.max(1, dW * dpr / GAME_WIDTH)) * 100) / 100;
        canvas.width = Math.round(GAME_WIDTH * renderScale);
        canvas.height = Math.round(GAME_HEIGHT * renderScale);
        canvas.style.width = dW + 'px';
        canvas.style.height = dH + 'px';
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const game = new GameManager(canvas, ctx);

    // Fixed-timestep loop: simulation is frame-rate independent, render is
    // interpolated. Replaces the old variable-dt loop that clamped positive
    // deltas to 1/30 and put slow devices into slow motion.
    const loop = new GameLoop({
        fixedDt: 1 / 60,
        maxSubSteps: 5,
        update: (dt) => game.update(dt),
        render: (alpha) => {
            // Resizing resets the context, so set the scale every frame.
            ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
            game.render(ctx, alpha);
        }
    });

    if (typeof window !== 'undefined') window.syncbreakerLoop = loop;
    loop.start();

    // Phones held upright: the game is landscape-only for now, so show the
    // "rotate your device" overlay (CSS, same media query) and pause.
    const portrait = window.matchMedia
        ? window.matchMedia('(orientation: portrait) and (pointer: coarse)')
        : null;
    function applyOrientation() {
        const upright = !!(portrait && portrait.matches);
        if (upright) game._releaseHold('all');
        loop.setPaused(upright);
    }
    if (portrait) {
        if (portrait.addEventListener) portrait.addEventListener('change', applyOrientation);
        else if (portrait.addListener) portrait.addListener(applyOrientation);
    }
    applyOrientation();

    // Back button / back swipe steps back inside the game instead of
    // leaving the site (warns first during play; see handleBrowserBack).
    new BackGuard(window, () => game.handleBrowserBack());
})();
