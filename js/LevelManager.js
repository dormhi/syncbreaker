/* =========================================
   LevelManager.js — Level Manager
   Timing bar mechanic + level data
   ========================================= */

class LevelManager {
    constructor() {
        this.levels = this._createLevels();
        this.currentLevelIndex = -1;
        this.currentLevel = null;

        // In-game
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.lives = 3;
        this.timer = 0;
        this.usedRevive = false; // 1 revive per level

        // Timing bar
        this.barPosition = 0;
        this.barSpeed = 1;
        this.barDirection = 1;
        this.targetZoneStart = 0;
        this.targetZoneEnd = 0;

        // Hit feedback
        this.lastHitResult = null;
        this.hitAnimTimer = 0;

        // State
        this.levelComplete = false;
        this.levelFailed = false;

        // Particles (simple)
        this.particles = [];

        // Theme animation state
        this.hitFlashTimer = 0;
        this.gameTime = 0;

        this._loadProgress();
    }

    _createLevels() {
        return [
            { id: 1, name: 'CLEAR_LOGS', desc: 'Delete the attacker\'s log files', difficulty: 1, barSpeed: 0.7, targetSize: 0.22, requiredHits: 8, maxTime: 25, unlocked: true, completed: false, bestScore: 0, lockpickDiff: 1 },
            { id: 2, name: 'CLOSE_PORTS', desc: 'Shut down open backdoors', difficulty: 2, barSpeed: 0.9, targetSize: 0.18, requiredHits: 10, maxTime: 28, unlocked: false, completed: false, bestScore: 0, lockpickDiff: 2 },
            { id: 3, name: 'REMOVE_MALWARE', desc: 'Detect and remove malicious software', difficulty: 3, barSpeed: 1.1, targetSize: 0.15, requiredHits: 12, maxTime: 30, unlocked: false, completed: false, bestScore: 0, lockpickDiff: 3 },
            { id: 4, name: 'RESET_CREDS', desc: 'Reset compromised credentials', difficulty: 4, barSpeed: 1.4, targetSize: 0.12, requiredHits: 14, maxTime: 35, unlocked: false, completed: false, bestScore: 0, lockpickDiff: 4 },
            { id: 5, name: 'FIREWALL', desc: 'Rebuild the firewall', difficulty: 5, barSpeed: 1.7, targetSize: 0.10, requiredHits: 16, maxTime: 40, unlocked: false, completed: false, bestScore: 0, lockpickDiff: 5 },
            { id: 6, name: 'CUT_ACCESS', desc: 'Completely sever the attacker\'s connection', difficulty: 6, barSpeed: 2.0, targetSize: 0.08, requiredHits: 18, maxTime: 60, unlocked: false, completed: false, bestScore: 0, lockpickDiff: 6 }
        ];
    }

    startLevel(index) {
        if (index < 0 || index >= this.levels.length) return false;
        const level = this.levels[index];
        if (!level.unlocked) return false;

        this.currentLevelIndex = index;
        this.currentLevel = level;

        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;

        // Dinamik yanma hakkı
        if (index <= 2) {
            this.maxLives = 3;
        } else if (index <= 4) {
            this.maxLives = 4;
        } else {
            this.maxLives = 5;
        }
        this.lives = this.maxLives;
        this.hitCount = 0;
        this.barPosition = 0;
        this.barSpeed = level.barSpeed;
        this.barDirection = 1;
        this.levelComplete = false;
        this.levelFailed = false;
        this.lastHitResult = null;
        this.hitAnimTimer = 0;
        this.particles = [];
        this.timer = level.maxTime;
        this.usedRevive = false;

        this._generateTargetZone();
        this._initBgObjects();
        return true;
    }

