/* =========================================
   utils.js — Utility functions
   ========================================= */

const Utils = {
    clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    },

    lerp(a, b, t) {
        return a + (b - a) * t;
    },

    degToRad(deg) {
        return deg * (Math.PI / 180);
    },

    radToDeg(rad) {
        return rad * (180 / Math.PI);
    },

    randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    randFloat(min, max) {
        return Math.random() * (max - min) + min;
    },

    // Easing
    easeOutQuad(t) {
        return 1 - (1 - t) * (1 - t);
    },

    easeOutElastic(t) {
        const c4 = (2 * Math.PI) / 3;
        return t === 0 ? 0 : t === 1 ? 1
            : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },

    // Canvas helpers
    roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    },

    formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }
};

// Logical canvas size. All layout, drawing and input use these units; the
// backing store is scaled up for sharp rendering on high-DPI screens
// (see main.js), so never read canvas.width / canvas.height for layout.
const VIEW = { W: 960, H: 640 };
