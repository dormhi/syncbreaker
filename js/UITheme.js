/* =========================================
   UITheme.js — Design tokens + shared interface painters

   Colours, sizes, tier/layer identities and canvas helpers for the
   menu, HUB and act screens (interface redesign: docs/UI_PLAN.md).
   All sizes are logical canvas px (VIEW). The minimums keep text
   readable and taps on target on a phone, where the canvas is drawn
   at ~0.6 scale.
   ========================================= */

const UITheme = {
    color: {
        bg: '#0a0e17',
        panel: 'rgba(15,23,42,0.92)',
        panelHi: 'rgba(30,41,59,0.96)',
        line: 'rgba(71,85,105,0.5)',
        text: '#e2e8f0',
        textDim: '#94a3b8',
        textMute: '#64748b',
        accent: '#3b82f6',
        ok: '#22c55e',
        warn: '#f59e0b',
        danger: '#ef4444',
        locked: '#475569'
    },

    // The player asked the OS for less motion (prefers-reduced-motion):
    // glitches, parallax, pops and wipes are toned down or skipped.
    reducedMotion: false,

    // label is the smallest text allowed on these screens; minTap is the
    // smallest tap target (~44 pt on a phone).
    size: {
        label: 14,
        body: 16,
        title: 20,
        heading: 26,
        minTap: 72
    },

    /** CSS font string for a size role, e.g. font('body') -> '600 16px Rajdhani'. */
    font(role, weight = 600, family = 'Rajdhani') {
        const key = UITheme.size[role] ? role : 'body';
        return `${weight} ${UITheme.size[key]}px ${family}`;
    },

    // Stage difficulty tiers: colour + numeral, so they never rely on colour alone.
    tiers: [
        { key: 'EASY',      numeral: 'I',   color: '#22c55e' },
        { key: 'NORMAL',    numeral: 'II',  color: '#3b82f6' },
        { key: 'HARD',      numeral: 'III', color: '#f59e0b' },
        { key: 'VERY HARD', numeral: 'IV',  color: '#ef4444' },
        { key: 'EXPERT',    numeral: 'V',   color: '#a855f7' }
    ],

    /** Tier entry by name ('VERY HARD', any case) or 0-based index. */
    tier(nameOrIndex) {
        if (typeof nameOrIndex === 'number') return UITheme.tiers[nameOrIndex] || UITheme.tiers[0];
        const key = String(nameOrIndex).toUpperCase();
        return UITheme.tiers.find(t => t.key === key) || UITheme.tiers[0];
    },

    // Network layers the acts belong to (outer perimeter -> core).
    layers: [
        { key: 'PERIMETER', acts: [1, 2, 3], color: '#38bdf8' },
        { key: 'INTERNAL',  acts: [4, 5, 6], color: '#f59e0b' },
        { key: 'CORE',      acts: [7, 8, 9], color: '#ef4444' }
    ],

    // Operator clearance names, one per level (level = acts fully cleared).
    clearance: ['GUEST', 'USER', 'TECH', 'ANALYST', 'OPERATOR', 'ENGINEER', 'ADMIN', 'SECOPS', 'SYSADMIN', 'ROOT'],

    /** 'L4 OPERATOR' style label for a clearance level. */
    clearanceLabel(level) {
        const k = Math.max(0, Math.min(UITheme.clearance.length - 1, level | 0));
        return `L${k} ${UITheme.clearance[k]}`;
    },

    /** Integrity colour: red when compromised, amber midway, green once clean. */
    integrityColor(value) {
        return value >= 1 ? UITheme.color.ok : value >= 0.5 ? UITheme.color.warn : UITheme.color.danger;
    },

    layerOf(actId) {
        return UITheme.layers.find(l => l.acts.indexOf(actId) !== -1) || UITheme.layers[UITheme.layers.length - 1];
    },

    /** Rectangle path with the top-left and bottom-right corners cut at 45°. */
    chamferPath(ctx, x, y, w, h, c) {
        const ch = Math.min(c, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + ch, y);
        ctx.lineTo(x + w, y);
        ctx.lineTo(x + w, y + h - ch);
        ctx.lineTo(x + w - ch, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x, y + ch);
        ctx.closePath();
    },

    /** Chamfered panel. opts: fill, stroke, lineWidth, chamfer, glow (colour), dashed. */
    panel(ctx, x, y, w, h, opts = {}) {
        ctx.save();
        UITheme.chamferPath(ctx, x, y, w, h, opts.chamfer === undefined ? 10 : opts.chamfer);
        if (opts.glow) { ctx.shadowColor = opts.glow; ctx.shadowBlur = 14; }
        ctx.fillStyle = opts.fill || UITheme.color.panel;
        ctx.fill();
        ctx.strokeStyle = opts.stroke || UITheme.color.line;
        ctx.lineWidth = opts.lineWidth || 1.2;
        if (opts.dashed) ctx.setLineDash([8, 7]);
        ctx.stroke();
        ctx.restore();
    },

    /** Tier badge (numeral in a chamfered frame) centred on (cx, cy); size = height. */
    tierBadge(ctx, cx, cy, tier, size = 28, opts = {}) {
        const t = UITheme.tier(tier);
        const color = opts.dim ? UITheme.color.locked : t.color;
        const w = size * 1.5;
        ctx.save();
        ctx.globalAlpha = opts.dim ? 0.4 : 1;
        UITheme.chamferPath(ctx, cx - w / 2, cy - size / 2, w, size, size * 0.25);
        ctx.fillStyle = UITheme.color.panel;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = `700 ${Math.round(size * 0.5)}px Orbitron`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(t.numeral, cx, cy + 1);
        ctx.restore();
    },

    /** Standard text button for a UIManager button (x, y = centre). */
    button(ctx, btn, hovered) {
        const left = btn.x - btn.w / 2, top = btn.y - btn.h / 2;
        ctx.save();
        if (btn.disabled) ctx.globalAlpha = 0.35;
        UITheme.panel(ctx, left, top, btn.w, btn.h, {
            chamfer: 8,
            stroke: btn.color,
            lineWidth: hovered ? 2 : 1.2,
            fill: hovered ? UITheme.color.panelHi : UITheme.color.panel,
            glow: hovered ? btn.color : null
        });
        if (hovered) {
            // Thin scan line just inside the top edge
            ctx.save();
            ctx.globalAlpha = 0.35;
            ctx.strokeStyle = btn.color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(left + 8, top + 4);
            ctx.lineTo(left + btn.w - 4, top + 4);
            ctx.stroke();
            ctx.restore();
        }
        ctx.fillStyle = btn.color;
        ctx.font = UITheme.font('body', 700);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (btn.subtitle && btn.h >= 50) {
            ctx.fillText(btn.label, btn.x, btn.y - 8);
            ctx.fillStyle = UITheme.color.textMute;
            ctx.font = UITheme.font('label', 500);
            ctx.fillText(btn.subtitle, btn.x, btn.y + 12);
        } else {
            ctx.fillText(btn.label, btn.x, btn.y + 1);
        }
        ctx.restore();
    },

    // ── Stars ──

    /** Five-point star centred on (cx, cy), outer radius r. */
    star(ctx, cx, cy, r, filled, color = '#facc15') {
        ctx.save();
        ctx.beginPath();
        for (let k = 0; k < 10; k++) {
            const a = -Math.PI / 2 + k * Math.PI / 5;
            const rr = k % 2 ? r * 0.45 : r;
            ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
        ctx.closePath();
        if (filled) {
            ctx.fillStyle = color;
            ctx.fill();
        } else {
            ctx.strokeStyle = 'rgba(148,163,184,0.55)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
        ctx.restore();
    },

    /** Row of three stars centred on (cx, cy): `n` filled, spaced by `gap`. */
    starRow(ctx, cx, cy, n, r = 8, gap = 20) {
        for (let k = 0; k < 3; k++) UITheme.star(ctx, cx + (k - 1) * gap, cy, r, k < n);
    },

    // ── Colour helpers ──

    /** '#38bdf8' -> [56, 189, 248] */
    rgb(hex) {
        const n = parseInt(String(hex).slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    },

    /** Blend two '#rrggbb' colours; returns an [r, g, b] array. */
    mix(a, b, t) {
        const ca = UITheme.rgb(a), cb = UITheme.rgb(b);
        return ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
    },

    rgba(c, alpha) {
        return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
    },

    // ── Operator status painters ──

    /** 'CLEARANCE  L4 OPERATOR' chip centred on (cx, cy); returns its width. */
    clearanceChip(ctx, cx, cy, level, opts = {}) {
        const color = opts.color || '#38bdf8';
        const label = UITheme.clearanceLabel(level);
        const width = (t) => {
            const m = ctx.measureText(t);
            return (m && isFinite(m.width)) ? m.width : t.length * 8;
        };
        ctx.save();
        ctx.font = UITheme.font('label', 600);
        const w1 = width('CLEARANCE');
        ctx.font = UITheme.font('label', 700, 'Orbitron');
        const w2 = width(label);
        const w = 16 + w1 + 6 + w2 + 16, h = 30;
        const left = cx - w / 2;
        UITheme.panel(ctx, left, cy - h / 2, w, h, { chamfer: 8, stroke: color, lineWidth: 1.2 });
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = UITheme.color.textMute;
        ctx.font = UITheme.font('label', 600);
        ctx.fillText('CLEARANCE', left + 16, cy + 1);
        ctx.fillStyle = color;
        ctx.font = UITheme.font('label', 700, 'Orbitron');
        ctx.fillText(label, left + 16 + w1 + 6, cy + 1);
        ctx.restore();
        return w;
    },

    /** Ten-segment SYSTEM INTEGRITY meter; left edge x, vertical centre y, value 0..1. */
    integrityMeter(ctx, x, y, w, value, opts = {}) {
        const v = Math.max(0, Math.min(1, value));
        const color = UITheme.integrityColor(v);
        const n = 10, gap = 3, segW = (w - gap * (n - 1)) / n;
        ctx.save();
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        ctx.fillStyle = UITheme.color.textMute;
        ctx.font = UITheme.font('label', 600);
        ctx.fillText('SYSTEM INTEGRITY', x, y - 14);
        ctx.textAlign = 'right';
        ctx.fillStyle = color;
        ctx.font = UITheme.font('label', 700, 'Orbitron');
        ctx.fillText(Math.round(v * 100) + '%', x + w, y - 14);
        const filled = v * n;
        for (let k = 0; k < n; k++) {
            UITheme.chamferPath(ctx, x + k * (segW + gap), y - 4, segW, 8, 2);
            if (k + 1 <= filled) {
                ctx.fillStyle = color;
                // A compromised system flickers.
                ctx.globalAlpha = v < 0.5 ? 0.75 + 0.25 * Math.sin((opts.time || 0) * 9 + k) : 1;
            } else if (k < filled) {
                ctx.fillStyle = color;
                ctx.globalAlpha = 0.45;
            } else {
                ctx.fillStyle = 'rgba(71,85,105,0.35)';
                ctx.globalAlpha = 1;
            }
            ctx.fill();
        }
        ctx.restore();
    },

    /** Screen-wide corruption overlay (tear bars, scanlines); strength 0..1. */
    glitch(ctx, W, H, strength, time) {
        if (!(strength > 0) || UITheme.reducedMotion) return;
        const seed = Math.floor(time * 12);
        const h = (k) => Math.abs((Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453) % 1);
        ctx.save();
        const a = 0.06 + 0.10 * strength;
        const bars = Math.round(strength * 6);
        for (let k = 0; k < bars; k++) {
            ctx.fillStyle = k % 2 ? `rgba(56,189,248,${a})` : `rgba(239,68,68,${a})`;
            ctx.fillRect((h(k + 23) - 0.5) * 40 * strength, h(k) * H, W, 2 + h(k + 11) * 10);
        }
        ctx.globalAlpha = strength;
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
        if (h(99) < 0.25 * strength) {
            ctx.globalAlpha = 1;
            ctx.fillStyle = 'rgba(239,68,68,0.35)';
            ctx.fillRect(0, h(98) * H, W, 3);
        }
        ctx.restore();
    }
};

// Follow the OS "reduce motion" setting, also when it changes mid-game.
if (typeof window !== 'undefined' && window.matchMedia) {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    UITheme.reducedMotion = !!mq.matches;
    const onChange = (e) => { UITheme.reducedMotion = !!e.matches; };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
}

if (typeof module !== 'undefined' && module.exports) module.exports = UITheme;
