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
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = UITheme;
