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
    }

    render(ctx) {
        const W = this.canvas.width;
        const H = this.canvas.height;

        // Clear
        ctx.clearRect(0, 0, W, H);

        // Background — CG: Gradient rendering
        this._renderBackground(ctx, W, H);

        // State render
        this.state.render(ctx);
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

                // Title
                ctx.fillStyle = '#e2e8f0';
                ctx.font = '900 40px Orbitron';
                ctx.textAlign = 'center';
                ctx.fillText('SYNCBREAKER', cx, 70);

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

                // Network topology connections — CG: Line rendering
                this._renderHubConnections(ctx);

                // Buttons
                this.ui.renderButtons();

                // Footer info
                ctx.fillStyle = '#475569';
                ctx.font = '400 13px Rajdhani';
                ctx.textAlign = 'center';
                ctx.fillText('🔒 Use code breaker to access locked nodes (2 energy)', W / 2, H - 16);
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
                    setTimeout(() => this.state.change(S.HUB), 1500);
                }

                if (this.levels.levelFailed === true) {
                    this.levels.levelFailed = 'handled';
                    this.state.change(S.GAME_OVER, {
                        levelIndex: this.levels.currentLevelIndex,
                        score: this.levels.score,
                        usedRevive: this.levels.usedRevive
                    });
                }
            },
            render: (ctx) => {
                const W = this.canvas.width;
                const H = this.canvas.height;

                this.ui.renderScore(this.levels.score, this.levels.combo);
                this.ui.renderEnergyBar({
                    current: this.energy.currentEnergy,
                    max: this.energy.maxEnergy,
                    nextRegenIn: this.energy.getTimeToNextRegen()
                });
                this.levels.render(ctx, W, H);

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
                if (e.code === 'Space') this.levels.hit();
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
                            this.levels.usedRevive = true;
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
                this._usedRevive = lCtx.usedRevive || false;

                // Revive button: if energy available AND revive not yet used on this level
                if (!this._noRevive && !this._usedRevive && this.energy.canAfford('REVIVE')) {
                    const level = this.levels.levels[this._goLevelIndex];
                    this.ui.addButton('revive', '🔄 TRY RECOVERY PROTOCOL (1⚡)', cx, cy + 30, 290, 42,
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
                    () => {
                        this.levels.startLevel(this._goLevelIndex);
                        this.state.change(S.LEVEL);
                    },
                    { color: '#3b82f6' }
                );

                // Back to hub
                this.ui.addButton('hub', '← NODE SELECT', cx, cy + 135, 200, 40,
                    () => this.state.change(S.HUB),
                    { color: '#64748b' }
                );
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
                } else if (this._usedRevive) {
                    ctx.fillStyle = '#f59e0b';
                    ctx.font = '400 14px Rajdhani';
                    ctx.fillText('Recovery already used on this node', cx, cy);
                }

                this.ui.renderButtons();
            },
            exit: () => this.ui.clearButtons(),
            onKey: (e) => {
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
            render: (ctx) => {
                const W = this.canvas.width;
                const H = this.canvas.height;

                this.ui.renderScore(this.levels.score, this.levels.combo);
                this.ui.renderEnergyBar({
                    current: this.energy.currentEnergy,
                    max: this.energy.maxEnergy,
                    nextRegenIn: this.energy.getTimeToNextRegen()
                });
                this.levels.renderEndless(ctx, W, H);
            },
            exit: () => this.ui.clearButtons(),
            onKey: (e) => {
                if (e.code === 'Space') this.levels.hitEndless();
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

                this.ui.renderButtons();
            },
            exit: () => this.ui.clearButtons(),
            onKey: (e) => {
                if (e.code === 'Escape') this.state.change(S.HUB);
            }
        });

        // Enter initial state
        const menuH = this.state._handlers[S.MENU];
        if (menuH) menuH.enter();
    }

    // ── HUB Buttons ──

    _buildHubButtons() {
        const W = this.canvas.width;
        const H = this.canvas.height;
        const levels = this.levels.levels;
        const cols = 3;
        const btnW = 190;
        const btnH = 70;
        const gapX = 20;
        const gapY = 18;
        const totalW = cols * btnW + (cols - 1) * gapX;
        const startX = (W - totalW) / 2 + btnW / 2;
        const startY = 120;

        // Save positions (for topology lines)
        this._hubPositions = [];

        for (let i = 0; i < levels.length; i++) {
            const level = levels[i];
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = startX + col * (btnW + gapX);
            const y = startY + row * (btnH + gapY);

            this._hubPositions.push({ x, y, w: btnW, h: btnH, level });

            if (level.unlocked) {
                const label = level.completed ? `✓ ${level.name}` : level.name;
                const color = level.completed ? '#22c55e' : '#3b82f6';

                this.ui.addButton(`lvl${i}`, label, x, y, btnW, btnH,
                    () => {
                        this.levels.startLevel(i);
                        this.state.change(this.state.STATES.LEVEL);
                    },
                    { color, subtitle: level.desc }
                );
            } else {
                this.ui.addButton(`lvl${i}`, `🔒 ${level.name}`, x, y, btnW, btnH,
                    () => {
                        if (this.energy.canAfford('SHORTCUT')) {
                            if (this.energy.spend('SHORTCUT')) {
                                this.state.change(this.state.STATES.LOCKPICK, {
                                    reason: 'shortcut',
                                    difficulty: level.lockpickDiff,
                                    levelIndex: i
                                });
                            }
                        }
                    },
                    { color: '#475569', subtitle: level.desc }
                );
            }
        }

        // Endless Mode button
        const allDone = this.levels.isAllCompleted();
        const endlessY = startY + 2 * (btnH + gapY) + btnH / 2 + 30;
        if (allDone) {
            const bestScore = this.levels._loadEndlessBest();
            const endlessSubtitle = bestScore > 0 ? `Best: ${bestScore}` : 'Unlimited challenge, unlimited fun';
            this.ui.addButton('endless', '∞ ENDLESS MODE', W / 2, endlessY, 240, 50,
                () => this.state.change(this.state.STATES.ENDLESS),
                { color: '#f59e0b', subtitle: endlessSubtitle }
            );
        } else {
            const remaining = this.levels.levels.filter(l => !l.completed).length;
            this.ui.addButton('endless', `🔒 ENDLESS MODE`, W / 2, endlessY, 240, 50,
                () => { },
                { color: '#475569', disabled: true, subtitle: `${remaining} nodes remaining` }
            );
        }

        // Back to menu
        this.ui.addButton('menu', '← MENU', 70, H - 35, 100, 32,
            () => this.state.change(this.state.STATES.MENU),
            { color: '#475569' }
        );

        // Reset Data
        this.ui.addButton('reset', '🗑 RESET', W - 75, H - 35, 110, 32,
            () => {
                console.log("Reset button clicked");
                if (window.confirm('Are you sure you want to delete all data and start fresh?')) {
                    console.log("Reset confirmed, clearing data...");
                    localStorage.removeItem('sb_progress');
                    localStorage.removeItem('sb_energy');
                    window.location.href = window.location.href; // Guaranteed reload for mobile browsers / Live Server
                }
            },
            { color: '#ef4444' }
        );
    }

    _renderHubConnections(ctx) {
        if (!this._hubPositions || this._hubPositions.length < 2) return;

        ctx.save();
        for (let i = 0; i < this._hubPositions.length - 1; i++) {
            const a = this._hubPositions[i];
            const b = this._hubPositions[i + 1];
            const completed = a.level.completed;

            // Line color: completed → green, unlocked → blue, locked → gray
            ctx.strokeStyle = completed ? 'rgba(34,197,94,0.3)' : 'rgba(71,85,105,0.15)';
            ctx.lineWidth = completed ? 2 : 1;

            // Connection line (edge to edge)
            ctx.beginPath();
            ctx.moveTo(a.x + a.w * 0.4, a.y);
            ctx.lineTo(b.x - b.w * 0.4, b.y);
            ctx.stroke();

            // Connection point (small dot in center)
            if (completed) {
                const mx = (a.x + b.x) / 2;
                const my = (a.y + b.y) / 2;
                ctx.fillStyle = 'rgba(34,197,94,0.4)';
                ctx.beginPath();
                ctx.arc(mx, my, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }

    // ── Input ──

    _setupInput() {
        const canvas = this.canvas;

        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (canvas.width / rect.width);
            const y = (e.clientY - rect.top) * (canvas.height / rect.height);
            this.ui.updateMouse(x, y);
        });

        canvas.addEventListener('click', (e) => {
            const rect = canvas.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (canvas.width / rect.width);
            const y = (e.clientY - rect.top) * (canvas.height / rect.height);
            this.ui.handleClick(x, y);
        });

        document.addEventListener('keydown', (e) => {
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                e.preventDefault();
            }
            this.state.handleKey(e);
        });

        // ── MOBILE TOUCH SUPPORT ──
        let touchStartX = 0;
        let touchStartY = 0;

        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length > 0) {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                
                const rect = canvas.getBoundingClientRect();
                const x = (touchStartX - rect.left) * (canvas.width / rect.width);
                const y = (touchStartY - rect.top) * (canvas.height / rect.height);
                
                // 1. Oku tıklamaları UI butonları için
                if (this.ui.handleClick(x, y)) {
                    e.preventDefault();
                    return;
                }

                // 2. Buton değilse SPACE say
                const state = this.state.currentState;
                const S = this.state.STATES;
                
                if (state === S.LEVEL || state === S.ENDLESS || state === S.MENU || state === S.GAME_OVER || state === S.ENDLESS_OVER) {
                    e.preventDefault();
                    this.state.handleKey({ code: 'Space', preventDefault: () => {} });
                }
            }
        }, { passive: false });

        canvas.addEventListener('touchend', (e) => {
            if (e.changedTouches.length > 0) {
                const touchEndX = e.changedTouches[0].clientX;
                const touchEndY = e.changedTouches[0].clientY;
                
                const dx = touchEndX - touchStartX;
                const dy = touchEndY - touchStartY;
                
                // 3. Lockpick mini oyunu için swipe (kaydırma) algıla
                if (this.state.currentState === this.state.STATES.LOCKPICK) {
                    const threshold = 30; // Minimum kaydırma
                    
                    if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
                        e.preventDefault();
                        if (Math.abs(dx) > Math.abs(dy)) {
                            // Yatay
                            if (dx > 0) this.state.handleKey({ code: 'ArrowRight', preventDefault: () => {} });
                            else this.state.handleKey({ code: 'ArrowLeft', preventDefault: () => {} });
                        } else {
                            // Dikey
                            if (dy > 0) this.state.handleKey({ code: 'ArrowDown', preventDefault: () => {} });
                            else this.state.handleKey({ code: 'ArrowUp', preventDefault: () => {} });
                        }
                    }
                }
            }
        }, { passive: false });

        canvas.style.cursor = 'pointer';
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
