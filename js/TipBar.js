/* =========================================
   TipBar.js — Quiet rotating hint line (HUB / act screen)

   One dim line at the bottom of menu screens. Tips rotate with a soft
   cross-fade and adapt to the last input used: a tip may be a string, or
   { desktop, touch } with a variant per input kind.

   TipBar.RULES: in-game rule reminders a game shows while it is played
   (it keeps its own TipBar for the rotation and draws the box itself).
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
        const text = typeof tip === 'string' ? tip : (mode === 'touch' ? tip.touch : tip.desktop) || tip.desktop || tip.touch || '';
        return typeof I18n !== 'undefined' ? I18n.t(text) : text;
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

        ctx.font = '700 14px Orbitron, OrbitronTR';
        const tag = typeof I18n !== 'undefined' ? I18n.t('TIP') : 'TIP';
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
        ctx.font = '700 14px Orbitron, OrbitronTR';
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
    cut: [
        'Red cables are the ones the attacker reaches — cut them before they touch the CORE',
        'Look for the narrowest point between ATK and CORE: fewer cuts there',
        'Blue cables are the owner\'s own line — cutting one costs a life',
        'Thick cables are armored and need two cuts',
        'A dashed purple cable wakes when the cable with the same letter is cut',
        'Out of lives? The recovery protocol (1⚡) gives one back'
    ],
    bomb: [
        'Check the MANUAL\'s rules from the top — only the first true rule counts',
        'Each strike makes the timer run faster — slow down before you cut',
        'TRIGGER: lit wires carry a 1 — turn the DETONATE lamp off before your flips run out',
        'KILL SWITCH: while holding, watch the strip colour and the timer digits',
        'Out of time? The recovery protocol (1⚡) buys 20 more seconds'
    ],
    defrag: [
        'Fill the awkward corners first — the open middle is easier to finish',
        'Tap a block to turn it; on desktop right click or R works too',
        'A block on the disk can be picked up and moved again',
        'EXPERT: compare each block with the CLEAN SNAPSHOT — corrupted copies go to TRASH',
        'Out of time? The recovery protocol (1⚡) buys 20 more seconds'
    ],
    checksum: [
        'Start with the big numbers: a block longer than half the line always fills its middle',
        'A line whose checksum is complete: mark the rest with ✕',
        'Grey checksums already match — rows and columns help each other',
        'AUDIT is free when there is no mistake; a wrong audit costs a star',
        'No timer here: take your time and never guess'
    ],
    handover: [
        'These missions teach — there is no timer and nothing to lose',
        'Read the cards: every mission ends with three things worth remembering',
        'A wrong choice only explains why — then you try again',
        'Everything here works on your real accounts and devices too'
    ],
    stack: [
        'Blocks keep the crane\'s sideways momentum — release a little early',
        'A wide block makes a steadier base for the next one',
        'The tower must stand still above the line for a moment to count'
    ]
};

// In-game rule reminders: how the game works, for a player who forgot.
TipBar.RULES = {
    checksum: [
        'GOAL: turn every number grey. A number greys out when its row or column matches it.',
        'The numbers are blocks of filled cells, in order: "3 1" = 3 filled, a gap, then 1.',
        'Every row (numbers on the left) and every column (numbers on top) must match.',
        'Blocks in one line always have at least one empty cell between them.',
        { desktop: 'Click fills a cell · right click marks it ✕ (empty) · drag to do a whole line.', touch: 'Tap fills a cell · pick ✕ to mark it empty · drag to do a whole line.' },
        'A block longer than half its line always covers the middle of the line.',
        'AUDIT shows wrong cells: free when there are none, it costs a star when there are.',
        'No timer, no lives: never guess — every grid can be solved by logic.'
    ]
};

if (typeof module !== 'undefined' && module.exports) module.exports = TipBar;
