/* =========================================
   GameManager.js — Main Game Manager
   All state handlers and coordination
   ========================================= */

class GameManager {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;

        // Subsystems
        this.state = new StateManager();
        this.energy = new EnergySystem();
        this.ui = new UIManager(ctx, canvas);
        this.lockpick = new LockpickSystem();
        this.levels = new LevelManager();
        this.leaderboard = new LeaderboardService();

        // Challenge attempt windows (easter egg / gate)
        this.dualRingGate = new ChallengeGate('sb_dualring');
        this.packetGate = new ChallengeGate('sb_packetpurge');

        // Hidden energy easter egg + transient hub message
        this._energyEggCell = null;
        this._hubMessage = '';
        this._hubMessageTimer = 0;

        // Active generic minigame (S.MINIGAME)
        this._activeMinigame = null;
        this._mgConfig = null;
        this._mgHandled = false;
        this._mgEndTimer = 0;

        // Background effects — CG: Animation + Rendering
        this.bgTime = 0;
        this.bgParticles = this._createBgParticles(35);
        this.dataRain = this._createDataRain(20);

        // Register state handlers
        this._registerStates();

        // Input
        this._setupInput();
    }

    // ── Game Loop ──

    update(dt) {
        this.energy.update(dt);
        this.bgTime += dt;
        this._updateBgParticles(dt);
        this._updateDataRain(dt);
        this.state.update(dt);

        if (typeof performance !== 'undefined') {
            // Wall-clock anchor for the simulation frontier. MUST be captured
            // AFTER state.update(), because that is when timingBar.time is
            // advanced. Capturing it before would make input sampling
            // overshoot by a full fixed step, shifting the effective hit zone.
            this._lastSimWall = performance.now();
        }
    }

    render(ctx, alpha = 0) {
        const W = this.canvas.width;
        const H = this.canvas.height;

        // Clear
        ctx.clearRect(0, 0, W, H);

        // Background — CG: Gradient rendering
        this._renderBackground(ctx, W, H);

        // State render
        this.state.render(ctx, alpha);
    }

    // ════════════════════════════════════════
    //  STATE HANDLER REGISTRATIONS
    // ════════════════════════════════════════

    _registerStates() {
        const S = this.state.STATES;

        // ── MENU ──
        this.state.register(S.MENU, {
            enter: () => {
                this.ui.clearButtons();
                Sound.startAmbient();
                const cx = this.canvas.width / 2;
                this.ui.addButton('start', '▶  START MISSION', cx, 520, 240, 48,
                    () => this.state.change(S.HUB));
            },
            render: (ctx) => {
                const W = this.canvas.width;
                const H = this.canvas.height;
                const cx = W / 2;

                // Title + version badge
                ctx.save();
                ctx.fillStyle = '#e2e8f0';
                ctx.font = '900 40px Orbitron';
                ctx.textAlign = 'center';
                ctx.fillText('SYNCBREAKER', cx, 70);
                const titleW = ctx.measureText('SYNCBREAKER').width;
                ctx.font = '700 18px Orbitron';
                ctx.fillStyle = '#22c55e';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText('(v2)', cx + titleW / 2 + 22, 56);
                ctx.restore();

                // Subtitle
                ctx.fillStyle = '#ef4444';
                ctx.font = '600 15px Rajdhani';
                ctx.fillText('⚠ CYBER DEFENSE PROTOCOL ⚠', cx, 100);

                // Story panel
                const panelX = cx - 320;
                const panelY = 130;
                const panelW = 640;
                const panelH = 350;

                // Panel background
                ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
                ctx.strokeStyle = '#1e293b';
                ctx.lineWidth = 1;
                Utils.roundRect(ctx, panelX, panelY, panelW, panelH, 8);
                ctx.fill();
                ctx.stroke();

                // Terminal header
                ctx.fillStyle = '#ef4444';
                ctx.font = '700 14px Orbitron';
                ctx.textAlign = 'left';
                ctx.fillText('> STATUS REPORT', panelX + 20, panelY + 30);

                // Terminal line
                ctx.strokeStyle = '#1e293b';
                ctx.beginPath();
                ctx.moveTo(panelX + 15, panelY + 42);
                ctx.lineTo(panelX + panelW - 15, panelY + 42);
                ctx.stroke();

                // Story text
                const lines = [
                    { text: '[WARNING] Your system is under cyber attack!', color: '#ef4444', bold: true },
                    { text: '', color: '' },
                    { text: 'An unknown attacker has infiltrated your network.', color: '#e2e8f0' },
                    { text: 'Malicious code has been injected into critical system files.', color: '#e2e8f0' },
                    { text: 'The attacker is still active and spreading.', color: '#f59e0b' },
                    { text: '', color: '' },
                    { text: '> YOUR MISSION:', color: '#3b82f6', bold: true },
                    { text: 'Access each infected node and clean the malicious data.', color: '#e2e8f0' },
                    { text: 'Use the code breaker (lockpick) to access locked nodes.', color: '#e2e8f0' },
                    { text: 'If you fail, you can activate the recovery protocol.', color: '#e2e8f0' },
                    { text: '', color: '' },
                    { text: '> CAUTION: Energy resources are limited. Each operation costs charges.', color: '#f59e0b' },
                    { text: '  Do not stop until the system is fully cleansed!', color: '#64748b' },
                ];

                let lineY = panelY + 65;
                const lineHeight = 22;
                for (const line of lines) {
                    if (line.text === '') { lineY += 8; continue; }
                    ctx.fillStyle = line.color;
                    ctx.font = (line.bold ? '600' : '400') + ' 14px Rajdhani';
                    ctx.textAlign = 'left';
                    ctx.fillText(line.text, panelX + 20, lineY);
                    lineY += lineHeight;
                }

                // Buton
                this.ui.renderButtons();

                // Version
                ctx.fillStyle = 'rgba(100,116,139,0.4)';
                ctx.font = '300 12px Rajdhani';
                ctx.textAlign = 'center';
                ctx.fillText('v0.1 Beta — Computer Graphics Final Project', cx, H - 16);

                // Credits
                ctx.fillStyle = 'rgba(148,163,184,0.55)';
                ctx.font = '300 12px Rajdhani';
                ctx.textAlign = 'right';
                ctx.fillText('thanks for birlikterutin family', W - 16, H - 32);
                ctx.fillText('alpyso and ezgyso', W - 16, H - 16);
            },
            exit: () => this.ui.clearButtons(),
            onKey: (e) => {
                if (e.code === 'Space' || e.code === 'Enter') this.state.change(S.HUB);
            }
        });

        // ── HUB (Level Selection) ──
        this.state.register(S.HUB, {
            enter: () => {
                this.ui.clearButtons();
                Sound.startAmbient();
                this._buildHubButtons();
                this._pickEnergyEggCell();
            },
            update: (dt) => {
                if (this._hubMessageTimer > 0) this._hubMessageTimer -= dt;
                // Migration / catch-up: if all nodes were already cleaned in a
                // previous session, show the celebration exactly once.
                if (this.levels.isAllCompleted() && !this.levels.congratsSeen) {
                    this.levels._markCongratsSeen();
                    this.state.change(S.CONGRATS);
                }
            },
            render: (ctx) => {
                const W = this.canvas.width;
                const H = this.canvas.height;

                // Title
                ctx.fillStyle = '#e2e8f0';
                ctx.font = '700 22px Orbitron';
                ctx.textAlign = 'center';
                ctx.fillText('INFECTED NODES', W / 2, 38);

                ctx.fillStyle = '#64748b';
                ctx.font = '400 13px Rajdhani';
                ctx.fillText('Select system nodes to clean', W / 2, 58);

                // Energy
                this.ui.renderEnergyBar({
                    current: this.energy.currentEnergy,
                    max: this.energy.maxEnergy,
                    nextRegenIn: this.energy.getTimeToNextRegen()
                });

                // Act panels + gate node (behind the level cards)
                this._renderHubConnections(ctx);
                this._renderHubLockNode(ctx);

                // Cards
                this.ui.renderButtons();

                // Transient message (attempt limits, rewards, gate)
                if (this._hubMessageTimer > 0 && this._hubMessage) {
                    ctx.save();
                    ctx.globalAlpha = Math.min(1, this._hubMessageTimer);
                    ctx.fillStyle = '#f59e0b';
                    ctx.font = '600 15px Rajdhani';
                    ctx.textAlign = 'center';
                    ctx.fillText(this._hubMessage, W / 2, H - 62);
                    ctx.restore();
                }

                // Footer info
                ctx.fillStyle = '#475569';
                ctx.font = '400 13px Rajdhani';
                ctx.textAlign = 'center';
                ctx.fillText('ACT I nodes can be skipped with the Code Breaker (2⚡) · ACT II needs the gate', W / 2, H - 16);
            },
            exit: () => this.ui.clearButtons(),
            onKey: (e) => {
                if (e.code === 'Escape') this.state.change(S.MENU);
            }
        });

        // ── LEVEL (Gameplay) ──
        this.state.register(S.LEVEL, {
            enter: () => { this.ui.clearButtons(); Sound.stopAmbient(); },
            update: (dt) => {
                this.levels.update(dt);

                if (this.levels.levelComplete === true) {
                    this.levels.levelComplete = 'handled';

                    // First time all 6 nodes are cleaned → celebration screen.
                    if (this.levels.justUnlockedEndless) {
                        this.levels.justUnlockedEndless = false;
                        setTimeout(() => this.state.change(S.CONGRATS), 1200);
                        return;
                    }

                    const unlockedEndless = this.levels.isAllCompleted();
                    setTimeout(() => {
                        if (unlockedEndless && !this.leaderboard.hasProfile()) {
                            this.state.change(S.PROFILE_SETUP, { returnState: S.HUB });
                        } else {
                            this.state.change(S.HUB);
                        }
                    }, 1500);
                }

                if (this.levels.levelFailed === true) {
                    this.levels.levelFailed = 'handled';
                    this.state.change(S.GAME_OVER, {
                        levelIndex: this.levels.currentLevelIndex,
                        score: this.levels.score,
                        revivesUsed: this.levels.revivesUsed
                    });
                }
            },
            render: (ctx, alpha) => {
                const W = this.canvas.width;
                const H = this.canvas.height;

                this.ui.renderScore(this.levels.score, this.levels.combo);
                this.ui.renderEnergyBar({
                    current: this.energy.currentEnergy,
                    max: this.energy.maxEnergy,
                    nextRegenIn: this.energy.getTimeToNextRegen()
                });
                this.levels.render(ctx, W, H, alpha);

                // Level complete overlay
                if (this.levels.levelComplete) {
                    ctx.fillStyle = '#22c55e';
                    ctx.font = '900 32px Orbitron';
                    ctx.textAlign = 'center';
                    ctx.fillText('NODE CLEANED!', W / 2, H / 2 - 70);
                    ctx.fillStyle = '#64748b';
                    ctx.font = '500 18px Rajdhani';
                    ctx.fillText(`Score: ${this.levels.score} | Max Combo: x${this.levels.maxCombo}`, W / 2, H / 2 - 35);
                }
            },
            exit: () => this.ui.clearButtons(),
            onKey: (e) => {
                if (e.code === 'Space') this.levels.hit(this._pendingInputOffset || 0);
                if (e.code === 'Escape') this.state.change(S.HUB);
            }
        });

        // ── LOCKPICK ──
        this.state.register(S.LOCKPICK, {
            enter: (context) => {
                this.ui.clearButtons();
                Sound.stopAmbient();
                const lCtx = context || {};
                this._lockpickReason = lCtx.reason || 'shortcut';
                this._lockpickLevelIndex = lCtx.levelIndex;
                this._lockpickScore = lCtx.score || 0;
                // Endless revive context
                this._lockpickEndlessCtx = {
                    score: lCtx.endlessScore || 0,
                    wave: lCtx.endlessWave || 1,
                    maxCombo: lCtx.endlessMaxCombo || 0,
                    hitCount: lCtx.endlessHitCount || 0
                };

                const diff = lCtx.difficulty || 1;
                this.lockpick.start(diff, (success) => {
                    if (success) {
                        if (this._lockpickReason === 'shortcut') {
                            if (this._lockpickLevelIndex !== undefined) {
                                this.levels.levels[this._lockpickLevelIndex].unlocked = true;
                                this.levels._saveProgress();
                            }
                            this.state.change(S.HUB);
                        } else if (this._lockpickReason === 'revive') {
                            this.levels.lives = 1;
                            this.levels.levelFailed = false;
                            this.levels.revivesUsed = (this.levels.revivesUsed || 0) + 1;
                            this.state.change(S.LEVEL);
                        } else if (this._lockpickReason === 'endless_revive') {
                            // Continue from where left off in endless — 1 life
                            this.levels.lives = 1;
                            this.levels.levelFailed = false;
                            this.state.change(S.ENDLESS);
                        }
                    } else {
                        if (this._lockpickReason === 'revive') {
                            this.state.change(S.GAME_OVER, {
                                levelIndex: this._lockpickLevelIndex,
                                score: this._lockpickScore,
                                noRevive: true
                            });
                        } else if (this._lockpickReason === 'endless_revive') {
                            this.state.change(S.ENDLESS_OVER, {
                                ...this._lockpickEndlessCtx,
                                noRevive: true
                            });
                        } else {
                            this.state.change(S.HUB);
                        }
                    }
                });
            },
            update: (dt) => {
                this.lockpick.update(dt);
            },
            render: (ctx) => {
                const W = this.canvas.width;
                const H = this.canvas.height;

                // Title
                const isRevive = this._lockpickReason === 'revive' || this._lockpickReason === 'endless_revive';
                const title = isRevive ? 'RECOVERY PROTOCOL' : 'CODE BREAKER';
                const subtitle = isRevive
                    ? 'Break the code to restore the connection'
                    : 'Break the security code to access the locked node';
                ctx.fillStyle = '#f59e0b';
                ctx.font = '700 22px Orbitron';
                ctx.textAlign = 'center';
                ctx.fillText(title, W / 2, 40);
                ctx.fillStyle = '#64748b';
                ctx.font = '400 13px Rajdhani';
                ctx.fillText(subtitle, W / 2, 60);

                // Instructions
                ctx.fillStyle = '#64748b';
                ctx.font = '400 14px Rajdhani';
                const hint = this.lockpick.started
                    ? 'Press the correct arrow key when cursor reaches a node!'
                    : 'Press any arrow key (↑↓←→) or WASD to start';
                ctx.fillText(hint, W / 2, 70);

                // Lockpick
                this.lockpick.render(ctx, W / 2, H / 2 + 10);

                // Energy
                this.ui.renderEnergyBar({
                    current: this.energy.currentEnergy,
                    max: this.energy.maxEnergy,
                    nextRegenIn: this.energy.getTimeToNextRegen()
                });
            },
            exit: () => this.ui.clearButtons(),
            onKey: (e) => {
                this.lockpick.handleKey(e.code);
            }
        });

        // ── MINIGAME (generic host: Dual Ring, Packet Purge, …) ──
        this.state.register(S.MINIGAME, {
            enter: (context) => {
                this.ui.clearButtons();
                Sound.stopAmbient();
                const c = context || {};
                this._mgConfig = c;
                this._activeMinigame = c.mechanic || null;
                this._mgHandled = false;
                this._mgEndTimer = 0;
                if (this._activeMinigame && this._activeMinigame.init) {
                    this._activeMinigame.init(Object.assign({
                        width: this.canvas.width,
                        height: this.canvas.height
                    }, c));
                }
            },
            update: (dt) => {
                const m = this._activeMinigame;
                if (!m) return;
                m.update(dt);

                if (m.result !== null && !this._mgHandled) {
                    this._mgHandled = true;
                    this._mgEndTimer = m.resultDuration || 1.2;
                }
                if (this._mgHandled) {
                    this._mgEndTimer -= dt;
                    if (this._mgEndTimer <= 0) {
                        const cfg = this._mgConfig || {};
                        const finished = m;
                        this._activeMinigame = null;
                        if (cfg.onComplete) cfg.onComplete(finished.result === 'success', finished);
                    }
                }
            },
            render: (ctx) => {
                const W = this.canvas.width;
                const H = this.canvas.height;
                const cfg = this._mgConfig || {};

                ctx.fillStyle = '#f59e0b';
                ctx.font = '700 22px Orbitron';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'alphabetic';
                ctx.fillText(cfg.title || 'MINIGAME', W / 2, 44);

                if (cfg.subtitle) {
                    ctx.fillStyle = '#64748b';
                    ctx.font = '400 13px Rajdhani';
                    ctx.fillText(cfg.subtitle, W / 2, 64);
                }
                if (cfg.hint) {
                    ctx.fillStyle = '#64748b';
                    ctx.font = '400 14px Rajdhani';
                    ctx.fillText(cfg.hint, W / 2, 84);
                }

                if (this._activeMinigame && this._activeMinigame.render) {
                    this._activeMinigame.render(ctx, W, H, this.levels.gameTime);
                }

                this.ui.renderEnergyBar({
                    current: this.energy.currentEnergy,
                    max: this.energy.maxEnergy,
                    nextRegenIn: this.energy.getTimeToNextRegen()
                });
            },
            exit: () => { this.ui.clearButtons(); this._activeMinigame = null; },
            onKey: (e) => {
                const m = this._activeMinigame;
                if (!m) return;
                if (m.handleKey && m.handleKey(e.code)) return;
                if ((e.code === 'Space' || e.code === 'Enter') && m.handleConfirm) {
                    m.handleConfirm();
                }
            }
        });

        // ── GAME OVER ──
        this.state.register(S.GAME_OVER, {
            enter: (context) => {
                this.ui.clearButtons();
                const cx = this.canvas.width / 2;
                const cy = this.canvas.height / 2;
                const lCtx = context || {};

                this._goScore = lCtx.score || 0;
                this._goLevelIndex = lCtx.levelIndex;
                this._noRevive = lCtx.noRevive || false;
                this._revivesUsed = lCtx.revivesUsed || 0;
                // Short cooldown so players can't mash restart right after a
                // failure — gives the hands a moment to cool off.
                this._goCooldown = 1.0;
                const maxRevives = this.levels.maxRevives || 2;
                const revivesLeft = Math.max(0, maxRevives - this._revivesUsed);

                // Revive button: energy available AND recovery charges remain
                if (!this._noRevive && revivesLeft > 0 && this.energy.canAfford('REVIVE')) {
                    const level = this.levels.levels[this._goLevelIndex];
                    this.ui.addButton('revive', `🔄 TRY RECOVERY PROTOCOL (1⚡) · ${revivesLeft} left`, cx, cy + 30, 320, 42,
                        () => {
                            if (this.energy.spend('REVIVE')) {
                                this.state.change(S.LOCKPICK, {
                                    reason: 'revive',
                                    difficulty: level ? level.lockpickDiff : 1,
                                    levelIndex: this._goLevelIndex,
                                    score: this._goScore
                                });
                            }
                        },
                        { color: '#f59e0b' }
                    );
                }

                // Retry
                this.ui.addButton('retry', '↻ RETRY', cx, cy + 85, 200, 40,
                    () => this._restartFromGameOver(),
                    { color: '#3b82f6' }
                );
                this._updateRetryButton();

                // Back to hub
                this.ui.addButton('hub', '← NODE SELECT', cx, cy + 135, 200, 40,
                    () => this.state.change(S.HUB),
                    { color: '#64748b' }
                );
            },
            update: (dt) => {
                if (this._goCooldown > 0) {
                    this._goCooldown = Math.max(0, this._goCooldown - dt);
                    this._updateRetryButton();
                }
            },
            render: (ctx) => {
                const W = this.canvas.width;
                const H = this.canvas.height;
                const cx = W / 2;
                const cy = H / 2;

                ctx.fillStyle = '#ef4444';
                ctx.font = '900 28px Orbitron';
                ctx.textAlign = 'center';
                ctx.fillText('OPERATION FAILED', cx, cy - 60);

                ctx.fillStyle = '#64748b';
                ctx.font = '500 18px Rajdhani';
                ctx.fillText(`Score: ${this._goScore}`, cx, cy - 25);

                if (this._noRevive) {
                    ctx.fillStyle = '#ef4444';
                    ctx.font = '400 14px Rajdhani';
                    ctx.fillText('Recovery protocol failed', cx, cy);
                } else if (this._revivesUsed >= (this.levels.maxRevives || 2)) {
                    ctx.fillStyle = '#f59e0b';
                    ctx.font = '400 14px Rajdhani';
                    ctx.fillText('No recovery charges left for this node', cx, cy);
                }

                if (this._goCooldown > 0) {
                    ctx.fillStyle = '#f59e0b';
                    ctx.font = '600 15px Rajdhani';
                    ctx.fillText(`Restart unlocks in ${this._goCooldown.toFixed(1)}s`, cx, cy + 175);
                }

                this.ui.renderButtons();
            },
            exit: () => this.ui.clearButtons(),
            onKey: (e) => {
                if (e.code === 'Space') this._restartFromGameOver();
                if (e.code === 'Escape') this.state.change(S.HUB);
            }
        });

        // ── ENDLESS (Sonsuz Mod) ──
        this.state.register(S.ENDLESS, {
            enter: () => {
                this.ui.clearButtons();
                Sound.stopAmbient();
                // If returning from revive, continue without reset
                if (!this.levels.endlessMode) {
                    this.levels.startEndless();
                }
            },
            update: (dt) => {
                this.levels.updateEndless(dt);

                if (this.levels.levelFailed === true) {
                    this.levels.levelFailed = 'handled';
                    this.state.change(S.ENDLESS_OVER, {
                        score: this.levels.score,
                        wave: this.levels.endlessWave,
                        maxCombo: this.levels.maxCombo,
                        hitCount: this.levels.hitCount
                    });
                }
            },
            render: (ctx, alpha) => {
                const W = this.canvas.width;
                const H = this.canvas.height;

                this.ui.renderScore(this.levels.score, this.levels.combo);
                this.ui.renderEnergyBar({
                    current: this.energy.currentEnergy,
                    max: this.energy.maxEnergy,
                    nextRegenIn: this.energy.getTimeToNextRegen()
                });
                this.levels.renderEndless(ctx, W, H, alpha);
            },
            exit: () => this.ui.clearButtons(),
            onKey: (e) => {
                if (e.code === 'Space') this.levels.hitEndless(this._pendingInputOffset || 0);
                if (e.code === 'Escape') {
                    this.levels.endlessMode = false;
                    this.state.change(S.HUB);
                }
            }
        });

        // ── ENDLESS OVER ──
        this.state.register(S.ENDLESS_OVER, {
            enter: (context) => {
                this.ui.clearButtons();
                const cx = this.canvas.width / 2;
                const cy = this.canvas.height / 2;
                const lCtx = context || {};

                this._eoScore = lCtx.score || 0;
                this._eoWave = lCtx.wave || 1;
                this._eoMaxCombo = lCtx.maxCombo || 0;
                this._eoHitCount = lCtx.hitCount || 0;
                this._eoNoRevive = lCtx.noRevive || false;
                this._endlessUploadStatus = '';

                if (this._eoScore > 0 && this._eoHitCount > 0) {
                    this.leaderboard.recordResult({
                        score: this._eoScore,
                        wave: this._eoWave,
                        hitCount: this._eoHitCount
                    }).then(() => {
                        this._endlessUploadStatus = this.leaderboard.hasProfile()
                            ? 'Score synced to leaderboard'
                            : 'Score saved; create a profile to sync it';
                    }).catch(() => {
                        this._endlessUploadStatus = 'Score saved locally — sync will retry later';
                    });
                }

                // Endless mode revive — unlimited as long as energy lasts!
                if (!this._eoNoRevive && this.energy.canAfford('REVIVE')) {
                    const lockDiff = Math.min(this._eoWave, 6);
                    this.ui.addButton('revive', '🔄 RECOVERY PROTOCOL (1⚡)', cx, cy + 50, 290, 42,
                        () => {
                            if (this.energy.spend('REVIVE')) {
                                this.state.change(S.LOCKPICK, {
                                    reason: 'endless_revive',
                                    difficulty: lockDiff,
                                    endlessScore: this._eoScore,
                                    endlessWave: this._eoWave,
                                    endlessMaxCombo: this._eoMaxCombo,
                                    endlessHitCount: this._eoHitCount
                                });
                            }
                        },
                        { color: '#f59e0b' }
                    );
                }

                // Restart
                this.ui.addButton('restart', '↻ RESTART', cx, cy + 105, 200, 40,
                    () => {
                        this.levels.endlessMode = false;
                        this.state.change(S.ENDLESS);
                    },
                    { color: '#3b82f6' }
                );

                // Back to hub
                this.ui.addButton('hub', '← NODE SELECT', cx, cy + 155, 200, 40,
                    () => {
                        this.levels.endlessMode = false;
                        this.state.change(S.HUB);
                    },
                    { color: '#64748b' }
                );
            },
            render: (ctx) => {
                const W = this.canvas.width;
                const H = this.canvas.height;
                const cx = W / 2;
                const cy = H / 2;

                ctx.fillStyle = '#ef4444';
                ctx.font = '900 26px Orbitron';
                ctx.textAlign = 'center';
                ctx.fillText('DEFENSE COLLAPSED', cx, cy - 80);

                ctx.fillStyle = '#e2e8f0';
                ctx.font = '700 32px Orbitron';
                ctx.fillText(this._eoScore.toString(), cx, cy - 40);

                ctx.fillStyle = '#64748b';
                ctx.font = '500 15px Rajdhani';
                ctx.fillText(`Wave: ${this._eoWave} | Hit: ${this._eoHitCount} | Max Combo: x${this._eoMaxCombo}`, cx, cy - 10);

                // Best
                const best = this.levels._loadEndlessBest();
                if (this._eoScore >= best && best > 0) {
                    ctx.fillStyle = '#f59e0b';
                    ctx.font = '600 14px Rajdhani';
                    ctx.fillText('🏆 NEW RECORD!', cx, cy + 15);
                } else if (best > 0) {
                    ctx.fillStyle = '#475569';
                    ctx.font = '400 13px Rajdhani';
                    ctx.fillText(`Best: ${best}`, cx, cy + 15);
                }

                if (this._eoNoRevive) {
                    ctx.fillStyle = '#ef4444';
                    ctx.font = '400 13px Rajdhani';
                    ctx.fillText('Recovery protocol failed', cx, cy + 32);
                }

                if (this._endlessUploadStatus) {
                    ctx.fillStyle = '#64748b';
                    ctx.font = '400 12px Rajdhani';
                    ctx.fillText(this._endlessUploadStatus, cx, cy + 50);
                }

                this.ui.renderButtons();
            },
            exit: () => this.ui.clearButtons(),
            onKey: (e) => {
                if (e.code === 'Escape') this.state.change(S.HUB);
            }
        });

        // ── CONGRATS (Endless Mode unlocked) ──
        this.state.register(S.CONGRATS, {
            enter: () => {
                this.ui.clearButtons();
                Sound.stopAmbient();
                if (this.levels && this.levels._markCongratsSeen) this.levels._markCongratsSeen();
                const cx = this.canvas.width / 2;
                const cy = this.canvas.height / 2;
                this.ui.addButton('congrats-continue', '▶  CONTINUE', cx, cy + 240, 260, 46,
                    () => this._finishCongrats(),
                    { color: '#22c55e' });
            },
            render: (ctx) => this._renderCongrats(ctx),
            exit: () => this.ui.clearButtons(),
            onKey: (e) => {
                if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
                    this._finishCongrats();
                }
            }
        });

        // ── PROFILE SETUP ──
        this.state.register(S.PROFILE_SETUP, {
            enter: (context) => {
                this.ui.clearButtons();
                const lCtx = context || {};
                this._profileReturnState = lCtx.returnState || S.HUB;
                this._profileName = '';
                this._profileStatus = 'Connecting to leaderboard...';
                this._profileSubmitting = false;
                const cx = this.canvas.width / 2;
                const cy = this.canvas.height / 2;

                this.ui.addButton('profile-submit', 'CREATE OPERATOR', cx, cy + 95, 220, 42,
                    () => this._submitProfileName(), { color: '#f59e0b' });
                this.ui.addButton('profile-mobile-name', 'ENTER NAME', cx, cy + 145, 180, 36,
                    () => {
                        const entered = window.prompt('Choose a unique operator name (3–16 characters):', this._profileName);
                        if (entered !== null) this._profileName = entered.trim().slice(0, 16);
                    }, { color: '#3b82f6' });
                this.ui.addButton('profile-skip', '← BACK', cx, cy + 195, 160, 36,
                    () => this.state.change(this._profileReturnState), { color: '#64748b' });

                if (!this.leaderboard.isConfigured()) {
                    this._profileStatus = 'Leaderboard is not configured yet.';
                    return;
                }
                this.leaderboard.initialize().then((profile) => {
                    if (this.state.currentState !== S.PROFILE_SETUP) return;
                    if (profile) {
                        this.state.change(this._profileReturnState);
                    } else {
                        this._profileStatus = 'Choose your unique operator name.';
                    }
                }).catch(() => {
                    if (this.state.currentState === S.PROFILE_SETUP) {
                        this._profileStatus = 'Offline: choose a name and retry when connected.';
                    }
                });
            },
            render: (ctx) => this._renderProfileSetup(ctx),
            exit: () => this.ui.clearButtons(),
            onKey: (e) => this._handleProfileKey(e)
        });

        // ── LEADERBOARD ──
        this.state.register(S.LEADERBOARD, {
            enter: () => {
                this.ui.clearButtons();
                const cx = this.canvas.width / 2;
                const H = this.canvas.height;
                this._leaderboardEntries = [];
                this._leaderboardMe = null;
                this._leaderboardStatus = 'Connecting...';
                this.ui.addButton('leaderboard-retry', '↻ REFRESH', cx - 115, H - 45, 180, 36,
                    () => this._loadLeaderboard(), { color: '#3b82f6' });
                this.ui.addButton('leaderboard-hub', '← NODE SELECT', cx + 115, H - 45, 180, 36,
                    () => this.state.change(S.HUB), { color: '#64748b' });

                this.leaderboard.initialize().then((profile) => {
                    if (this.state.currentState !== S.LEADERBOARD) return;
                    if (!profile) this.state.change(S.PROFILE_SETUP, { returnState: S.LEADERBOARD });
                    else this._loadLeaderboard();
                }).catch(() => {
                    if (this.state.currentState === S.LEADERBOARD) {
                        this._leaderboardStatus = 'Leaderboard unavailable. Check your connection.';
                    }
                });
            },
            render: (ctx) => this._renderLeaderboard(ctx),
            exit: () => this.ui.clearButtons(),
            onKey: (e) => { if (e.code === 'Escape') this.state.change(S.HUB); }
        });

        // Enter initial state
        const menuH = this.state._handlers[S.MENU];
        if (menuH) menuH.enter();
    }

    async _submitProfileName() {
        if (this._profileSubmitting) return;
        if (!this.leaderboard.isConfigured()) {
            this._profileStatus = 'Leaderboard is not configured yet.';
            return;
        }
        this._profileSubmitting = true;
        this._profileStatus = 'Creating operator profile...';
        try {
            await this.leaderboard.createProfile(this._profileName);
            this.state.change(this._profileReturnState);
        } catch (error) {
            const message = error && error.message ? error.message : 'Unable to create profile.';
            this._profileStatus = /duplicate|unique/i.test(message)
                ? 'That operator name is already taken.'
                : message;
        } finally {
            this._profileSubmitting = false;
        }
    }

    _handleProfileKey(e) {
        if (e.code === 'Escape') {
            this.state.change(this._profileReturnState);
            return;
        }
        if (e.code === 'Enter') {
            this._submitProfileName();
            return;
        }
        if (e.code === 'Backspace') {
            this._profileName = this._profileName.slice(0, -1);
            return;
        }
        if (e.key && /^[A-Za-z0-9_ -]$/.test(e.key) && this._profileName.length < 16) {
            this._profileName += e.key;
        }
    }

    _renderProfileSetup(ctx) {
        const W = this.canvas.width;
        const H = this.canvas.height;
        const cx = W / 2;
        const cy = H / 2;
        ctx.save();
        ctx.fillStyle = '#f59e0b';
        ctx.font = '700 24px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText('OPERATOR PROFILE', cx, cy - 125);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '400 15px Rajdhani';
        ctx.fillText('Choose a unique name for the Endless leaderboard', cx, cy - 95);
        ctx.fillStyle = 'rgba(15,23,42,0.85)';
        ctx.strokeStyle = '#f59e0b';
        Utils.roundRect(ctx, cx - 180, cy - 55, 360, 52, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = this._profileName ? '#e2e8f0' : '#64748b';
        ctx.font = '600 22px Rajdhani';
        ctx.fillText(this._profileName || 'TYPE YOUR NAME', cx, cy - 22);
        ctx.fillStyle = '#64748b';
        ctx.font = '400 12px Rajdhani';
        ctx.fillText(`${this._profileName.length}/16  •  letters, numbers, spaces, _ or -`, cx, cy + 23);
        ctx.fillStyle = this._profileStatus.includes('taken') || this._profileStatus.includes('not configured') ? '#ef4444' : '#94a3b8';
        ctx.font = '400 14px Rajdhani';
        ctx.fillText(this._profileStatus, cx, cy + 48);
        ctx.restore();
        this.ui.renderButtons();
    }

    async _loadLeaderboard() {
        this._leaderboardStatus = 'Loading leaderboard...';
        try {
            const result = await this.leaderboard.getLeaderboard();
            this._leaderboardEntries = result.entries;
            this._leaderboardMe = result.me;
            this._leaderboardStatus = result.entries.length ? '' : 'No Endless scores yet. Set the first record!';
        } catch (error) {
            this._leaderboardStatus = error && error.message
                ? error.message
                : 'Leaderboard unavailable. Try again.';
        }
    }

    _renderLeaderboard(ctx) {
        const W = this.canvas.width;
        const H = this.canvas.height;
        const cx = W / 2;
        ctx.save();
        ctx.fillStyle = '#f59e0b';
        ctx.font = '700 24px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText('∞ ENDLESS LEADERBOARD', cx, 60);
        ctx.fillStyle = '#64748b';
        ctx.font = '400 14px Rajdhani';
        ctx.fillText('Top 10 operators by best score', cx, 82);

        const x = cx - 300;
        const y = 110;
        const rowH = 34;
        ctx.fillStyle = 'rgba(15,23,42,0.78)';
        ctx.strokeStyle = '#1e293b';
        Utils.roundRect(ctx, x, y, 600, rowH * 11, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#64748b';
        ctx.font = '600 13px Rajdhani';
        ctx.textAlign = 'left';
        ctx.fillText('RANK', x + 20, y + 22);
        ctx.fillText('OPERATOR', x + 100, y + 22);
        ctx.textAlign = 'right';
        ctx.fillText('WAVE', x + 480, y + 22);
        ctx.fillText('SCORE', x + 575, y + 22);

        this._leaderboardEntries.forEach((entry, index) => {
            const rowY = y + rowH * (index + 1);
            const mine = this.leaderboard.profile && entry.display_name === this.leaderboard.profile.displayName;
            ctx.fillStyle = mine ? 'rgba(245,158,11,0.12)' : 'rgba(30,41,59,0.28)';
            ctx.fillRect(x + 1, rowY, 598, rowH - 1);
            ctx.fillStyle = index < 3 ? '#f59e0b' : '#cbd5e1';
            ctx.font = '600 15px Rajdhani';
            ctx.textAlign = 'left';
            ctx.fillText(`#${index + 1}`, x + 20, rowY + 22);
            ctx.fillText(entry.display_name, x + 100, rowY + 22);
            ctx.textAlign = 'right';
            ctx.fillText(String(entry.best_wave), x + 480, rowY + 22);
            ctx.fillText(Number(entry.best_score).toLocaleString(), x + 575, rowY + 22);
        });

        if (this._leaderboardMe && this._leaderboardMe.rank > 10) {
            ctx.fillStyle = '#f59e0b';
            ctx.font = '600 16px Rajdhani';
            ctx.textAlign = 'center';
            ctx.fillText(`YOUR RANK  #${this._leaderboardMe.rank}  •  ${Number(this._leaderboardMe.best_score).toLocaleString()} points`, cx, 515);
        } else if (!this._leaderboardMe && !this._leaderboardStatus) {
            ctx.fillStyle = '#64748b';
            ctx.font = '400 14px Rajdhani';
            ctx.textAlign = 'center';
            ctx.fillText('Finish an Endless run to claim your place.', cx, 515);
        }
        if (this._leaderboardStatus) {
            ctx.fillStyle = '#94a3b8';
            ctx.font = '400 14px Rajdhani';
            ctx.textAlign = 'center';
            ctx.fillText(this._leaderboardStatus, cx, 515);
        }
        ctx.restore();
        this.ui.renderButtons();
    }

    // ── Congratulations / Endless unlock ──

    _finishCongrats() {
        const S = this.state.STATES;
        if (this.leaderboard.isConfigured() && !this.leaderboard.hasProfile()) {
            this.state.change(S.PROFILE_SETUP, { returnState: S.HUB });
        } else {
            this.state.change(S.HUB);
        }
    }

    _renderCongrats(ctx) {
        const W = this.canvas.width;
        const H = this.canvas.height;
        const cx = W / 2;
        const cy = H / 2;

        // Dim the game behind the panel
        ctx.save();
        ctx.fillStyle = 'rgba(6,10,18,0.74)';
        ctx.fillRect(0, 0, W, H);
        ctx.restore();

        const pw = 720;
        const ph = 430;
        const px = cx - pw / 2;
        const py = cy - ph / 2 - 16;

        ctx.save();
        ctx.fillStyle = 'rgba(12,18,30,0.97)';
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#22c55e';
        ctx.shadowBlur = 26;
        Utils.roundRect(ctx, px, py, pw, ph, 12);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Header
        ctx.textAlign = 'center';
        ctx.fillStyle = '#22c55e';
        ctx.font = '900 34px Orbitron';
        ctx.fillText('SYSTEM SECURED', cx, py + 60);

        ctx.fillStyle = '#e2e8f0';
        ctx.font = '600 14px Rajdhani';
        ctx.fillText('ALL 6 NODES CLEANED — THE CYBER ATTACK IS REPELLED', cx, py + 86);

        // Story body
        const lines = [
            'Congratulations, Operator. You held the line.',
            'Every infected node is clean, the backdoors are sealed,',
            'credentials are reset and the firewall stands strong.',
            '',
            'You defended the system — and earned ENDLESS MODE.',
        ];
        ctx.font = '400 16px Rajdhani';
        ctx.fillStyle = '#cbd5e1';
        let ly = py + 122;
        for (const line of lines) {
            if (line === '') { ly += 8; continue; }
            ctx.fillText(line, cx, ly);
            ly += 24;
        }

        // Endless banner
        const by = py + 250;
        ctx.fillStyle = 'rgba(245,158,11,0.12)';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        Utils.roundRect(ctx, px + 44, by, pw - 88, 84, 8);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#f59e0b';
        ctx.font = '700 19px Orbitron';
        ctx.fillText('∞  ENDLESS MODE UNLOCKED', cx, by + 28);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '400 13px Rajdhani';
        ctx.fillText('Survive unlimited waves and compete against other operators', cx, by + 52);
        ctx.fillText('on the online leaderboard — play as long as you like.', cx, by + 70);

        // Total best score
        const totalBest = this.levels.levels.reduce((sum, l) => sum + (l.bestScore || 0), 0);
        ctx.fillStyle = '#64748b';
        ctx.font = '500 13px Rajdhani';
        ctx.fillText(`TOTAL BEST SCORE  ${totalBest}`, cx, py + ph - 24);

        ctx.restore();

        this.ui.renderButtons();
    }

    // ── HUB Buttons ──

    _buildHubButtons() {
        const W = this.canvas.width;
        const H = this.canvas.height;
        const levels = this.levels.levels;
        const cols = 3;
        const cardW = 280;
        const cardH = 112;
        const gapX = 16;
        const totalW = cols * cardW + (cols - 1) * gapX;
        const startX = (W - totalW) / 2 + cardW / 2;
        const row1Y = 170;
        const row2Y = 360;
        this._hubLockY = 248;
        const group2 = this.levels.isGroup2Unlocked();

        this._hubPositions = [];

        for (let i = 0; i < levels.length; i++) {
            const level = levels[i];
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = startX + col * (cardW + gapX);
            const y = row === 0 ? row1Y : row2Y;

            this._hubPositions.push({ x, y, w: cardW, h: cardH, level, row });

            let status = level.completed ? 'completed' : (level.unlocked ? 'unlocked' : 'locked');
            if (i >= 3 && !group2) status = 'locked';

            if (status === 'locked' && i <= 2) {
                // ACT I locked nodes can be skipped with the Code Breaker.
                this.ui.addButton(`lvl${i}`, level.name, x, y, cardW, cardH,
                    () => this._tryShortcutUnlock(i),
                    { color: '#475569', subtitle: level.desc, card: true, icon: level.id, status: 'locked' });
            } else if (status === 'locked') {
                // ACT II: no shortcut. Locked either by the gate or by the
                // previous node not being completed yet.
                const lockMsg = !group2
                    ? 'Breach the lock between the acts first'
                    : 'Complete the previous node first';
                this.ui.addButton(`lvl${i}`, level.name, x, y, cardW, cardH,
                    () => {
                        this._hubMessage = lockMsg;
                        this._hubMessageTimer = 2.5;
                    },
                    { color: '#334155', subtitle: level.desc, card: true, icon: level.id, status: 'locked', disabled: true });
            } else {
                const color = level.completed ? '#22c55e' : '#3b82f6';
                this.ui.addButton(`lvl${i}`, level.name, x, y, cardW, cardH,
                    () => {
                        this.levels.startLevel(i);
                        this.state.change(this.state.STATES.LEVEL);
                    },
                    { color, subtitle: level.desc, card: true, icon: level.id, status, score: level.bestScore });
            }
        }

        // ACT II gate node (drawn manually, hidden clickable button)
        if (!group2) {
            this.ui.addButton('packet-purge', '', W / 2, this._hubLockY, 64, 64,
                () => this._tryStartPacketPurge(),
                { hidden: true });
        }

        // Endless Mode button (below ACT II)
        const allDone = this.levels.isAllCompleted();
        const endlessY = 458;
        if (allDone) {
            const bestScore = this.levels._loadEndlessBest();
            const endlessSubtitle = bestScore > 0 ? `Best: ${bestScore}` : 'Unlimited challenge, unlimited fun';
            this.ui.addButton('endless', '∞ ENDLESS MODE', W / 2, endlessY, 240, 46,
                () => this.state.change(this.state.STATES.ENDLESS),
                { color: '#f59e0b', subtitle: endlessSubtitle }
            );
            this.ui.addButton('leaderboard', '🏆 LEADERBOARD', W / 2, endlessY + 54, 220, 36,
                () => this.state.change(this.state.STATES.LEADERBOARD),
                { color: '#f59e0b' }
            );
        } else {
            const remaining = this.levels.levels.filter(l => !l.completed).length;
            this.ui.addButton('endless', `🔒 ENDLESS MODE`, W / 2, endlessY, 240, 46,
                () => { },
                { color: '#475569', disabled: true, subtitle: `${remaining} nodes remaining` }
            );
        }

        // Back to menu
        this.ui.addButton('menu', '← MENU', 70, H - 35, 100, 32,
            () => this.state.change(this.state.STATES.MENU),
            { color: '#475569' }
        );

        // Sound toggle
        this.ui.addButton('sound', '', W / 2, H - 35, 44, 30,
            () => {
                Sound.toggleMute();
                this._updateSoundButton();
                if (!Sound.isMuted()) Sound.startAmbient();
            },
            { color: '#475569', custom: 'sound' }
        );
        this._updateSoundButton();

        // Reset Data
        this.ui.addButton('reset', '🗑 RESET', W - 75, H - 35, 110, 32,
            () => {
                if (window.confirm('Are you sure you want to delete all data and start fresh?')) {
                    ['sb_progress', 'sb_energy', 'sb_congrats_seen',
                        'sb_group2_unlocked', 'sb_dualring', 'sb_packetpurge']
                        .forEach(k => localStorage.removeItem(k));
                    window.location.href = window.location.href;
                }
            },
            { color: '#ef4444' }
        );
    }

    _renderHubConnections(ctx) {
        const W = this.canvas.width;
        const cols = 3;
        const cardW = 280;
        const cardH = 112;
        const gapX = 16;
        const totalW = cols * cardW + (cols - 1) * gapX;
        const left = (W - totalW) / 2 - 18;
        const panelW = totalW + 36;
        const row1Y = 170;
        const row2Y = 360;
        const panel1Top = row1Y - cardH / 2 - 34;
        const panel1H = cardH + 34;
        const panel2Top = row2Y - cardH / 2 - 34;
        const panel2H = cardH + 34;
        const lockY = this._hubLockY || 247;

        ctx.save();

        // Act panels
        const drawPanel = (top, h, color) => {
            ctx.fillStyle = 'rgba(15,23,42,0.45)';
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            Utils.roundRect(ctx, left, top, panelW, h, 12);
            ctx.fill();
            ctx.stroke();
        };
        drawPanel(panel1Top, panel1H, 'rgba(59,130,246,0.25)');
        drawPanel(panel2Top, panel2H, 'rgba(245,158,11,0.25)');

        // Act labels
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#3b82f6';
        ctx.font = '700 12px Orbitron';
        ctx.fillText('ACT I  ·  SYSTEM BREACH', left + 16, panel1Top + 20);
        ctx.fillStyle = '#f59e0b';
        ctx.fillText('ACT II  ·  DEEP INCURSION', left + 16, panel2Top + 20);

        // Connector to the gate
        ctx.strokeStyle = 'rgba(71,85,105,0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(W / 2, panel1Top + panel1H);
        ctx.lineTo(W / 2, lockY - 24);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(W / 2, lockY + 24);
        ctx.lineTo(W / 2, panel2Top);
        ctx.stroke();

        ctx.restore();
    }

    _renderHubLockNode(ctx) {
        const W = this.canvas.width;
        const x = W / 2;
        const y = this._hubLockY || 247;
        const unlocked = this.levels.isGroup2Unlocked();
        const color = unlocked ? '#22c55e' : '#f59e0b';

        ctx.save();
        // Node
        ctx.fillStyle = 'rgba(15,23,42,0.96)';
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Lock / check glyph
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2;
        if (unlocked) {
            ctx.beginPath();
            ctx.moveTo(x - 8, y);
            ctx.lineTo(x - 2, y + 7);
            ctx.lineTo(x + 9, y - 7);
            ctx.stroke();
        } else {
            // Body
            Utils.roundRect(ctx, x - 9, y - 2, 18, 13, 3);
            ctx.fill();
            // Shackle
            ctx.beginPath();
            ctx.arc(x, y - 2, 5, Math.PI, 0, false);
            ctx.stroke();
        }
        ctx.restore();
    }

    // ── Hub interactions / easter egg ──

    _tryShortcutUnlock(levelIndex) {
        if (!this.energy.canAfford('SHORTCUT')) {
            this._hubMessage = 'Not enough energy (2⚡ required)';
            this._hubMessageTimer = 2.5;
            return;
        }
        if (!this.energy.spend('SHORTCUT')) return;
        const level = this.levels.levels[levelIndex];
        this.state.change(this.state.STATES.LOCKPICK, {
            reason: 'shortcut',
            difficulty: level.lockpickDiff,
            levelIndex
        });
    }

    _pickEnergyEggCell() {
        if (this.energy.currentEnergy >= this.energy.maxEnergy) {
            this._energyEggCell = null;
            return;
        }
        this._energyEggCell = Math.floor(Math.random() * this.energy.maxEnergy);
    }

    _tryStartDualRing() {
        const WINDOW = 5 * 60 * 1000;
        const MAX = 2;
        if (!this.dualRingGate.canAttempt(WINDOW, MAX)) {
            const wait = Math.ceil(this.dualRingGate.timeUntilReset(WINDOW, MAX));
            this._hubMessage = `Recovery module recharging (${wait}s)`;
            this._hubMessageTimer = 2.5;
            return;
        }
        this.dualRingGate.record(WINDOW);
        this._energyEggCell = null;

        const mechanic = new DualRingMechanic({
            maxEnergy: this.energy.maxEnergy,
            currentEnergy: this.energy.currentEnergy
        });
        this.state.change(this.state.STATES.MINIGAME, {
            mechanic,
            title: 'ENERGY RECOVERY',
            subtitle: 'Nail 3 alignments in a row — the speed shifts every round',
            hint: 'Press SPACE / tap when both markers line up',
            onComplete: (success, m) => {
                if (success) {
                    const gained = this.energy.addEnergy(m.reward);
                    this._hubMessage = `+${gained} ENERGY`;
                } else {
                    this._hubMessage = 'Recovery failed';
                }
                this._hubMessageTimer = 2.5;
                this.state.change(this.state.STATES.HUB);
            }
        });
    }

    _tryStartPacketPurge() {
        if (this.levels.isGroup2Unlocked()) return;
        if (!this.levels.isActOneComplete()) {
            this._hubMessage = 'Clear all ACT I nodes first';
            this._hubMessageTimer = 2.5;
            return;
        }
        const WINDOW = 3 * 60 * 1000;
        const MAX = 2;
        if (!this.packetGate.canAttempt(WINDOW, MAX)) {
            const wait = Math.ceil(this.packetGate.timeUntilReset(WINDOW, MAX));
            this._hubMessage = `The lock is recalibrating (${wait}s)`;
            this._hubMessageTimer = 2.5;
            return;
        }
        this.packetGate.record(WINDOW);

        const mechanic = new PacketPurgeMechanic();
        this.state.change(this.state.STATES.MINIGAME, {
            mechanic,
            title: 'PACKET PURGE',
            subtitle: 'Two waves — purge infected packets before they reach the core',
            hint: 'Tap the faster RED packets — leave the blue ones',
            onComplete: (success) => {
                if (success) {
                    this.levels.unlockGroup2();
                    this._hubMessage = 'ACT II UNLOCKED';
                } else {
                    this._hubMessage = 'Purge failed — the lock holds';
                }
                this._hubMessageTimer = 3.0;
                this.state.change(this.state.STATES.HUB);
            }
        });
    }

    /** Routes canvas presses: UI buttons → minigame → hidden energy easter egg. */
    _hitTestUI(x, y) {
        if (this.ui.handleClick(x, y)) return true;

        if (this.state.currentState === this.state.STATES.MINIGAME &&
            this._activeMinigame && this._activeMinigame.handlePointer) {
            this._activeMinigame.handlePointer(x, y, 'down');
            return true;
        }

        if (this.state.currentState === this.state.STATES.HUB &&
            this._energyEggCell !== null &&
            this.energy.currentEnergy < this.energy.maxEnergy) {
            const r = this.ui.getEnergyCellRect(this._energyEggCell, this.energy.maxEnergy);
            if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
                this._tryStartDualRing();
                return true;
            }
        }
        return false;
    }

    /** Retry from the failure screen, gated by the restart cooldown. */
    _restartFromGameOver() {
        if ((this._goCooldown || 0) > 0) return;
        this.levels.startLevel(this._goLevelIndex);
        this.state.change(this.state.STATES.LEVEL);
    }

    /** Reflect the restart cooldown on the RETRY button. */
    _updateRetryButton() {
        const btn = this.ui.buttons.find(b => b.id === 'retry');
        if (!btn) return;
        if (this._goCooldown > 0) {
            btn.disabled = true;
            btn.label = `↻ RETRY (${this._goCooldown.toFixed(1)}s)`;
        } else {
            btn.disabled = false;
            btn.label = '↻ RETRY';
        }
    }

    /** Reflect the mute state on the HUB sound button. */
    _updateSoundButton() {
        const btn = this.ui.buttons.find(b => b.id === 'sound');
        if (!btn) return;
        btn.muted = Sound.isMuted();
    }

    // ── Input ──

    _setupInput() {
        this.canvas.style.cursor = 'pointer';
        this._pendingInputOffset = 0;
        this._lastSimWall = (typeof performance !== 'undefined') ? performance.now() : 0;

        this.input = new InputManager(this.canvas, {
            hitTestUI: (x, y) => this._hitTestUI(x, y),
            onMove: (x, y) => this.ui.updateMouse(x, y),
            onPress: (pointerType, ts) => this._handleConfirm(ts),
            onSwipe: (dir, ts) => this._handleSwipe(dir, ts),
            onKey: (action) => this._handleKeyAction(action)
        });
    }

    /**
     * Sub-frame input offset: how far past the last simulated frame the
     * key/pointer press happened, capped to one worst-case frame.
     */
    _computeInputOffset(timestamp) {
        if (typeof timestamp !== 'number' || timestamp <= 0) return 0;
        const dt = (timestamp - this._lastSimWall) / 1000;
        if (!isFinite(dt) || dt <= 0) return 0;
        return Math.min(dt, 1 / 30);
    }

    _dispatchKey(action) {
        this._pendingInputOffset = this._computeInputOffset(action.timestamp);
        try {
            this.state.handleKey(Object.assign({ preventDefault: () => {} }, action));
        } finally {
            this._pendingInputOffset = 0;
        }
    }

    _handleKeyAction(action) {
        this._dispatchKey(action);
    }

    _handleConfirm(timestamp) {
        const S = this.state.STATES;
        const state = this.state.currentState;
        if (state === S.LEVEL || state === S.ENDLESS || state === S.MENU ||
            state === S.GAME_OVER || state === S.ENDLESS_OVER ||
            state === S.CONGRATS || state === S.MINIGAME) {
            this._dispatchKey({ code: 'Space', timestamp });
        }
    }

    _handleSwipe(dir, timestamp) {
        if (this.state.currentState !== this.state.STATES.LOCKPICK) return;
        const map = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
        this._dispatchKey({ code: map[dir], timestamp });
    }

    // ════════════════════════════════════════
    //  BACKGROUND EFFECTS & RENDERING
    //  CG Concepts Implemented: Animation, Transformation,
    //  Gradient Rendering, Particle Systems
    // ════════════════════════════════════════

    _createBgParticles(count) {
        const particles = [];
        for (let i = 0; i < count; i++) {
            particles.push({
                x: Math.random() * 960,
                y: Math.random() * 640,
                size: Utils.randFloat(0.5, 2),
                speed: Utils.randFloat(5, 20),
                alpha: Utils.randFloat(0.15, 0.4),
                angle: Utils.randFloat(0, Math.PI * 2)
            });
        }
        return particles;
    }

    _createDataRain(count) {
        const drops = [];
        const chars = '01アイウエオカキクケコ⟡⟢⟣';
        for (let i = 0; i < count; i++) {
            drops.push({
                x: Utils.randFloat(0, 960),
                y: Utils.randFloat(-200, 640),
                speed: Utils.randFloat(30, 80),
                char: chars[Utils.randInt(0, chars.length - 1)],
                alpha: Utils.randFloat(0.04, 0.12),
                size: Utils.randInt(10, 14)
            });
        }
        return drops;
    }

    _updateBgParticles(dt) {
        for (const p of this.bgParticles) {
            // CG: Translation + Trigonometric movement
            // Calculate velocity vector using Cosine for X and Sine for Y axis translation
            p.x += Math.cos(p.angle) * p.speed * dt;
            p.y += Math.sin(p.angle) * p.speed * dt;

            // Add a slight random wobble to the particle's trajectory
            p.angle += Utils.randFloat(-0.3, 0.3) * dt;

            // CG: Coordinate Wrapping
            // Seamlessly wrap particles across screen boundaries to maintain constant density
            if (p.x < -5) p.x = 965;
            if (p.x > 965) p.x = -5;
            if (p.y < -5) p.y = 645;
            if (p.y > 645) p.y = -5;
        }
    }

    _updateDataRain(dt) {
        const chars = '01アイウエオカキクケコ⟡⟢⟣';
        for (const d of this.dataRain) {
            // CG: Linear Translation (Y-axis only) for the Matrix digital rain effect
            d.y += d.speed * dt;

            // Reset position to top with a random character when it drops below the screen
            if (d.y > 660) {
                d.y = Utils.randFloat(-60, -10);
                d.x = Utils.randFloat(0, 960);
                d.char = chars[Utils.randInt(0, chars.length - 1)];
            }
        }
    }

    _renderBackground(ctx, W, H) {
        // 1. Base gradient — CG: Linear gradient rendering
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, '#050810');
        grad.addColorStop(0.5, '#0a0e17');
        grad.addColorStop(1, '#0d1220');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // 2. Grid — CG: Coordinate system visualization
        ctx.save();
        ctx.strokeStyle = 'rgba(30, 41, 59, 0.2)';
        ctx.lineWidth = 0.5;
        const gridSize = 60;
        for (let x = 0; x <= W; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
            ctx.stroke();
        }
        for (let y = 0; y <= H; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
            ctx.stroke();
        }
        ctx.restore();

        // 3. Data rain — CG: Translation animation
        ctx.save();
        for (const d of this.dataRain) {
            ctx.globalAlpha = d.alpha;
            ctx.fillStyle = '#3b82f6';
            ctx.font = d.size + 'px monospace';
            ctx.fillText(d.char, d.x, d.y);
        }
        ctx.restore();

        // 4. Floating particles — CG: Particle system + smooth animation
        ctx.save();
        for (const p of this.bgParticles) {
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = '#e2e8f0';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}
