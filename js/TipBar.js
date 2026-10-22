/* =========================================
   TipBar.js — Quiet rotating hint line (HUB / act screen)

   One dim line at the bottom of menu screens. Tips rotate with a soft
   cross-fade and adapt to the last input used: a tip may be a string, or
   { desktop, touch } with a variant per input kind.
   ========================================= */

class TipBar {
    constructor() {
        this.tips = [];
        this.key = null;
        this.index = 0;
        this.timer = 0;
        this.hold = 7;      // seconds a tip stays
        this.fade = 0.45;   // seconds of fade in / out
    }

    /** Switch tip set; keeps rotating if the set did not change. */
    setTips(key, tips) {
        if (key === this.key) return;
        this.key = key;
        this.tips = tips.filter(Boolean);
        this.index = 0;
        this.timer = 0;
    }

    update(dt) {
        if (this.tips.length < 2) return;
        this.timer += dt;
        if (this.timer >= this.hold) {
            this.timer -= this.hold;
            this.index = (this.index + 1) % this.tips.length;
        }
    }

    current(mode) {
        const tip = this.tips[this.index];
        if (!tip) return '';
        if (typeof tip === 'string') return tip;
        return (mode === 'touch' ? tip.touch : tip.desktop) || tip.desktop || tip.touch || '';
    }

    /** Opacity of the current tip (fades at both ends of its slot). */
    get alpha() {
        if (this.tips.length < 2) return 1;
        const t = this.timer;
        if (t < this.fade) return t / this.fade;
        if (t > this.hold - this.fade) return Math.max(0, (this.hold - t) / this.fade);
        return 1;
    }

    render(ctx, x, y, mode, maxW) {
        const text = this.current(mode);
        if (!text) return;
        ctx.save();
        ctx.globalAlpha = 0.85 * this.alpha;
        ctx.textBaseline = 'middle';

        ctx.font = '700 14px Orbitron';
        const tag = 'TIP';
        const m = ctx.measureText(tag);
        const tagW = ((m && isFinite(m.width)) ? m.width : 18) + 12;

        ctx.font = '500 16px Rajdhani';
        const tm = ctx.measureText(text);
        const textW = Math.min((tm && isFinite(tm.width)) ? tm.width : text.length * 7, maxW - tagW - 8);
        const total = tagW + 8 + textW;
        const left = x - total / 2;

        ctx.strokeStyle = 'rgba(59,130,246,0.55)';
        ctx.lineWidth = 1;
        Utils.roundRect(ctx, left, y - 11, tagW, 22, 11);
        ctx.stroke();
        ctx.fillStyle = '#3b82f6';
        ctx.font = '700 14px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText(tag, left + tagW / 2, y + 1);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '500 16px Rajdhani';
        ctx.textAlign = 'left';
        ctx.fillText(text, left + tagW + 8, y + 1, textW);
        ctx.restore();
    }
}

TipBar.MAP = [
    { desktop: 'Arrow keys + Enter move around the map · Esc goes back', touch: 'Tap an act to see its stages' },
    'Clear every stage of an act, then breach its gate to open the next one',
    { desktop: 'Press H for the field guide', touch: 'Tap ? for the field guide' },
    'Energy refills over time — keep a cell for the recovery protocol',
    `Endless Mode unlocks after ACT ${typeof CAMPAIGN !== 'undefined' ? CAMPAIGN.finalAct : 9}`
];

TipBar.ACT = {
    common: { desktop: 'Enter starts the highlighted stage · Esc goes back', touch: 'Tap a stage to start it' },
    timingbar: [
        'Hit near the centre of the zone for PERFECT — combos multiply your score',
        'Failed? The recovery protocol (1⚡) lets you continue with one life'
    ],
    orbital: [
        'Watch the blinking port — the packet is on its way there',
        'Pink packets hop to a neighbouring port mid-flight',
        'Failed? The recovery protocol (1⚡) lets you continue with one life'
    ],
    signal: [
        'Short taps hold the signal steady — long holds overshoot',
        'Watch the gauge on the right: keep the arrow inside the band',
        'The target flickers just before it jumps',
        'Out of time? The recovery protocol (1⚡) buys 20 more seconds'
    ],
    route: [
        'Green tiles are already connected to you — extend the green line',
        'Work from your node outward; ignore tiles that cannot reach the line',
        'Tiles with a padlock cannot be rotated',
        'Out of time? The recovery protocol (1⚡) buys 20 more seconds'
    ],
    stack: [
        'Blocks keep the crane\'s sideways momentum — release a little early',
        'A wide block makes a steadier base for the next one',
        'The tower must stand still above the line for a moment to count'
    ]
};

if (typeof module !== 'undefined' && module.exports) module.exports = TipBar;