    update(dt) {
        if (!this.currentLevel || this.levelComplete || this.levelFailed) return;

        // Animation timers
        this.gameTime += dt;
        if (this.hitFlashTimer > 0) this.hitFlashTimer -= dt * 3;

        // Timer
        this.timer -= dt;
        if (this.timer <= 0) {
            this.timer = 0;
            this._checkEnd();
            return;
        }

        // Bar movement (ping-pong)
        this.barPosition += this.barSpeed * this.barDirection * dt;
        if (this.barPosition >= 1) { this.barPosition = 1; this.barDirection = -1; }
        else if (this.barPosition <= 0) { this.barPosition = 0; this.barDirection = 1; }

        // Hit anim
        if (this.lastHitResult) {
            this.hitAnimTimer -= dt;
            if (this.hitAnimTimer <= 0) this.lastHitResult = null;
        }

        // Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 150 * dt;
            p.life -= p.decay * dt;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
    }

    hit() {
        if (!this.currentLevel || this.levelComplete || this.levelFailed) return;

        const pos = this.barPosition;
        const inZone = pos >= this.targetZoneStart && pos <= this.targetZoneEnd;
        const theme = getLevelTheme(this.currentLevel.id);

        if (inZone) {
            const center = (this.targetZoneStart + this.targetZoneEnd) / 2;
            const dist = Math.abs(pos - center) / ((this.targetZoneEnd - this.targetZoneStart) / 2);

            if (dist < 0.35) {
                this.combo++;
                this.score += 100 * this.combo;
                this.lastHitResult = 'perfect';
                this._spawnParticles(pos, theme.hitColors.perfect, 8);
                Sound.playPerfect(theme);
                this.hitFlashTimer = 1;
            } else {
                this.combo++;
                this.score += 50 * this.combo;
                this.lastHitResult = 'good';
                this._spawnParticles(pos, theme.hitColors.good, 5);
                Sound.playGood(theme);
                this.hitFlashTimer = 0.6;
            }
            this.hitCount++;
            if (this.combo > this.maxCombo) this.maxCombo = this.combo;
        } else {
            this.combo = 0;
            this.lives--;
            this.lastHitResult = 'miss';
            this._spawnParticles(pos, theme.hitColors.miss, 6);
            Sound.playMiss();

            if (this.lives <= 0) {
                this.levelFailed = true;
                Sound.playLevelFail();
                return;
            }
        }

        this.hitAnimTimer = 0.5;
        this._generateTargetZone();
        this.barSpeed = Math.min(this.barSpeed + 0.015, 3.5);
        this._checkEnd();
    }

    _checkEnd() {
        if (this.hitCount >= this.currentLevel.requiredHits) {
            this.levelComplete = true;
            this._onComplete();
        } else if (this.timer <= 0 && !this.levelComplete) {
            this.levelFailed = true;
        }
    }

    _onComplete() {
        const l = this.currentLevel;
        if (this.score > l.bestScore) l.bestScore = this.score;
        l.completed = true;
        const next = this.currentLevelIndex + 1;
        if (next < this.levels.length) this.levels[next].unlocked = true;
        this._saveProgress();
        Sound.playLevelComplete();
    }

    _generateTargetZone() {
        const size = this.currentLevel.targetSize;
        const start = Utils.randFloat(0.05, 0.95 - size);
        this.targetZoneStart = start;
        this.targetZoneEnd = start + size;
    }

    _spawnParticles(barPos, color, count) {
        const theme = getLevelTheme(this.currentLevel.id);
        const syms = theme.particleSymbols;
        for (let i = 0; i < count; i++) {
            this.particles.push({
                barPos, color,
                symbol: syms[Utils.randInt(0, syms.length - 1)],
                x: 0, y: 0,
                vx: Utils.randFloat(-80, 80),
                vy: Utils.randFloat(-120, -30),
                life: 1,
                decay: Utils.randFloat(1.2, 2.5),
                size: Utils.randFloat(2, 5)
            });
        }
    }

    // ── Render ──

