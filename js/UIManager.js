/* =========================================
   UIManager.js — UI Drawing Helper
   Simple, beta appearance
   ========================================= */

class UIManager {
    constructor(ctx, canvas) {
        this.ctx = ctx;
        this.canvas = canvas;
        this.buttons = [];
        this.mouseX = 0;
        this.mouseY = 0;
        // Keyboard focus (arrow keys + Enter). Stored by id because button
        // lists are rebuilt on every screen change.
        this.focusId = null;
    }

    // ── Button system ──

    addButton(id, label, x, y, w, h, onClick, style = {}) {
        this.buttons.push({
            id, label, x, y, w, h, onClick,
            color: style.color || '#3b82f6',
            disabled: style.disabled || false,
            subtitle: style.subtitle || null,
            // Card style (level selector)
            card: style.card || false,
            custom: style.custom || null,
            icon: style.icon,
            status: style.status || null, // 'completed' | 'unlocked' | 'locked'
            score: style.score || 0,
            hidden: style.hidden || false,
            focusable: style.focusable !== false,
            // Exact hit area only (in-game buttons, so near taps reach the game)
            exact: style.exact || false,
            // Custom painter: draw(ctx, btn, highlighted)
            draw: style.draw || null
        });
    }

    /** Energy cell geometry — must match renderEnergyBar() exactly. */
    getEnergyCellRect(index, max) {
        const W = VIEW.W;
        const x = W - 170;
        const y = 12;
        const cellW = 22;
        const cellH = 14;
        const gap = 3;
        if (index < 0 || index >= max) return null;
        return { x: x + index * (cellW + gap), y, w: cellW, h: cellH };
    }

    clearButtons() {
        this.buttons = [];
        this.focusId = null;
    }

    updateMouse(x, y) {
        this.mouseX = x;
        this.mouseY = y;
        // The mouse takes over: drop the keyboard highlight.
        this.focusId = null;
    }

    // ── Keyboard focus ──

    _focusables() {
        return this.buttons.filter(b => !b.hidden && !b.disabled && b.focusable);
    }

    get focused() {
        return this._focusables().find(b => b.id === this.focusId) || null;
    }

    focus(id) {
        if (this._focusables().some(b => b.id === id)) this.focusId = id;
    }

    /**
     * Move focus to the nearest button in a direction
     * ('up' | 'down' | 'left' | 'right'). With nothing focused yet, the
     * first focusable button is picked.
     */
    moveFocus(dir) {
        const list = this._focusables();
        if (!list.length) return false;
        const cur = this.focused;
        if (!cur) { this.focusId = list[0].id; return true; }
        const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
        if (!v) return false;
        let best = null, bestScore = Infinity;
        for (const b of list) {
            if (b === cur) continue;
            const dx = b.x - cur.x, dy = b.y - cur.y;
            const along = dx * v[0] + dy * v[1];
            if (along <= 1) continue;
            const across = Math.abs(dx * v[1] - dy * v[0]);
            const score = along + across * 2;
            if (score < bestScore) { bestScore = score; best = b; }
        }
        if (best) this.focusId = best.id;
        return !!best;
    }

    /** Press the focused button. @returns {boolean} true if one was pressed. */
    activateFocus() {
        const b = this.focused;
        if (!b) return false;
        UIManager.clickSound();
        b.onClick();
        return true;
    }

