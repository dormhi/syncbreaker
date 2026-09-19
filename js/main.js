/* =========================================
   main.js — Entry Point + Game Loop
   ========================================= */

(function() {
    'use strict';

    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    const GAME_WIDTH = 960;
    const GAME_HEIGHT = 640;

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

        canvas.width = GAME_WIDTH;
        canvas.height = GAME_HEIGHT;
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
        render: (alpha) => game.render(ctx, alpha)
    });

    if (typeof window !== 'undefined') window.syncbreakerLoop = loop;
    loop.start();
})();