    render(ctx, W, H) {
        if (!this.currentLevel) return;

        const theme = getLevelTheme(this.currentLevel.id);
        const barY = H * 0.55;
        const barX = W * 0.12;
        const barW = W * 0.76;
        const barH = 12;
        const t = this.gameTime;

        // Level-specific background animation — CG: Themed scene rendering
        this._renderLevelBg(ctx, W, H, theme, t);

        // Hit flash — CG: Screen-space color overlay
        if (this.hitFlashTimer > 0) {
            ctx.save();
            ctx.globalAlpha = this.hitFlashTimer * 0.06;
            ctx.fillStyle = theme.zoneColor;
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        }

        ctx.save();

        // Bar glow — CG: Shadow / bloom effect
        const pulse = 4 + Math.sin(t * 4) * 2;
        ctx.shadowColor = theme.barGlow;
        ctx.shadowBlur = pulse;

        // Bar background
        ctx.fillStyle = 'rgba(30,41,59,0.6)';
        Utils.roundRect(ctx, barX, barY - barH / 2, barW, barH, 6);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Target zone — themed color + breathing opacity
        const zoneX = barX + this.targetZoneStart * barW;
        const zoneW = (this.targetZoneEnd - this.targetZoneStart) * barW;
        const breathe = 0.8 + Math.sin(t * 3) * 0.2;
        ctx.globalAlpha = breathe;
        ctx.fillStyle = theme.zoneBg;
        ctx.strokeStyle = theme.zoneColor;
        ctx.lineWidth = 1.5;
        Utils.roundRect(ctx, zoneX, barY - barH / 2 - 4, zoneW, barH + 8, 4);
        ctx.fill();
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Indicator — the icon IS the slider
        const ix = barX + this.barPosition * barW;
        const bob = Math.sin(t * 6) * 3;
        const iSize = (theme.iconSize || 26) + 6;

        // Center marker — thin line through the bar so player sees exact position
        ctx.shadowBlur = 0;
        ctx.strokeStyle = theme.indicatorColor;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ix, barY - barH - 3);
        ctx.lineTo(ix, barY + barH + 3);
        ctx.stroke();

        // Small triangle pointer above
        ctx.fillStyle = theme.indicatorColor;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.moveTo(ix, barY - barH - 3);
        ctx.lineTo(ix - 4, barY - barH - 9);
        ctx.lineTo(ix + 4, barY - barH - 9);
        ctx.closePath();
        ctx.fill();

