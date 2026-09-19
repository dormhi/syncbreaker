/* =========================================
   LevelIcons.js — Vector mission logos
   Drawn on the timing-bar slider. Each logo is line art centered on the
   current transform origin, fitting a `size` box. No emoji — these are
   crisp vector glyphs that represent the level's mission.
   ========================================= */

const LevelIcons = {
    /**
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} levelId
     * @param {number} size   bounding box (px)
     * @param {string} color
     */
    draw(ctx, levelId, size, color) {
        const fn = this['lvl' + levelId] || this.fallback;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = Math.max(1.4, size * 0.11);
        fn.call(this, ctx, size);
        ctx.restore();
    },

    // Unknown level — a small target reticle
    fallback(ctx, s) {
        ctx.beginPath(); ctx.arc(0, 0, s * 0.28, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, s * 0.07, 0, Math.PI * 2); ctx.fill();
    },

    // 1 — CLEAR_LOGS: a log file / document
    lvl1(ctx, s) {
        const w = s * 0.6, h = s * 0.84, fold = s * 0.2;
        const x = -w / 2, y = -h / 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + w - fold, y);
        ctx.lineTo(x + w, y + fold);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + w - fold, y);
        ctx.lineTo(x + w - fold, y + fold);
        ctx.lineTo(x + w, y + fold);
        ctx.stroke();
        for (let i = 0; i < 3; i++) {
            const ly = y + h * 0.44 + i * h * 0.16;
            ctx.beginPath();
            ctx.moveTo(x + w * 0.18, ly);
            ctx.lineTo(x + w * (i === 2 ? 0.58 : 0.82), ly);
            ctx.stroke();
        }
    },

    // 2 — CLOSE_PORTS: an RJ45 network port
    lvl2(ctx, s) {
        const w = s * 0.72, h = s * 0.6;
        ctx.beginPath();
        Utils.roundRect(ctx, -w / 2, -h / 2, w, h, s * 0.08);
        ctx.stroke();
        const iw = w * 0.6, ih = h * 0.4;
        const iy = -h * 0.02;
        ctx.beginPath();
        Utils.roundRect(ctx, -iw / 2, iy - ih / 2, iw, ih, s * 0.04);
        ctx.stroke();
        for (let i = 0; i < 4; i++) {
            const cx = -iw / 2 + iw * (i + 1) / 5;
            ctx.beginPath();
            ctx.moveTo(cx, iy - ih / 2 + s * 0.02);
            ctx.lineTo(cx, iy + ih * 0.1);
            ctx.stroke();
        }
    },

    // 3 — REMOVE_MALWARE: a bug with a strike-through
    lvl3(ctx, s) {
        ctx.beginPath(); ctx.ellipse(0, s * 0.08, s * 0.19, s * 0.25, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -s * 0.23, s * 0.12, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-s * 0.07, -s * 0.32); ctx.lineTo(-s * 0.16, -s * 0.45); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s * 0.07, -s * 0.32); ctx.lineTo(s * 0.16, -s * 0.45); ctx.stroke();
        for (let i = 0; i < 3; i++) {
            const ly = -s * 0.04 + i * s * 0.13;
            ctx.beginPath(); ctx.moveTo(-s * 0.15, ly); ctx.lineTo(-s * 0.33, ly - s * 0.05); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(s * 0.15, ly); ctx.lineTo(s * 0.33, ly - s * 0.05); ctx.stroke();
        }
        // "removed" slash
        ctx.lineWidth = Math.max(1.8, s * 0.13);
        ctx.beginPath(); ctx.moveTo(-s * 0.36, -s * 0.36); ctx.lineTo(s * 0.36, s * 0.4); ctx.stroke();
    },

    // 4 — RESET_CREDS: a key
    lvl4(ctx, s) {
        ctx.beginPath(); ctx.arc(-s * 0.2, -s * 0.08, s * 0.16, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(-s * 0.2, -s * 0.08, s * 0.055, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-s * 0.08, s * 0.04); ctx.lineTo(s * 0.34, s * 0.32); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s * 0.2, s * 0.2); ctx.lineTo(s * 0.29, s * 0.12); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s * 0.3, s * 0.29); ctx.lineTo(s * 0.39, s * 0.21); ctx.stroke();
    },

    // 5 — FIREWALL: a brick wall
    lvl5(ctx, s) {
        const w = s * 0.82, h = s * 0.66, rows = 3;
        const rh = h / rows, x = -w / 2, y = -h / 2;
        ctx.beginPath(); Utils.roundRect(ctx, x, y, w, h, s * 0.05); ctx.stroke();
        for (let r = 1; r < rows; r++) {
            const ly = y + r * rh;
            ctx.beginPath(); ctx.moveTo(x, ly); ctx.lineTo(x + w, ly); ctx.stroke();
        }
        for (let r = 0; r < rows; r++) {
            const ly = y + r * rh;
            const n = (r % 2 === 0) ? 1 : 2; // staggered bricks
            for (let c = 1; c <= n; c++) {
                const cx = x + w * c / (n + 1);
                ctx.beginPath(); ctx.moveTo(cx, ly); ctx.lineTo(cx, ly + rh); ctx.stroke();
            }
        }
    },

    // 6 — CUT_ACCESS: scissors
    lvl6(ctx, s) {
        ctx.beginPath(); ctx.arc(-s * 0.22, s * 0.3, s * 0.1, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(s * 0.22, s * 0.3, s * 0.1, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-s * 0.28, s * 0.18); ctx.lineTo(s * 0.34, -s * 0.36); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s * 0.28, s * 0.18); ctx.lineTo(-s * 0.34, -s * 0.36); ctx.stroke();
    },

    // 999 — ENDLESS: infinity
    lvl999(ctx, s) {
        const h = s * 0.5, w = s * 0.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(-w * 0.5, -h, -w, -h, -w, 0);
        ctx.bezierCurveTo(-w, h, -w * 0.5, h, 0, 0);
        ctx.bezierCurveTo(w * 0.5, -h, w, -h, w, 0);
        ctx.bezierCurveTo(w, h, w * 0.5, h, 0, 0);
        ctx.closePath();
        ctx.stroke();
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = LevelIcons;