    handleClick(x, y) {
        for (const btn of this.buttons) {
            if (btn.disabled) continue;
            const inX = x >= btn.x - btn.w / 2 && x <= btn.x + btn.w / 2;
            const inY = y >= btn.y - btn.h / 2 && y <= btn.y + btn.h / 2;
            if (inX && inY) {
                // In-game buttons (pause) stay silent: taps there are gameplay-adjacent.
                if (!btn.exact) UIManager.clickSound();
                btn.onClick();
                return true;
            }
        }
        // Near miss: small buttons get a tap area of at least minTap, and
        // the closest one wins. Exact hits above always take priority.
        const min = UITheme.size.minTap;
        let best = null, bestD = Infinity;
        for (const btn of this.buttons) {
            if (btn.disabled || btn.exact) continue;
            const hw = Math.max(btn.w, min) / 2, hh = Math.max(btn.h, min) / 2;
            const dx = Math.abs(x - btn.x), dy = Math.abs(y - btn.y);
            if (dx > hw || dy > hh) continue;
            const d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; best = btn; }
        }
        if (best) {
            UIManager.clickSound();
            best.onClick();
            return true;
        }
        return false;
    }

    isHovered(btn) {
        if (this.focusId !== null && btn.id === this.focusId) return true;
        const inX = this.mouseX >= btn.x - btn.w / 2 && this.mouseX <= btn.x + btn.w / 2;
        const inY = this.mouseY >= btn.y - btn.h / 2 && this.mouseY <= btn.y + btn.h / 2;
        return inX && inY;
    }

    static clickSound() {
        if (typeof Sound !== 'undefined' && Sound.playClick) Sound.playClick();
    }

    // ── Render ──

    renderButtons() {
        const ctx = this.ctx;
        for (const btn of this.buttons) {
            if (btn.hidden) continue;
            if (btn.draw) { btn.draw(ctx, btn, !btn.disabled && this.isHovered(btn)); continue; }
            if (btn.card) { this._renderCard(btn); continue; }
            if (btn.custom === 'sound') { this._renderSoundButton(btn); continue; }
            UITheme.button(ctx, btn, !btn.disabled && this.isHovered(btn));
        }
    }

    // ── Level card ──

    _renderCard(btn) {
        const ctx = this.ctx;
        const left = btn.x - btn.w / 2;
        const top = btn.y - btn.h / 2;
        const w = btn.w;
        const h = btn.h;
        const hovered = !btn.disabled && this.isHovered(btn);
        const locked = btn.status === 'locked';

        ctx.save();
        ctx.globalAlpha = locked ? 0.65 : 1;

        // Frame (with a soft glow on hover)
        ctx.fillStyle = hovered ? 'rgba(30,41,59,0.95)' : 'rgba(15,23,42,0.9)';
        ctx.strokeStyle = btn.color;
        ctx.lineWidth = hovered ? 2 : 1.2;
        if (hovered) { ctx.shadowColor = btn.color; ctx.shadowBlur = 14; }
        Utils.roundRect(ctx, left, top, w, h, 10);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Status accent stripe
        ctx.fillStyle = btn.color;
        ctx.globalAlpha = locked ? 0.25 : 0.9;
        Utils.roundRect(ctx, left, top, 4, h, 2);
        ctx.fill();
        ctx.globalAlpha = locked ? 0.65 : 1;

        // Icon badge
        const iconX = left + 34;
        const iconY = btn.y;
        ctx.strokeStyle = btn.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(iconX, iconY, 19, 0, Math.PI * 2);
        ctx.stroke();
        if (typeof LevelIcons !== 'undefined' && btn.icon !== undefined) {
            ctx.save();
            ctx.translate(iconX, iconY);
            LevelIcons.draw(ctx, btn.icon, 20, btn.color);
            ctx.restore();
        }

        // Text block — clipped to the card so long names never spill out
        ctx.save();
        ctx.beginPath();
        ctx.rect(left + 54, top + 2, w - 60, h - 4);
        ctx.clip();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

        const textX = left + 58;
        const textMaxW = w - 68;

        // Name
        ctx.fillStyle = locked ? '#64748b' : '#e2e8f0';
        ctx.font = '600 16px Orbitron';
        ctx.fillText(this._fitText(btn.label, textMaxW), textX, top + 30);

        // Description
        if (btn.subtitle) {
            ctx.fillStyle = '#64748b';
            ctx.font = '400 14px Rajdhani';
            ctx.fillText(this._fitText(btn.subtitle, textMaxW), textX, top + 48);
        }

        // Status line
        if (btn.status === 'completed') {
            ctx.fillStyle = '#22c55e';
            ctx.font = '500 14px Rajdhani';
            ctx.fillText('CLEARED', textX, top + h - 13);
        } else if (locked) {
            // Site-coloured vector lock (no emoji)
            this._drawLockGlyph(ctx, textX, top + h - 22, 10, '#94a3b8');
            ctx.fillStyle = '#94a3b8';
            ctx.font = '600 14px Rajdhani';
            ctx.fillText('LOCKED', textX + 15, top + h - 13);
        } else {
            ctx.fillStyle = '#3b82f6';
            ctx.font = '500 14px Rajdhani';
            ctx.fillText('READY', textX, top + h - 13);
        }

        // Best score
        if (btn.score > 0) {
            ctx.textAlign = 'right';
            ctx.fillStyle = '#475569';
            ctx.font = '400 14px Rajdhani';
            ctx.fillText('BEST ' + btn.score, left + w - 12, top + h - 13);
        }

        ctx.restore();

        ctx.restore();
    }

    /** Small vector padlock in a given colour. (x, y) is the body top-left. */
    _drawLockGlyph(ctx, x, y, size, color) {
        const w = size;
        const h = size * 0.78;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.2, size * 0.16);
        ctx.lineCap = 'round';
        // Shackle
        ctx.beginPath();
        ctx.arc(x + w / 2, y, w * 0.3, Math.PI, 0, false);
        ctx.stroke();
        // Body
        Utils.roundRect(ctx, x, y, w, h, size * 0.18);
        ctx.stroke();
        ctx.restore();
    }

    /** Compact speaker button (muted = crossed out). */
    _renderSoundButton(btn) {
        const ctx = this.ctx;
        const left = btn.x - btn.w / 2;
        const top = btn.y - btn.h / 2;
        const hovered = !btn.disabled && this.isHovered(btn);
        const muted = !!btn.muted;
        const color = muted ? '#64748b' : '#94a3b8';

        ctx.save();
        ctx.fillStyle = hovered ? 'rgba(30,41,59,0.85)' : 'rgba(15,23,42,0.55)';
        ctx.strokeStyle = 'rgba(100,116,139,0.35)';
        ctx.lineWidth = 1;
        Utils.roundRect(ctx, left, top, btn.w, btn.h, 8);
        ctx.fill();
        ctx.stroke();

        const cx = btn.x, cy = btn.y, s = 9;
        ctx.fillStyle = color;
        ctx.strokeStyle = color;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        // Speaker body
        ctx.beginPath();
        ctx.moveTo(cx - s, cy - s * 0.38);
        ctx.lineTo(cx - s * 0.4, cy - s * 0.38);
        ctx.lineTo(cx + s * 0.3, cy - s * 0.95);
        ctx.lineTo(cx + s * 0.3, cy + s * 0.95);
        ctx.lineTo(cx - s * 0.4, cy + s * 0.38);
        ctx.lineTo(cx - s, cy + s * 0.38);
        ctx.closePath();
        ctx.fill();

        if (muted) {
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(cx + s * 0.6, cy - s * 0.45);
            ctx.lineTo(cx + s * 1.15, cy + s * 0.45);
            ctx.moveTo(cx + s * 1.15, cy - s * 0.45);
            ctx.lineTo(cx + s * 0.6, cy + s * 0.45);
            ctx.stroke();
        } else {
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.arc(cx + s * 0.4, cy, s * 0.55, -Math.PI / 3, Math.PI / 3);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(cx + s * 0.4, cy, s * 0.9, -Math.PI / 3, Math.PI / 3);
            ctx.stroke();
        }

        ctx.restore();
    }

    /** Truncate text with an ellipsis so it fits `maxWidth` at the current font. */
    _fitText(text, maxWidth) {
        if (!text) return '';
        const ctx = this.ctx;
        const widthOf = (s) => {
            try {
                const m = ctx.measureText(s);
                return (m && typeof m.width === 'number' && isFinite(m.width)) ? m.width : 0;
            } catch (e) { return 0; }
        };
        if (widthOf(text) <= maxWidth) return text;
        const ell = '…';
        let lo = 0, hi = text.length;
        while (lo < hi) {
            const mid = Math.ceil((lo + hi) / 2);
            if (widthOf(text.slice(0, mid) + ell) <= maxWidth) lo = mid;
            else hi = mid - 1;
        }
        return text.slice(0, lo) + ell;
    }

    renderEnergyBar(energy) {
        const ctx = this.ctx;
        const W = VIEW.W;
        const x = W - 170;
        const y = 12;
        const cellW = 22;
        const cellH = 14;
        const gap = 3;

        ctx.save();

        // Label
        ctx.fillStyle = '#64748b';
        ctx.font = '500 14px Rajdhani';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText('ENERGY', x - 8, y + cellH / 2);

        // Cells
        for (let i = 0; i < energy.max; i++) {
            const cx = x + i * (cellW + gap);
            const filled = i < energy.current;

            ctx.fillStyle = filled ? '#3b82f6' : 'rgba(59,130,246,0.15)';
            ctx.strokeStyle = filled ? '#3b82f6' : '#1e293b';
            ctx.lineWidth = 1;
            Utils.roundRect(ctx, cx, y, cellW, cellH, 3);
            ctx.fill();
            ctx.stroke();
        }

        // Timer
        if (energy.current < energy.max) {
            const timeStr = Utils.formatTime(energy.nextRegenIn);
            ctx.fillStyle = '#64748b';
            ctx.font = '400 14px Rajdhani';
            ctx.textAlign = 'center';
            ctx.fillText(`+1 ${timeStr}`, x + (energy.max * (cellW + gap)) / 2, y + cellH + 14);
        }

        ctx.restore();
    }

    renderScore(score, combo) {
        const ctx = this.ctx;
        ctx.save();
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '700 24px Orbitron';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(score.toString().padStart(6, '0'), 16, 14);

        if (combo > 1) {
            ctx.fillStyle = '#f59e0b';
            ctx.font = '600 18px Orbitron';
            ctx.fillText(`x${combo}`, 16, 46);
        }
        ctx.restore();
    }
}