        // Glowing circle behind the icon
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.arc(ix, barY + bob, iSize * 0.65, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Icon with strong glow — double draw for brightness
        ctx.shadowColor = theme.indicatorColor;
        ctx.shadowBlur = 12;
        ctx.font = `${iSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(theme.icon, ix, barY + bob);
        ctx.fillText(theme.icon, ix, barY + bob);

        ctx.restore();

        // Hit result text — themed words
        if (this.lastHitResult) {
            const words = theme.hitWords;
            const colors = theme.hitColors;
            const text = words[this.lastHitResult];
            const color = colors[this.lastHitResult];
            const alpha = Utils.clamp(this.hitAnimTimer / 0.5, 0, 1);
            const scale = 1 + (1 - alpha) * 0.15;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = color;
            ctx.font = `700 ${Math.round(26 * scale)}px Orbitron`;
            ctx.textAlign = 'center';
            ctx.fillText(text, W / 2, barY - 45);
            ctx.restore();
        }

        // Particles — themed symbols
        for (const p of this.particles) {
            ctx.save();
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            const px = barX + p.barPos * barW + p.x;
            const py = barY + p.y;
            // Draw symbol for bigger particles, circle for small
            if (p.size > 3 && p.symbol) {
                ctx.font = `${Math.round(p.size * 3 * p.life)}px monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(p.symbol, px, py);
            } else {
                ctx.beginPath();
                ctx.arc(px, py, p.size * p.life, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        // Level info
        this._renderInfo(ctx, W, H);
    }

    _renderInfo(ctx, W, H) {
        ctx.save();

        // Level name — themed color
        const theme = getLevelTheme(this.currentLevel.id);
        ctx.fillStyle = theme.zoneColor;
        ctx.font = '600 16px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText(this.currentLevel.name, W / 2, 75);

        // Description
        ctx.fillStyle = '#64748b';
        ctx.font = '400 14px Rajdhani';
        ctx.fillText(this.currentLevel.desc, W / 2, 95);

        // Progress
        ctx.fillText(`Hit: ${this.hitCount}/${this.currentLevel.requiredHits}`, W / 2, 115);

        // Time
        const timeColor = this.timer < 10 ? '#ef4444' : '#64748b';
        ctx.fillStyle = timeColor;
        ctx.font = '500 14px Rajdhani';
        ctx.textAlign = 'right';
        ctx.fillText(`Time: ${Utils.formatTime(this.timer)}`, W - 16, 75);

        // Lives
        ctx.textAlign = 'right';
        ctx.font = '18px sans-serif';
        for (let i = 0; i < (this.maxLives || 3); i++) {
            ctx.fillStyle = i < this.lives ? '#ef4444' : 'rgba(239,68,68,0.2)';
            ctx.fillText('♥', W - 16 - i * 24, 100);
        }

        ctx.restore();
    }

    // ── Persistence ──

    _saveProgress() {
        try {
            const data = this.levels.map(l => ({ id: l.id, unlocked: l.unlocked, completed: l.completed, bestScore: l.bestScore }));
            localStorage.setItem('sb_progress', JSON.stringify(data));
        } catch (e) { }
    }

    _loadProgress() {
        try {
            const data = JSON.parse(localStorage.getItem('sb_progress'));
            if (!data) return;
            for (const s of data) {
                const l = this.levels.find(x => x.id === s.id);
                if (l) { l.unlocked = s.unlocked; l.completed = s.completed; l.bestScore = s.bestScore; }
            }
        } catch (e) { }
    }

    // ════════════════════════════════════════
    //  ENDLESS MODE
    // ════════════════════════════════════════

    isAllCompleted() {
        return this.levels.every(l => l.completed);
    }

    /**
     * Start endless mode
     * No timer, wave system, continuously accelerating
     */
    startEndless() {
        this.endlessMode = true;
        this.currentLevelIndex = -1;
        this.currentLevel = {
            id: 999,
            name: 'ENDLESS_MODE',
            desc: 'Permanent defense — survive as long as you can',
            barSpeed: 0.6,
            targetSize: 0.24,
            requiredHits: Infinity,
            maxTime: Infinity,
            lockpickDiff: 1
        };

        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.lives = 6;
        this.hitCount = 0;
        this.barPosition = 0;
        this.barSpeed = this.currentLevel.barSpeed;
        this.barDirection = 1;
        this.levelComplete = false;
        this.levelFailed = false;
        this.lastHitResult = null;
        this.hitAnimTimer = 0;
        this.particles = [];
        this.timer = Infinity;
        this.usedRevive = false;

        // Wave system
        this.endlessWave = 1;
        this.endlessHitsInWave = 0;
        this.endlessHitsPerWave = 5;
        this.endlessWaveFlash = 0;

        // Best score
        this.endlessBest = this._loadEndlessBest();

        this._generateTargetZone();
        this._initBgObjects();
    }

    /**
     * Endless mode hit — difficulty increases with wave system
     */
    hitEndless() {
        if (!this.currentLevel || this.levelFailed) return;

        const pos = this.barPosition;
        const inZone = pos >= this.targetZoneStart && pos <= this.targetZoneEnd;
        const theme = getLevelTheme(this.currentLevel.id);

        if (inZone) {
            const center = (this.targetZoneStart + this.targetZoneEnd) / 2;
            const dist = Math.abs(pos - center) / ((this.targetZoneEnd - this.targetZoneStart) / 2);

            if (dist < 0.35) {
                this.combo++;
                this.score += 100 * this.combo * this.endlessWave;
                this.lastHitResult = 'perfect';
                this._spawnParticles(pos, theme.hitColors.perfect, 8);
                Sound.playPerfect(theme);
                this.hitFlashTimer = 1;
            } else {
                this.combo++;
                this.score += 50 * this.combo * this.endlessWave;
                this.lastHitResult = 'good';
                this._spawnParticles(pos, theme.hitColors.good, 5);
                Sound.playGood(theme);
                this.hitFlashTimer = 0.6;
            }
            this.hitCount++;
            this.endlessHitsInWave++;
            if (this.combo > this.maxCombo) this.maxCombo = this.combo;

            // Wave progression
            if (this.endlessHitsInWave >= this.endlessHitsPerWave) {
                this.endlessWave++;
                this.endlessHitsInWave = 0;
                this.endlessWaveFlash = 1.0;
                this._endlessScaleUp();
                Sound.playWaveUp();
            }
        } else {
            this.combo = 0;
            this.lives--;
            this.lastHitResult = 'miss';
            this._spawnParticles(pos, theme.hitColors.miss, 6);
            Sound.playMiss();

            if (this.lives <= 0) {
                this.levelFailed = true;
                this._saveEndlessBest();
                Sound.playLevelFail();
                return;
            }
        }

        this.hitAnimTimer = 0.5;
        this._generateTargetZone();
        this.barSpeed = Math.min(this.barSpeed + 0.008, 4.0);
    }

    /**
     * Increase difficulty on wave completion
     */
    _endlessScaleUp() {
        // Shrink target
        this.currentLevel.targetSize = Math.max(this.currentLevel.targetSize - 0.012, 0.05);
        // Increase speed
        this.currentLevel.barSpeed = Math.min(this.currentLevel.barSpeed + 0.15, 4.0);
        this.barSpeed = this.currentLevel.barSpeed;
        // Lockpick difficulty
        this.currentLevel.lockpickDiff = Math.min(this.endlessWave, 6);
        // Bonus life (every 3 waves)
        if (this.endlessWave % 3 === 0) {
            this.lives = Math.min(this.lives + 1, 5);
        }
    }

    /**
     * Endless mode update — no timer, only bar and particles
     */
    updateEndless(dt) {
        if (!this.currentLevel || this.levelFailed) return;

        // Animation timers
        this.gameTime += dt;
        if (this.hitFlashTimer > 0) this.hitFlashTimer -= dt * 3;

        // Bar hareketi
        this.barPosition += this.barSpeed * this.barDirection * dt;
        if (this.barPosition >= 1) { this.barPosition = 1; this.barDirection = -1; }
        else if (this.barPosition <= 0) { this.barPosition = 0; this.barDirection = 1; }

        // Hit anim
        if (this.lastHitResult) {
            this.hitAnimTimer -= dt;
            if (this.hitAnimTimer <= 0) this.lastHitResult = null;
        }

        // Wave flash
        if (this.endlessWaveFlash > 0) {
            this.endlessWaveFlash -= dt * 2;
        }

        // Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += 150 * dt;
            p.life -= p.decay * dt;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
    }

    /**
     * Endless mode render — show wave info
     */
    renderEndless(ctx, W, H) {
        if (!this.currentLevel) return;

        const theme = getLevelTheme(this.currentLevel.id);
        const barY = H * 0.55;
        const barX = W * 0.12;
        const barW = W * 0.76;
        const barH = 12;
        const t = this.gameTime;

        // Level background animation
        this._renderLevelBg(ctx, W, H, theme, t);

        // Hit flash
        if (this.hitFlashTimer > 0) {
            ctx.save();
            ctx.globalAlpha = this.hitFlashTimer * 0.06;
            ctx.fillStyle = theme.zoneColor;
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        }

        ctx.save();

        // Bar glow
        const pulse = 4 + Math.sin(t * 4) * 2;
        ctx.shadowColor = theme.barGlow;
        ctx.shadowBlur = pulse;

        // Bar background
        ctx.fillStyle = 'rgba(30,41,59,0.6)';
        Utils.roundRect(ctx, barX, barY - barH / 2, barW, barH, 6);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Target zone — themed
        const zoneX = barX + this.targetZoneStart * barW;
        const zoneW = (this.targetZoneEnd - this.targetZoneStart) * barW;
        const breathe = 0.8 + Math.sin(t * 3) * 0.2;
        ctx.globalAlpha = breathe;
        ctx.fillStyle = theme.zoneBg;
        ctx.strokeStyle = theme.zoneColor;
        ctx.lineWidth = 1.5;
        Utils.roundRect(ctx, zoneX, barY - barH / 2 - 4, zoneW, barH + 8, 4);
        ctx.fill();
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Indicator — icon slider
        const ix = barX + this.barPosition * barW;
        const bob = Math.sin(t * 6) * 3;
        const iSize = (theme.iconSize || 26) + 6;

        // Center marker line
        ctx.shadowBlur = 0;
        ctx.strokeStyle = theme.indicatorColor;
        ctx.globalAlpha = 0.6;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ix, barY - barH - 3);
        ctx.lineTo(ix, barY + barH + 3);
        ctx.stroke();

        // Small triangle pointer
        ctx.fillStyle = theme.indicatorColor;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.moveTo(ix, barY - barH - 3);
        ctx.lineTo(ix - 4, barY - barH - 9);
        ctx.lineTo(ix + 4, barY - barH - 9);
        ctx.closePath();
        ctx.fill();

        // Glowing circle behind icon
        ctx.globalAlpha = 0.2;
        ctx.beginPath();
        ctx.arc(ix, barY + bob, iSize * 0.65, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Icon with glow
        ctx.shadowColor = theme.indicatorColor;
        ctx.shadowBlur = 12;
        ctx.font = `${iSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(theme.icon, ix, barY + bob);
        ctx.fillText(theme.icon, ix, barY + bob);

        ctx.restore();

        // Hit result text — themed
        if (this.lastHitResult) {
            const text = theme.hitWords[this.lastHitResult];
            const color = theme.hitColors[this.lastHitResult];
            const alpha = Utils.clamp(this.hitAnimTimer / 0.5, 0, 1);
            const scale = 1 + (1 - alpha) * 0.15;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = color;
            ctx.font = `700 ${Math.round(26 * scale)}px Orbitron`;
            ctx.textAlign = 'center';
            ctx.fillText(text, W / 2, barY - 45);
            ctx.restore();
        }

        // Particles — themed symbols
        for (const p of this.particles) {
            ctx.save();
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            const px = barX + p.barPos * barW + p.x;
            const py = barY + p.y;
            if (p.size > 3 && p.symbol) {
                ctx.font = `${Math.round(p.size * 3 * p.life)}px monospace`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(p.symbol, px, py);
            } else {
                ctx.beginPath();
                ctx.arc(px, py, p.size * p.life, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        // Wave flash efekti
        if (this.endlessWaveFlash > 0) {
            ctx.save();
            ctx.globalAlpha = this.endlessWaveFlash * 0.15;
            ctx.fillStyle = '#f59e0b';
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        }

        // ── Endless Info ──
        this._renderEndlessInfo(ctx, W, H);
    }

    _renderEndlessInfo(ctx, W, H) {
        ctx.save();

        // Wave
        ctx.fillStyle = '#f59e0b';
        ctx.font = '700 18px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText(`WAVE ${this.endlessWave}`, W / 2, 70);

        // Desc
        ctx.fillStyle = '#64748b';
        ctx.font = '400 13px Rajdhani';
        ctx.fillText('∞ ENDLESS MODE — Survive as long as you can', W / 2, 90);

        // Wave progress bar
        const progW = 120;
        const progH = 4;
        const progX = W / 2 - progW / 2;
        const progY = 100;
        ctx.fillStyle = '#1e293b';
        Utils.roundRect(ctx, progX, progY, progW, progH, 2);
        ctx.fill();
        const waveProg = this.endlessHitsInWave / this.endlessHitsPerWave;
        if (waveProg > 0) {
            ctx.fillStyle = '#f59e0b';
            Utils.roundRect(ctx, progX, progY, progW * waveProg, progH, 2);
            ctx.fill();
        }
        ctx.fillStyle = '#475569';
        ctx.font = '400 10px Rajdhani';
        ctx.fillText(`${this.endlessHitsInWave}/${this.endlessHitsPerWave}`, W / 2, progY + 16);

        // Lives (solda)
        ctx.textAlign = 'right';
        ctx.font = '19px sans-serif';
        for (let i = 0; i < Math.max(this.lives, 3); i++) {
            ctx.fillStyle = i < this.lives ? '#ef4444' : 'rgba(239,68,68,0.2)';
            ctx.fillText('♥', W - 16 - i * 24, 75);
        }

        // Best score
        if (this.endlessBest > 0) {
            ctx.fillStyle = '#475569';
            ctx.font = '400 12px Rajdhani';
            ctx.textAlign = 'right';
            ctx.fillText(`BEST: ${this.endlessBest}`, W - 16, 100);
        }

        ctx.restore();
    }

    _saveEndlessBest() {
        if (this.score > this.endlessBest) {
            this.endlessBest = this.score;
            try { localStorage.setItem('sb_endless_best', this.score); } catch (e) { }
        }
    }

    _loadEndlessBest() {
        try { return parseInt(localStorage.getItem('sb_endless_best')) || 0; } catch (e) { return 0; }
    }

    // ════════════════════════════════════════
    //  LEVEL BACKGROUND ANIMATIONS
    //  CG Concepts: Particle systems, transforms
    // ════════════════════════════════════════

    _initBgObjects() {
        this.bgObjects = [];
        const theme = getLevelTheme(this.currentLevel.id);
        const type = theme.bgType;

        if (type === 'binary' || type === 'password') {
            // Falling columns of text
            for (let i = 0; i < 12; i++) {
                this.bgObjects.push({
                    x: Math.random(),
                    y: Math.random(),
                    speed: 0.02 + Math.random() * 0.04,
                    char: (theme.bgChars || '01')[Math.floor(Math.random() * (theme.bgChars || '01').length)],
                    size: 10 + Math.random() * 8,
                    alpha: 0.03 + Math.random() * 0.06,
                });
            }
        } else if (type === 'scanlines') {
            for (let i = 0; i < 6; i++) {
                this.bgObjects.push({
                    y: Math.random(),
                    speed: 0.005 + Math.random() * 0.01,
                    width: 0.3 + Math.random() * 0.5,
                    alpha: 0.02 + Math.random() * 0.04,
                });
            }
        } else if (type === 'virus') {
            for (let i = 0; i < 8; i++) {
                const chars = theme.bgChars || '☠';
                this.bgObjects.push({
                    x: Math.random(),
                    y: Math.random(),
                    vx: (Math.random() - 0.5) * 0.01,
                    vy: (Math.random() - 0.5) * 0.008,
                    char: chars[Math.floor(Math.random() * chars.length)],
                    size: 14 + Math.random() * 12,
                    alpha: 0.04 + Math.random() * 0.06,
                    rot: Math.random() * Math.PI * 2,
                    rotSpeed: (Math.random() - 0.5) * 0.5,
                });
            }
        } else if (type === 'embers') {
            for (let i = 0; i < 15; i++) {
                this.bgObjects.push({
                    x: Math.random(),
                    y: 0.8 + Math.random() * 0.3,
                    speed: 0.02 + Math.random() * 0.04,
                    size: 1 + Math.random() * 3,
                    alpha: 0.05 + Math.random() * 0.1,
                    drift: (Math.random() - 0.5) * 0.005,
                });
            }
        } else if (type === 'electric') {
            for (let i = 0; i < 4; i++) {
                this.bgObjects.push({
                    x1: Math.random(), y1: Math.random() * 0.4 + 0.1,
                    x2: Math.random(), y2: Math.random() * 0.4 + 0.4,
                    timer: Math.random() * 3,
                    interval: 1.5 + Math.random() * 3,
                    alpha: 0,
                });
            }
        }
    }

    _renderLevelBg(ctx, W, H, theme, t) {
        if (!this.bgObjects || this.bgObjects.length === 0) return;
        const type = theme.bgType;

        ctx.save();

        if (type === 'binary' || type === 'password') {
            // Falling text columns — Matrix-style rain
            ctx.font = '500 14px monospace';
            ctx.textAlign = 'center';
            for (const o of this.bgObjects) {
                o.y += o.speed * 0.016;
                if (o.y > 1.1) {
                    o.y = -0.05;
                    o.x = Math.random();
                    o.char = (theme.bgChars || '01')[Math.floor(Math.random() * (theme.bgChars || '01').length)];
                }
                ctx.globalAlpha = o.alpha;
                ctx.fillStyle = theme.bgColor;
                ctx.font = `${o.size}px monospace`;
                ctx.fillText(o.char, o.x * W, o.y * H);
            }
        } else if (type === 'scanlines') {
            // Horizontal scanning lines
            for (const o of this.bgObjects) {
                o.y += o.speed * 0.016;
                if (o.y > 1.2) o.y = -0.1;
                ctx.globalAlpha = o.alpha;
                ctx.strokeStyle = theme.bgColor;
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 8]);
                const startX = (1 - o.width) * W * 0.5;
                ctx.beginPath();
                ctx.moveTo(startX, o.y * H);
                ctx.lineTo(startX + o.width * W, o.y * H);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        } else if (type === 'virus') {
            // Drifting skulls/virus icons
            for (const o of this.bgObjects) {
                o.x += o.vx * 0.016;
                o.y += o.vy * 0.016;
                o.rot += o.rotSpeed * 0.016;
                // Wrap around
                if (o.x < -0.05) o.x = 1.05;
                if (o.x > 1.05) o.x = -0.05;
                if (o.y < -0.05) o.y = 1.05;
                if (o.y > 1.05) o.y = -0.05;

                ctx.globalAlpha = o.alpha;
                ctx.save();
                ctx.translate(o.x * W, o.y * H);
                ctx.rotate(o.rot);
                ctx.font = `${o.size}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(o.char, 0, 0);
                ctx.restore();
            }
        } else if (type === 'embers') {
            // Rising ember sparks
            for (const o of this.bgObjects) {
                o.y -= o.speed * 0.016;
                o.x += o.drift;
                if (o.y < -0.05) {
                    o.y = 1.0 + Math.random() * 0.2;
                    o.x = Math.random();
                }
                ctx.globalAlpha = o.alpha * (1 - Math.abs(o.y - 0.5) * 1.5);
                ctx.fillStyle = theme.bgColor;
                ctx.beginPath();
                ctx.arc(o.x * W, o.y * H, o.size, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (type === 'electric') {
            // Electric arc flashes
            for (const o of this.bgObjects) {
                o.timer += 0.016;
                if (o.timer > o.interval) {
                    o.timer = 0;
                    o.alpha = 0.12;
                    o.x1 = Math.random();
                    o.y1 = 0.1 + Math.random() * 0.3;
                    o.x2 = Math.random();
                    o.y2 = 0.5 + Math.random() * 0.3;
                }
                if (o.alpha > 0) {
                    o.alpha *= 0.92;
                    ctx.globalAlpha = o.alpha;
                    ctx.strokeStyle = theme.bgColor;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(o.x1 * W, o.y1 * H);
                    // Jagged line with 3-4 segments
                    const segments = 3;
                    for (let s = 1; s <= segments; s++) {
                        const frac = s / (segments + 1);
                        const mx = o.x1 + (o.x2 - o.x1) * frac + (Math.random() - 0.5) * 0.1;
                        const my = o.y1 + (o.y2 - o.y1) * frac + (Math.random() - 0.5) * 0.05;
                        ctx.lineTo(mx * W, my * H);
                    }
                    ctx.lineTo(o.x2 * W, o.y2 * H);
                    ctx.stroke();
                }
            }
        }

        ctx.restore();
    }
}
