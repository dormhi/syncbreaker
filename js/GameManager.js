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
        // DOM overlay for operator name + password (absent in headless tests).
        this.profileForm = (typeof document !== 'undefined' && document.createElement && typeof ProfileForm !== 'undefined')
            ? new ProfileForm(canvas) : null;
        this._securePromptDismissed = false;

        // Campaign: acts, stages, gates (docs/ACT_PLAN.md)
        this.progress = new CampaignProgress(CAMPAIGN);
        this._stage = null;      // { actId, index } of the stage being played
        this._actView = this.progress.currentActId();
        // Act map carousel: focused act index and its eased scroll position.
        this._mapIndex = this._actView - 1;
        this._mapScroll = this._mapIndex;
        this._wheelCooldown = 0;

        // Challenge attempt windows (easter egg / gates)
        this.dualRingGate = new ChallengeGate('sb_dualring');
        this._gateTrackers = {};

        // Hidden energy easter egg + transient hub message
        this._energyEggCell = null;
        this._hubMessage = '';
        this._hubMessageTimer = 0;

        // Quiet hint line + field guide
        this.tipBar = new TipBar();
        this._guidePage = 0;
        this._guideSeen = this._readFlag('sb_guide_seen');
        // Guide page content scrolls inside a clipped viewport.
        this._guideScroll = 0;
        this._guideScrollTarget = 0;
        this._guideMax = 0;

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
        this.tipBar.update(dt);
        this.bgTime += dt;
        this._updateBgParticles(dt);
        this._updateDataRain(dt);
        // The "leave this game?" prompt pauses the game underneath.
        if (!this._quit) this.state.update(dt);

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

        // State render (frozen pose while the leave prompt is open)
        this.state.render(ctx, this._quit ? 0 : alpha);
        if (this._quit) this._renderQuitConfirm(ctx, W, H);
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
                this._setBrandLink(true);
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
                ctx.fillText('(v3)', cx + titleW / 2 + 22, 56);
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
                    { text: 'Clear every stage of an act, then breach the gate to the next one.', color: '#e2e8f0' },
                    { text: `${CAMPAIGN.acts.length} acts stand between the attacker and full control of the system.`, color: '#e2e8f0' },
                    { text: 'If an operation fails, the code breaker can run the recovery protocol.', color: '#e2e8f0' },
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

                // Version + author
                ctx.fillStyle = 'rgba(100,116,139,0.6)';
                ctx.font = '400 12px Rajdhani';
                ctx.textAlign = 'center';
                ctx.fillText('v3.0 · Written by dormhi', cx, H - 16);

                // Credits
                ctx.fillStyle = 'rgba(148,163,184,0.55)';
                ctx.font = '300 12px Rajdhani';
                ctx.textAlign = 'right';
                ctx.fillText('thanks for birlikterutin family', W - 16, H - 32);
                ctx.fillText('alpyso and ezgyso', W - 16, H - 16);

                // Back pressed once on the menu: warn before leaving the site.
                if (this._exitArmed > 0) {
                    ctx.save();
                    ctx.globalAlpha = Math.min(1, this._exitArmed * 2);
                    ctx.fillStyle = 'rgba(15,23,42,0.92)';
                    ctx.strokeStyle = 'rgba(245,158,11,0.6)';
                    Utils.roundRect(ctx, cx - 190, H - 104, 380, 34, 17);
                    ctx.fill();
                    ctx.stroke();
                    ctx.fillStyle = '#f59e0b';
                    ctx.font = '600 15px Rajdhani';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('Press back again to leave SyncBreaker', cx, H - 87);
                    ctx.restore();
                }
            },
            update: (dt) => {
                if (this._exitArmed > 0) this._exitArmed -= dt;
            },
            exit: () => {
                this.ui.clearButtons();
                this._setBrandLink(false);
                this._exitArmed = 0;
            },
            onKey: (e) => {
                if (e.code === 'Space' || e.code === 'Enter') this.state.change(S.HUB);
            }
        });

        // ── HUB (Act map) ──
        this.state.register(S.HUB, {
            enter: () => {
                this.ui.clearButtons();
                Sound.startAmbient();
                this._mapIndex = (this._actView || this.progress.currentActId()) - 1;
                this._mapScroll = this._mapIndex;
                this._buildActMapButtons();
                this._pickEnergyEggCell();
                this.tipBar.setTips('map', TipBar.MAP);
            },
            update: (dt) => {
                if (this._hubMessageTimer > 0) this._hubMessageTimer -= dt;
                if (this._wheelCooldown > 0) this._wheelCooldown -= dt;
                // Ease the carousel toward the focused act.
                this._mapScroll += (this._mapIndex - this._mapScroll) * Math.min(1, dt * 10);
                if (Math.abs(this._mapIndex - this._mapScroll) < 0.001) this._mapScroll = this._mapIndex;
                // Catch-up: a finished campaign shows the celebration once.
                if (this.progress.isCampaignComplete() && !this.progress.congratsSeen) {
                    this.progress.markCongratsSeen();
                    this.state.change(S.CONGRATS);
                }
            },
            render: (ctx) => {
                const W = this.canvas.width;
                const H = this.canvas.height;

                ctx.fillStyle = '#e2e8f0';
                ctx.font = '700 22px Orbitron';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'alphabetic';
                ctx.fillText('OPERATION MAP', W / 2, 30);

                ctx.fillStyle = '#64748b';
                ctx.font = '400 13px Rajdhani';
                ctx.fillText('Clear every stage of an act, then breach the gate', W / 2, 48);

                this._renderHubHeader(ctx, W);

                this.ui.renderEnergyBar({
                    current: this.energy.currentEnergy,
                    max: this.energy.maxEnergy,
                    nextRegenIn: this.energy.getTimeToNextRegen()
                });

                this._renderActMap(ctx);
                this.ui.renderButtons();
                this._renderHubMessage(ctx, W, H);
                this.tipBar.render(ctx, W / 2, H - 20, this._inputMode(), 560);
            },
            exit: () => this.ui.clearButtons(),
            onKey: (e) => {
                if (e.code === 'Escape') this.state.change(S.MENU);
                if (e.code === 'KeyH') this._openGuide();
            }
        });

        // ── ACT (stage selection inside one act) ──
        this.state.register(S.ACT, {
            enter: (context) => {
                this.ui.clearButtons();
                Sound.startAmbient();
                if (context && context.actId) this._actView = context.actId;
                this._buildActButtons();
                const act = this.progress.act(this._actView);
                this.tipBar.setTips('act' + this._actView,
                    [TipBar.ACT.common].concat((act && TipBar.ACT[act.game]) || []));
            },
            update: (dt) => {
                if (this._hubMessageTimer > 0) this._hubMessageTimer -= dt;
            },
            render: (ctx) => {
                const W = this.canvas.width;
                const H = this.canvas.height;
                this.ui.renderEnergyBar({
                    current: this.energy.currentEnergy,
                    max: this.energy.maxEnergy,
                    nextRegenIn: this.energy.getTimeToNextRegen()
                });
                this._renderActScreen(ctx);
                this.ui.renderButtons();
                this._renderHubMessage(ctx, W, H);
                this.tipBar.render(ctx, W / 2, H - 35, this._inputMode(), 560);
            },
            exit: () => this.ui.clearButtons(),
            onKey: (e) => {
                if (e.code === 'Escape') this.state.change(S.HUB);
                if (e.code === 'KeyH') this._openGuide();
            }
        });

        // ── GUIDE (field guide, opened from the map / act screen) ──
        this.state.register(S.GUIDE, {
            enter: (context) => {
                const c = context || {};
                this._guideReturn = c.returnState || S.HUB;
                this._guideReturnCtx = c.returnContext || null;
                if (typeof c.page === 'number') this._guidePage = c.page;
                if (!this._guideSeen) {
                    this._guideSeen = true;
                    this._writeFlag('sb_guide_seen');
                }
                this._buildGuideButtons();
            },
            update: (dt) => {
                // Ease the content toward its scroll target.
                const d = this._guideScrollTarget - this._guideScroll;
                this._guideScroll = Math.abs(d) < 0.5 ? this._guideScrollTarget : this._guideScroll + d * Math.min(1, dt * 14);
            },
            render: (ctx) => this._renderGuide(ctx),
            exit: () => this.ui.clearButtons(),
            onKey: (e) => {
                if (e.code === 'ArrowRight' || e.code === 'KeyD') this._setGuidePage(this._guidePage + 1);
                if (e.code === 'ArrowLeft' || e.code === 'KeyA') this._setGuidePage(this._guidePage - 1);
                if (e.code === 'ArrowDown' || e.code === 'KeyS') this._guideScrollBy(48);
                if (e.code === 'ArrowUp' || e.code === 'KeyW') this._guideScrollBy(-48);
                if (e.code === 'PageDown') this._guideScrollBy(240);
                if (e.code === 'PageUp') this._guideScrollBy(-240);
                if (e.code === 'Escape' || e.code === 'KeyH' || e.code === 'Enter') this._closeGuide();
            }
        });

        // ── LEVEL (Gameplay) ──
        this.state.register(S.LEVEL, {
            enter: () => {
                this.ui.clearButtons();
                Sound.stopAmbient();
                this._addLeaveButton({
                    label: this.levels.currentLevel ? this.levels.currentLevel.name : '',
                    title: 'LEAVE THIS STAGE?',
                    detail: 'Your progress in this stage will be lost.',
                    onLeave: () => this._backToAct(),
                    onRestart: () => this._restartStage()
                });
            },
            update: (dt) => {
                this.levels.update(dt);

                if (this.levels.levelComplete === true) {
                    this.levels.levelComplete = 'handled';
                    this._onStageCleared(this.levels.score, 1500);
                }

                if (this.levels.levelFailed === true) {
                    this.levels.levelFailed = 'handled';
                    this._onStageFailed({
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
                this._renderStageHint(ctx, W, H - 22);
                this.ui.renderButtons();

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
                if (e.code === 'Escape') this._pauseBack();
            }
        });

        // ── LOCKPICK ──
        this.state.register(S.LOCKPICK, {
            enter: (context) => {
                this.ui.clearButtons();
                Sound.stopAmbient();
                const lCtx = context || {};
                const endlessRevive = lCtx.reason === 'endless_revive';
                this._addLeaveButton({
                    label: 'RECOVERY PROTOCOL',
                    title: 'ABORT RECOVERY?',
                    detail: endlessRevive
                        ? 'The run ends here — your score still counts.'
                        : 'The energy spent on this recovery is not refunded.',
                    onLeave: () => {
                        if (endlessRevive) {
                            this.state.change(S.ENDLESS_OVER, Object.assign({}, this._lockpickEndlessCtx, { noRevive: true }));
                        } else {
                            this._backToAct();
                        }
                    }
                });
                this._lockpickReason = lCtx.reason || 'revive';
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
                        if (this._lockpickReason === 'revive' && this._reviveResume) {
                            // Mechanic game (e.g. Orbital Shield): same run, one life.
                            const resume = this._reviveResume;
                            this._reviveResume = null;
                            resume.mechanic.revive();
                            this._stageRevives = (this._stageRevives || 0) + 1;
                            this.state.change(S.MINIGAME, Object.assign({}, resume, { resume: true }));
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
                            this._onStageFailed({
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
                const subtitle = 'Break the code to restore the connection';
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
                this.ui.renderButtons();
            },
            exit: () => this.ui.clearButtons(),
            onKey: (e) => {
                if (e.code === 'Escape') { this._pauseBack(); return; }
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
                this._addLeaveButton({
                    label: c.title || '',
                    title: c.stage ? 'LEAVE THIS STAGE?' : 'LEAVE THIS CHALLENGE?',
                    detail: c.stage ? 'Your progress in this stage will be lost.' : 'This attempt will still count.',
                    // Gates / Dual Ring spend an attempt per try: no restart.
                    onRestart: c.stage ? () => this._restartStage() : null,
                    onLeave: () => {
                        if (c.stage) this._backToAct();
                        else this.state.change(S.HUB);
                    }
                });
                this._mgHandled = false;
                this._mgEndTimer = 0;
                if (this._activeMinigame && this._activeMinigame.init && !c.resume) {
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
            render: (ctx, alpha) => {
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
                    this._activeMinigame.render(ctx, W, H, this.levels.gameTime, alpha);
                }

                this.ui.renderEnergyBar({
                    current: this.energy.currentEnergy,
                    max: this.energy.maxEnergy,
                    nextRegenIn: this.energy.getTimeToNextRegen()
                });
                if (cfg.footHint) this._drawFaintHint(ctx, cfg.footHint, W / 2, H - 14);
                this.ui.renderButtons();
            },
            exit: () => {
                this._releaseHold('all');
                this.ui.clearButtons();
                this._activeMinigame = null;
            },
            onKey: (e) => {
                if (e.code === 'Escape') { this._pauseBack(); return; }
                const m = this._activeMinigame;
                if (!m) return;
                const offset = this._pendingInputOffset || 0;
                if (m.handleKey && m.handleKey(e.code, offset)) return;
                if ((e.code === 'Space' || e.code === 'Enter') && m.handleConfirm) {
                    m.handleConfirm(offset);
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
                this._goStage = lCtx.stage || this._stage;
                this._reviveResume = lCtx.resume || null;
                this._noRevive = lCtx.noRevive || false;
                this._revivesUsed = lCtx.revivesUsed || 0;
                this._goMessage = lCtx.message || null;
                // Short cooldown so players can't mash restart right after a
                // failure — gives the hands a moment to cool off.
                this._goCooldown = 1.0;
                const maxRevives = this.levels.maxRevives || 2;
                const revivesLeft = Math.max(0, maxRevives - this._revivesUsed);

                // Revive button: only for continuous games, energy available
                // AND recovery charges remain. Lockpick difficulty = act number.
                const goAct = this._goStage ? this.progress.act(this._goStage.actId) : null;
                const game = goAct ? GameRegistry.get(goAct.game) : null;
                if (!this._noRevive && game && game.revive && revivesLeft > 0 && this.energy.canAfford('REVIVE')) {
                    const extra = game.reviveLabel ? ` ${game.reviveLabel}` : '';
                    this.ui.addButton('revive', `🔄 TRY RECOVERY PROTOCOL (1⚡)${extra} · ${revivesLeft} left`, cx, cy + 30, 340, 42,
                        () => {
                            if (this.energy.spend('REVIVE')) {
                                this.state.change(S.LOCKPICK, {
                                    reason: 'revive',
                                    difficulty: goAct.id,
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

                // Back to the act's stage list
                this.ui.addButton('hub', '← ACT', cx, cy + 135, 200, 40,
                    () => this._backToAct(),
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

                if (this._goMessage) {
                    ctx.fillStyle = '#f59e0b';
                    ctx.font = '400 14px Rajdhani';
                    ctx.fillText(this._goMessage, cx, cy);
                } else if (this._noRevive) {
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
                if (e.code === 'Escape') this._backToAct();
            }
        });

        // ── ENDLESS (Sonsuz Mod) ──
        this.state.register(S.ENDLESS, {
            enter: () => {
                this.ui.clearButtons();
                Sound.stopAmbient();
                this._addLeaveButton({
                    label: 'ENDLESS MODE',
                    title: 'END THIS RUN?',
                    detail: 'Your score so far still counts.',
                    onLeave: () => this.state.change(S.ENDLESS_OVER, {
                        score: this.levels.score,
                        wave: this.levels.endlessWave,
                        maxCombo: this.levels.maxCombo,
                        hitCount: this.levels.hitCount,
                        noRevive: true
                    })
                });
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
                this.ui.renderButtons();
            },
            exit: () => this.ui.clearButtons(),
            onKey: (e) => {
                if (e.code === 'Space') this.levels.hitEndless(this._pendingInputOffset || 0);
                if (e.code === 'Escape') this._pauseBack();
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
                this.progress.markCongratsSeen();
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

        // ── PROFILE SETUP (operator name + password, DOM overlay) ──
        this.state.register(S.PROFILE_SETUP, {
            enter: (context) => {
                this.ui.clearButtons();
                const lCtx = context || {};
                this._profileReturnState = lCtx.returnState || S.HUB;
                this._profileMode = lCtx.mode || null;
                this._profileStatus = 'Connecting to leaderboard...';

                if (!this.leaderboard.isConfigured()) {
                    this._profileStatus = 'Leaderboard is not configured yet.';
                    this._addProfileBackButton();
                    return;
                }
                this.leaderboard.initialize().then((profile) => {
                    if (this.state.currentState !== S.PROFILE_SETUP) return;
                    if (profile && !this.leaderboard.needsPassword()) {
                        this.state.change(this._profileReturnState);
                        return;
                    }
                    this._profileStatus = '';
                    this._openProfileForm(profile ? 'secure' : (this._profileMode || 'create'));
                }).catch(() => {
                    if (this.state.currentState !== S.PROFILE_SETUP) return;
                    this._profileStatus = 'Offline: connect to the internet and try again.';
                    this._addProfileBackButton();
                });
            },
            render: (ctx) => this._renderProfileSetup(ctx),
            exit: () => {
                this.ui.clearButtons();
                if (this.profileForm) this.profileForm.close();
            },
            onKey: (e) => { if (e.code === 'Escape') this.state.change(this._profileReturnState); }
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
                    else if (this.leaderboard.needsPassword() && !this._securePromptDismissed) {
                        this.state.change(S.PROFILE_SETUP, { returnState: S.LEADERBOARD, mode: 'secure' });
                    } else this._loadLeaderboard();
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

    _addProfileBackButton() {
        const cx = this.canvas.width / 2;
        const cy = this.canvas.height / 2;
        this.ui.addButton('profile-back', '← BACK', cx, cy + 60, 160, 40,
            () => this.state.change(this._profileReturnState), { color: '#64748b' });
    }

    _openProfileForm(mode) {
        if (!this.profileForm) return;
        const S = this.state.STATES;
        this.profileForm.open(mode, {
            onSubmit: (m, v) => this._submitProfileForm(m, v),
            onCancel: () => {
                // "Later" on the password prompt: don't nag again this session.
                if (mode === 'secure') this._securePromptDismissed = true;
                this.state.change(this._profileReturnState || S.HUB);
            }
        });
    }

    /** @returns {Promise<string|null>} error to show, or null on success. */
    async _submitProfileForm(mode, values) {
        try {
            if (mode === 'create') {
                await this.leaderboard.createProfile(values.name, values.password);
            } else if (mode === 'signin') {
                const profile = await this.leaderboard.signIn(values.name, values.password);
                if (!profile) return 'Name or password is incorrect.';
            } else {
                await this.leaderboard.setPassword(values.password);
            }
        } catch (error) {
            return LeaderboardService.friendlyError(error, 'Something went wrong. Try again.');
        }
        if (this.profileForm) this.profileForm.close();
        this.state.change(this._profileReturnState);
        return null;
    }

    _renderProfileSetup(ctx) {
        const W = this.canvas.width;
        const H = this.canvas.height;
        const cx = W / 2;
        ctx.save();
        ctx.fillStyle = '#f59e0b';
        ctx.font = '700 24px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText('OPERATOR PROFILE', cx, H / 2 - 40);
        if (this._profileStatus) {
            ctx.fillStyle = /not configured|Offline/.test(this._profileStatus) ? '#ef4444' : '#94a3b8';
            ctx.font = '400 15px Rajdhani';
            ctx.fillText(this._profileStatus, cx, H / 2);
        }
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
        ctx.fillText(`ALL ${CAMPAIGN.acts.length} ACTS COMPLETE — THE CYBER ATTACK IS REPELLED`, cx, py + 86);

        // Story body
        const lines = [
            'Congratulations, Operator. You held the line.',
            'The malware is purged, the firewall stands, the ports are sealed,',
            'credentials are reset and the attacker is cut off.',
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
        const totalBest = this._totalBest();
        ctx.fillStyle = '#64748b';
        ctx.font = '500 13px Rajdhani';
        ctx.fillText(`TOTAL BEST SCORE  ${totalBest}`, cx, py + ph - 24);

        ctx.restore();

        this.ui.renderButtons();
    }

    // ── Act map (HUB) ──

    /**
     * Single source of truth for the act map carousel geometry.
     * The focused act sits in the centre; its neighbours peek in, smaller,
     * at ±spacing; gates sit halfway between.
     */
    _actMapLayout() {
        const W = this.canvas.width;
        return {
            W, cx: W / 2, cy: 300,
            cardW: 360, cardH: 230,
            spacing: 410, sideScale: 0.78,
            railY: 92, railStep: 64,
            chevronW: 44, chevronH: 70,
            endlessY: 470
        };
    }

    /** Centre x of act index i (0-based) for a given scroll position. */
    _mapX(i, scroll) {
        const L = this._actMapLayout();
        return L.cx + (i - scroll) * L.spacing;
    }

    _mapRailX(i) {
        const L = this._actMapLayout();
        const n = this.progress.acts.length;
        return L.cx + (i - (n - 1) / 2) * L.railStep;
    }

    /** Focus act index i (clamped) and rebuild the map buttons. */
    _mapGo(i) {
        const n = this.progress.acts.length;
        const next = Math.max(0, Math.min(n - 1, i));
        if (next === this._mapIndex) return false;
        this._mapIndex = next;
        this._actView = next + 1;
        this.ui.clearButtons();
        this._buildActMapButtons();
        return true;
    }

    /** Open the focused act (or explain why it is closed). */
    _openMapAct(act) {
        const status = this._actStatus(act.id);
        if (status === 'dev') {
            this._hubMessage = `ACT ${act.id} is in development`;
            this._hubMessageTimer = 2.5;
        } else if (status === 'locked') {
            this._hubMessage = `Breach gate ${act.id - 1} to reach ACT ${act.id}`;
            this._hubMessageTimer = 2.5;
        } else {
            this.state.change(this.state.STATES.ACT, { actId: act.id });
        }
    }

    /** 'complete' | 'active' | 'locked' | 'dev' */
    _actStatus(actId) {
        if (!this.progress.isActAvailable(actId)) return 'dev';
        if (this.progress.isActComplete(actId)) return 'complete';
        if (this.progress.isActUnlocked(actId)) return 'active';
        return 'locked';
    }

    _buildActMapButtons() {
        const W = this.canvas.width;
        const H = this.canvas.height;
        const L = this._actMapLayout();
        const acts = this.progress.acts;
        const i = this._mapIndex;

        // Chevrons first so they win over the peeking side cards.
        if (i > 0) {
            this.ui.addButton('map-prev', '‹', L.chevronW / 2 + 4, L.cy, L.chevronW, L.chevronH,
                () => this._mapGo(this._mapIndex - 1),
                { draw: (ctx, btn, hovered) => this._drawChevron(ctx, btn, hovered, -1) });
        }
        if (i < acts.length - 1) {
            this.ui.addButton('map-next', '›', W - L.chevronW / 2 - 4, L.cy, L.chevronW, L.chevronH,
                () => this._mapGo(this._mapIndex + 1),
                { draw: (ctx, btn, hovered) => this._drawChevron(ctx, btn, hovered, 1) });
        }

        // Focused card (opens the act). Drawn by _renderActMap, so hidden here.
        const act = acts[i];
        this.ui.addButton(`act${act.id}`, act.key, L.cx, L.cy, L.cardW, L.cardH,
            () => this._openMapAct(act), { hidden: true });

        // Side cards: tapping the visible part scrolls to them.
        const sideW = L.cardW * L.sideScale, sideH = L.cardH * L.sideScale;
        const inner = L.chevronW + 12;
        if (i > 0) {
            const right = L.cx - L.spacing + sideW / 2, left = inner;
            this.ui.addButton(`act${acts[i - 1].id}`, acts[i - 1].key, (left + right) / 2, L.cy, right - left, sideH,
                () => this._mapGo(this._mapIndex - 1), { hidden: true });
        }
        if (i < acts.length - 1) {
            const left = L.cx + L.spacing - sideW / 2, right = W - inner;
            this.ui.addButton(`act${acts[i + 1].id}`, acts[i + 1].key, (left + right) / 2, L.cy, right - left, sideH,
                () => this._mapGo(this._mapIndex + 1), { hidden: true });
        }

        // Gates on either side of the focused act (44 px tap targets).
        [i, i + 1].forEach(n => {
            if (n < 1 || n > acts.length - 1) return;
            this.ui.addButton(`gate${n}`, '', this._mapX(n - 0.5, i), L.cy, 44, 44,
                () => this._tryStartGate(n), { hidden: true });
        });

        // Progress rail: one node per act, tap to jump there.
        acts.forEach((a, k) => {
            this.ui.addButton(`rail${a.id}`, '', this._mapRailX(k), L.railY, 32, 32,
                () => this._mapGo(k),
                { draw: (ctx, btn, hovered) => this._drawRailNode(ctx, btn, hovered, a, k) });
        });

        // Endless Mode (after the final act; kept for players who already had it)
        if (this.progress.isEndlessUnlocked()) {
            const bestScore = this.levels._loadEndlessBest();
            const endlessSubtitle = bestScore > 0 ? `Best: ${bestScore}` : 'Unlimited challenge, unlimited fun';
            this.ui.addButton('endless', '∞ ENDLESS MODE', W / 2 - 125, L.endlessY, 230, 46,
                () => this.state.change(this.state.STATES.ENDLESS),
                { color: '#f59e0b', subtitle: endlessSubtitle });
            this.ui.addButton('leaderboard', '🏆 LEADERBOARD', W / 2 + 125, L.endlessY, 230, 46,
                () => this.state.change(this.state.STATES.LEADERBOARD),
                { color: '#f59e0b' });
        } else {
            this.ui.addButton('endless', '🔒 ENDLESS MODE', W / 2, L.endlessY, 240, 46,
                () => { },
                { color: '#475569', disabled: true, subtitle: `Complete ACT ${CAMPAIGN.finalAct} to unlock` });
        }

        this._addHubChrome(W, H);
    }

    /** Menu, sound and reset buttons shared by the map. */
    _addHubChrome(W, H) {
        this.ui.addButton('menu', '← MENU', 70, H - 35, 100, 32,
            () => this.state.change(this.state.STATES.MENU),
            { color: '#475569' });

        // Sound toggle (top-left, away from the footer text)
        this.ui.addButton('sound', '', 36, 30, 44, 30,
            () => {
                Sound.toggleMute();
                this._updateSoundButton();
                if (!Sound.isMuted()) Sound.startAmbient();
            },
            { color: '#475569', custom: 'sound' });
        this._updateSoundButton();
        this._addGuideButton();

        this.ui.addButton('reset', '🗑 RESET', W - 75, H - 35, 110, 32,
            () => {
                if (window.confirm('Are you sure you want to delete all data and start fresh?')) {
                    ['sb_progress', 'sb_energy', 'sb_congrats_seen', 'sb_group2_unlocked',
                        'sb_dualring', 'sb_packetpurge', CampaignProgress.KEY, 'sb_guide_seen',
                        ...CAMPAIGN.gates.map(g => `sb_gate_${g.id}`)]
                        .forEach(k => localStorage.removeItem(k));
                    window.location.href = window.location.href;
                }
            },
            { color: '#ef4444' });
    }

    /** Sum of best scores over an act's stages. */
    _actBest(act) {
        let sum = 0;
        for (let k = 0; k < act.stages.length; k++) sum += this.progress.stage(act.id, k).best;
        return sum;
    }

    /** Big act card centred on (0, 0) of the current transform. */
    _drawActCard(ctx, act, status, highlighted) {
        const theme = getLevelTheme(act.themeId);
        const L = this._actMapLayout();
        const w = L.cardW, h = L.cardH;
        const left = -w / 2, top = -h / 2;
        const dim = status === 'locked' || status === 'dev';
        const color = status === 'complete' ? '#22c55e' : dim ? '#475569' : theme.zoneColor;
        const game = GameRegistry.get(act.game);

        ctx.save();
        ctx.fillStyle = highlighted ? 'rgba(30,41,59,0.97)' : 'rgba(15,23,42,0.94)';
        ctx.strokeStyle = color;
        ctx.lineWidth = highlighted ? 2.2 : 1.4;
        if (status === 'dev') ctx.setLineDash([8, 7]);
        if (!dim) { ctx.shadowColor = color; ctx.shadowBlur = highlighted ? 22 : 10; }
        Utils.roundRect(ctx, left, top, w, h, 14);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;

        // Icon badge
        const ix = left + 46, iy = top + 48;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(ix, iy, 26, 0, Math.PI * 2); ctx.stroke();
        ctx.save();
        ctx.translate(ix, iy);
        LevelIcons.draw(ctx, act.themeId, 30, color);
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.rect(left + 6, top + 4, w - 12, h - 8);
        ctx.clip();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = color;
        ctx.font = '700 12px Orbitron';
        ctx.fillText(`ACT ${act.id}${game ? ' · ' + game.title : ''}`, left + 86, top + 38);
        ctx.fillStyle = dim ? '#64748b' : '#e2e8f0';
        ctx.font = '700 21px Orbitron';
        ctx.fillText(this.ui._fitText(act.key, w - 100), left + 86, top + 66);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '400 15px Rajdhani';
        this._wrapText(ctx, act.story, w - 48, 2)
            .forEach((line, k) => ctx.fillText(line, left + 24, top + 108 + k * 19));

        // Stage pips + status
        const py = top + 168;
        if (status === 'dev') {
            ctx.fillStyle = '#94a3b8';
            ctx.font = '700 14px Rajdhani';
            ctx.fillText('⚙ IN DEVELOPMENT', left + 24, py + 5);
        } else {
            const n = act.stages.length;
            const done = this.progress.stagesDone(act.id);
            for (let k = 0; k < n; k++) {
                ctx.beginPath();
                ctx.arc(left + 32 + k * 24, py, 7, 0, Math.PI * 2);
                ctx.fillStyle = k < done ? color : 'rgba(71,85,105,0.45)';
                ctx.fill();
            }
            const label = status === 'complete' ? 'COMPLETE'
                : status === 'locked' ? 'LOCKED' : `${done}/${n} STAGES`;
            ctx.textAlign = 'right';
            ctx.fillStyle = status === 'complete' ? '#22c55e' : status === 'locked' ? '#94a3b8' : '#3b82f6';
            ctx.font = '700 14px Rajdhani';
            ctx.fillText(label, left + w - 24, py + 5);
        }

        // Footer: best score + open hint
        const fy = top + h - 22;
        ctx.textAlign = 'left';
        ctx.fillStyle = '#475569';
        ctx.font = '600 13px Rajdhani';
        const best = this._actBest(act);
        if (best > 0) ctx.fillText(`BEST ${best}`, left + 24, fy);
        if (status === 'active' || status === 'complete') {
            ctx.textAlign = 'right';
            ctx.fillStyle = highlighted ? color : '#64748b';
            ctx.font = '700 13px Orbitron';
            ctx.fillText('OPEN ▸', left + w - 24, fy);
        }
        ctx.restore();
        ctx.restore();
    }

    _drawChevron(ctx, btn, hovered, dir) {
        ctx.save();
        ctx.fillStyle = hovered ? 'rgba(30,41,59,0.9)' : 'rgba(15,23,42,0.7)';
        ctx.strokeStyle = hovered ? 'rgba(148,163,184,0.7)' : 'rgba(71,85,105,0.5)';
        ctx.lineWidth = 1;
        Utils.roundRect(ctx, btn.x - btn.w / 2, btn.y - btn.h / 2, btn.w, btn.h, 10);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = hovered ? '#e2e8f0' : '#94a3b8';
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(btn.x - 5 * dir, btn.y - 12);
        ctx.lineTo(btn.x + 5 * dir, btn.y);
        ctx.lineTo(btn.x - 5 * dir, btn.y + 12);
        ctx.stroke();
        ctx.restore();
    }

    /** One node of the progress rail (act k, 0-based). */
    _drawRailNode(ctx, btn, hovered, act, k) {
        const status = this._actStatus(act.id);
        const theme = getLevelTheme(act.themeId);
        const focused = k === this._mapIndex;
        const color = status === 'complete' ? '#22c55e' : status === 'active' ? theme.zoneColor : '#475569';
        const r = focused ? 10 : 8;
        ctx.save();
        if (status === 'complete') {
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(btn.x, btn.y, r, 0, Math.PI * 2); ctx.fill();
        } else {
            ctx.fillStyle = 'rgba(15,23,42,0.95)';
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            if (status === 'dev') ctx.setLineDash([3, 3]);
            ctx.beginPath(); ctx.arc(btn.x, btn.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.setLineDash([]);
        }
        if (status === 'active') {
            const pulse = 0.5 + 0.5 * Math.sin((this.bgTime || 0) * 3);
            ctx.globalAlpha = 0.15 + 0.3 * (1 - pulse);
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(btn.x, btn.y, r + 3 + pulse * 5, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = 1;
        }
        if (focused || hovered) {
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(btn.x, btn.y, r + 4, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.fillStyle = focused ? '#e2e8f0' : '#64748b';
        ctx.font = '600 11px Rajdhani';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(act.id), btn.x, btn.y + 22);
        ctx.restore();
    }

    /** Greedy word wrap; the last allowed line is ellipsised if needed. */
    _wrapText(ctx, text, maxW, maxLines) {
        const width = (t) => {
            const m = ctx.measureText(t);
            return (m && typeof m.width === 'number' && isFinite(m.width)) ? m.width : t.length * 6;
        };
        const words = String(text).split(' ');
        const lines = [];
        let i = 0;
        while (i < words.length && lines.length < maxLines) {
            let line = words[i++];
            while (i < words.length && width(line + ' ' + words[i]) <= maxW) line += ' ' + words[i++];
            if (lines.length === maxLines - 1 && i < words.length) {
                line = this.ui._fitText(line + ' ' + words.slice(i).join(' '), maxW);
                i = words.length;
            }
            lines.push(line);
        }
        return lines;
    }

    _drawGateNode(ctx, btn, hovered, n) {
        const open = this.progress.isGateOpen(n);
        const playable = this.progress.isGatePlayable(n);
        const color = open ? '#22c55e' : playable ? '#f59e0b' : '#475569';
        const x = btn.x, y = btn.y, r = 16;

        ctx.save();
        ctx.fillStyle = 'rgba(15,23,42,0.96)';
        ctx.strokeStyle = color;
        ctx.lineWidth = hovered ? 2.5 : 2;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 2;
        if (open) {
            ctx.beginPath();
            ctx.moveTo(x - 7, y);
            ctx.lineTo(x - 2, y + 6);
            ctx.lineTo(x + 7, y - 6);
            ctx.stroke();
        } else {
            Utils.roundRect(ctx, x - 7, y - 2, 14, 10, 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x, y - 2, 4, Math.PI, 0, false);
            ctx.stroke();
        }
        if (playable) {
            const pulse = 0.5 + 0.5 * Math.sin((this.bgTime || 0) * 3);
            ctx.globalAlpha = 0.12 + 0.28 * (1 - pulse);
            ctx.beginPath();
            ctx.arc(x, y, r + pulse * 8, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }

    /** The carousel: track line, peeking side cards, focused card, gates. */
    _renderActMap(ctx) {
        const L = this._actMapLayout();
        const acts = this.progress.acts;
        const scroll = this._mapScroll;

        ctx.save();
        ctx.strokeStyle = 'rgba(71,85,105,0.4)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 8]);
        ctx.beginPath(); ctx.moveTo(0, L.cy); ctx.lineTo(L.W, L.cy); ctx.stroke();
        ctx.setLineDash([]);

        // Far cards first, the focused one last (on top).
        const order = acts.map((a, k) => k)
            .filter(k => Math.abs(k - scroll) < 1.7)
            .sort((a, b) => Math.abs(b - scroll) - Math.abs(a - scroll));
        const focusBtn = this.ui.buttons.find(b => b.id === `act${acts[this._mapIndex].id}`);
        for (const k of order) {
            const d = Math.min(1, Math.abs(k - scroll));
            const scale = 1 - (1 - L.sideScale) * d;
            ctx.save();
            ctx.globalAlpha = 1 - 0.5 * d;
            ctx.translate(this._mapX(k, scroll), L.cy);
            ctx.scale(scale, scale);
            const hl = k === this._mapIndex && d < 0.05 && focusBtn && this.ui.isHovered(focusBtn);
            this._drawActCard(ctx, acts[k], this._actStatus(acts[k].id), hl);
            ctx.restore();
        }

        // Gates between neighbouring acts, moving with the track.
        for (let n = 1; n < acts.length; n++) {
            const x = this._mapX(n - 0.5, scroll);
            if (x < -30 || x > L.W + 30) continue;
            const btn = this.ui.buttons.find(b => b.id === `gate${n}`);
            this._drawGateNode(ctx, { x, y: L.cy, w: 44, h: 44 }, !!btn && this.ui.isHovered(btn), n);
        }
        ctx.restore();
    }

    /** Header: progress rail (nodes drawn as buttons) + totals. */
    _renderHubHeader(ctx, W) {
        const L = this._actMapLayout();
        const acts = this.progress.acts;
        const n = acts.length;

        // Rail segments; open gates glow green.
        ctx.save();
        for (let k = 0; k < n - 1; k++) {
            const x1 = this._mapRailX(k), x2 = this._mapRailX(k + 1);
            ctx.strokeStyle = this.progress.isGateOpen(k + 1) ? 'rgba(34,197,94,0.7)' : 'rgba(71,85,105,0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(x1 + 11, L.railY); ctx.lineTo(x2 - 11, L.railY); ctx.stroke();
        }

        // Stages of acts still in development are unknown, so count cleared
        // stages instead of showing a misleading "x/x".
        const actsDone = acts.filter(a => this.progress.isActComplete(a.id)).length;
        let stagesDone = 0;
        for (const a of acts) stagesDone += this.progress.stagesDone(a.id);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '600 13px Rajdhani';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${actsDone}/${n} ACTS  ·  ${stagesDone} STAGES CLEARED`, W / 2, L.railY + 46);
        ctx.restore();
    }

    _renderHubMessage(ctx, W, H) {
        if (!(this._hubMessageTimer > 0) || !this._hubMessage) return;
        ctx.save();
        ctx.globalAlpha = Math.min(1, this._hubMessageTimer);
        ctx.fillStyle = '#f59e0b';
        ctx.font = '600 15px Rajdhani';
        ctx.textAlign = 'center';
        ctx.fillText(this._hubMessage, W / 2, H - 52);
        ctx.restore();
    }

    // ── dormhi.com badge (menu only, bottom-left) ──

    /**
     * A real <a> over the canvas' bottom-left corner, styled like the game's
     * chips: a round badge with the dormhi mark only (used as a CSS mask, so
     * it takes the theme colour). Links drawn on a canvas and opened from a
     * touch handler get blocked as pop-ups on phones; a real link does not.
     */
    _setBrandLink(visible) {
        if (typeof document === 'undefined' || !document.createElement || !document.body) return;
        if (!this._brand) {
            const a = document.createElement('a');
            a.className = 'sb-brand';
            a.href = 'https://dormhi.com';
            a.target = '_blank';
            a.rel = 'noopener';
            a.title = 'dormhi.com';
            a.setAttribute('aria-label', 'dormhi.com');
            const mark = document.createElement('span');
            mark.className = 'sb-brand-mark';
            mark.setAttribute('aria-hidden', 'true');
            a.appendChild(mark);
            this._brand = a;
            this._placeBrand = () => {
                const r = this.canvas.getBoundingClientRect();
                const k = r.width / this.canvas.width;      // CSS px per canvas px
                const fs = Math.max(10, 12 * k);
                a.style.fontSize = fs + 'px';
                a.style.left = (r.left + 16 * k) + 'px';
                // Centre the badge on the footer line (canvas y = H - 24).
                a.style.top = (r.top + (this.canvas.height - 24) * k - 1.2 * fs) + 'px';
            };
            window.addEventListener('resize', this._placeBrand);
        }
        if (visible) {
            if (!this._brand.isConnected) document.body.appendChild(this._brand);
            this._placeBrand();
        } else if (this._brand.isConnected) {
            this._brand.remove();
        }
    }

    // ── Pause (⏸) + leave / restart with confirmation ──

    /**
     * In-game ⏸ button. cfg: { label, title, detail, onLeave, onRestart? }.
     * The pause panel offers RESUME / RESTART (stages only) / LEAVE; leaving
     * or restarting always asks first. Esc and the browser/phone back
     * gesture step through the same panel (see _pauseBack).
     */
    _addLeaveButton(cfg) {
        this._leaveCfg = cfg;
        this.ui.addButton('pause', '', 40, this.canvas.height - 34, 60, 48,
            () => this._openPause(),
            { focusable: false, draw: (ctx, btn, hovered) => this._drawPauseButton(ctx, btn, hovered) });
    }

    _drawPauseButton(ctx, btn, hovered) {
        ctx.save();
        ctx.fillStyle = hovered ? 'rgba(30,41,59,0.9)' : 'rgba(15,23,42,0.7)';
        ctx.strokeStyle = hovered ? 'rgba(148,163,184,0.7)' : 'rgba(71,85,105,0.55)';
        ctx.lineWidth = 1;
        Utils.roundRect(ctx, btn.x - btn.w / 2, btn.y - btn.h / 2, btn.w, btn.h, 10);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = hovered ? '#e2e8f0' : '#94a3b8';
        Utils.roundRect(ctx, btn.x - 9, btn.y - 10, 6, 20, 2); ctx.fill();
        Utils.roundRect(ctx, btn.x + 3, btn.y - 10, 6, 20, 2); ctx.fill();
        ctx.restore();
    }

    /** Pause the game and show the panel. */
    _openPause() {
        if (this._quit || !this._leaveCfg || this.state.transitioning) return;
        this._releaseHold('all');
        this._quit = { cfg: this._leaveCfg, buttons: this.ui.buttons, mode: 'pause' };
        this._buildPauseButtons();
    }

    /** Open the panel straight on the leave warning. */
    _openLeavePrompt() {
        this._openPause();
        if (this._quit) this._setPauseMode('leave');
    }

    _setPauseMode(mode) {
        if (!this._quit) return;
        this._quit.mode = mode;
        this._buildPauseButtons();
    }

    /** Esc / back: open the panel, step back from a warning, or resume. */
    _pauseBack() {
        if (!this._quit) { this._openPause(); return; }
        if (this._quit.mode !== 'pause') this._setPauseMode('pause');
        else this._closeLeavePrompt();
    }

    _pausePanel() {
        const W = this.canvas.width, H = this.canvas.height;
        const pause = this._quit && this._quit.mode === 'pause';
        const rows = pause ? (this._quit.cfg.onRestart ? 3 : 2) : 0;
        const h = pause ? 120 + rows * 56 : 190;
        return { x: W / 2 - 220, y: H / 2 - h / 2, w: 440, h };
    }

    _buildPauseButtons() {
        const q = this._quit;
        const W = this.canvas.width;
        const P = this._pausePanel();
        this.ui.buttons = [];
        this.ui.focusId = null;
        if (q.mode === 'pause') {
            let y = P.y + 104;
            this.ui.addButton('pause-resume', '▶  RESUME', W / 2, y, 260, 44,
                () => this._closeLeavePrompt(), { color: '#3b82f6' });
            if (q.cfg.onRestart) {
                y += 56;
                this.ui.addButton('pause-restart', '↻  RESTART', W / 2, y, 260, 44,
                    () => this._setPauseMode('restart'), { color: '#f59e0b' });
            }
            y += 56;
            this.ui.addButton('pause-leave', '←  LEAVE', W / 2, y, 260, 44,
                () => this._setPauseMode('leave'), { color: '#ef4444' });
            this.ui.focus('pause-resume');
            return;
        }
        const by = P.y + P.h - 54;
        const isRestart = q.mode === 'restart';
        this.ui.addButton('quit-stay', isRestart ? 'CANCEL' : 'STAY', W / 2 - 100, by, 170, 44,
            () => this._setPauseMode('pause'), { color: '#3b82f6' });
        this.ui.addButton(isRestart ? 'quit-restart' : 'quit-leave', isRestart ? 'RESTART' : 'LEAVE', W / 2 + 100, by, 170, 44,
            () => {
                const fn = isRestart ? q.cfg.onRestart : q.cfg.onLeave;
                this._closeLeavePrompt();
                fn();
            },
            { color: isRestart ? '#f59e0b' : '#ef4444' });
        // Default to the safe choice so a stray Enter never quits.
        this.ui.focus('quit-stay');
    }

    _closeLeavePrompt() {
        if (!this._quit) return;
        this.ui.buttons = this._quit.buttons;
        this.ui.focusId = null;
        this._quit = null;
    }

    _renderQuitConfirm(ctx, W, H) {
        const q = this._quit;
        const P = this._pausePanel();
        const accent = q.mode === 'pause' ? 'rgba(59,130,246,0.5)'
            : q.mode === 'restart' ? 'rgba(245,158,11,0.55)' : 'rgba(239,68,68,0.5)';
        ctx.save();
        ctx.fillStyle = 'rgba(6,10,18,0.72)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(12,18,30,0.97)';
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.5;
        Utils.roundRect(ctx, P.x, P.y, P.w, P.h, 12);
        ctx.fill();
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        let title, detail;
        if (q.mode === 'pause') {
            title = 'PAUSED';
            detail = q.cfg.label || '';
        } else if (q.mode === 'restart') {
            title = 'RESTART THIS STAGE?';
            detail = 'Your progress in this stage will be lost.';
        } else {
            title = q.cfg.title;
            detail = q.cfg.detail;
        }
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '700 20px Orbitron';
        ctx.fillText(title, W / 2, P.y + 46);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '400 16px Rajdhani';
        ctx.fillText(detail, W / 2, P.y + 72);
        ctx.restore();
        this.ui.renderButtons();
    }

    /**
     * Browser / phone back (Android back, iOS edge swipe, desktop back,
     * Safari two-finger swipe) — routed here by BackGuard. Steps back inside
     * the game, warning first during play.
     * @returns {boolean} true to stay on the page, false to let it leave.
     */
    handleBrowserBack() {
        const S = this.state.STATES;
        const st = this.state.currentState;
        if (this.state.transitioning) return true;
        if (this.profileForm && this.profileForm.isOpen && st !== S.PROFILE_SETUP) this.profileForm.close();
        switch (st) {
            case S.LEVEL: case S.MINIGAME: case S.LOCKPICK: case S.ENDLESS:
                this._pauseBack();
                return true;
            case S.GUIDE: this._closeGuide(); return true;
            case S.ACT: this.state.change(S.HUB); return true;
            case S.HUB: this.state.change(S.MENU); return true;
            case S.GAME_OVER: this._backToAct(); return true;
            case S.ENDLESS_OVER: case S.LEADERBOARD: this.state.change(S.HUB); return true;
            case S.PROFILE_SETUP: this.state.change(this._profileReturnState || S.HUB); return true;
            case S.CONGRATS: this._finishCongrats(); return true;
            case S.MENU:
                // First back on the menu warns; a second one within 2.5 s leaves.
                if (this._exitArmed > 0) return false;
                this._exitArmed = 2.5;
                return true;
            default:
                return true;
        }
    }

    /** Faint controls line on the first stage of an act (Timing Bar). */
    _renderStageHint(ctx, W, y) {
        const st = this._stage;
        if (!st || st.index !== 0 || this.levels.endlessMode) return;
        const act = this.progress.act(st.actId);
        if (act && act.hint) this._drawFaintHint(ctx, act.hint, W / 2, y);
    }

    _drawFaintHint(ctx, hint, x, y) {
        const text = this._inputMode() === 'touch' ? hint.touch : hint.desktop;
        if (!text) return;
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.fillStyle = '#64748b';
        ctx.font = '500 14px Rajdhani';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    // ── Hold-to-play routing (Signal Lock) ──

    _holdGame() {
        const m = this._activeMinigame;
        return (this.state.currentState === this.state.STATES.MINIGAME && m && m.wantsHold) ? m : null;
    }

    /** Mouse press on the canvas: starts a hold unless it lands on a button. */
    _handleMouseDown(x, y) {
        const m = this._holdGame();
        if (!m || this._quit || this.state.transitioning) return;
        if (this.ui.buttons.some(b => !b.hidden && !b.disabled &&
            Math.abs(x - b.x) <= b.w / 2 && Math.abs(y - b.y) <= b.h / 2)) return;
        m.handlePointer(x, y, 'down');
    }

    _handleKeyUp(action) {
        const m = this._holdGame();
        if (m && m.handleKeyUp) m.handleKeyUp(action.code);
    }

    /** 'pointer' ends a mouse/touch hold; 'all' also drops a held key. */
    _releaseHold(which) {
        const m = this._holdGame();
        if (!m) return;
        if (which === 'all' && m.releaseAll) m.releaseAll();
        else m.handlePointer(0, 0, 'up');
    }

    // ── Field guide ──

    _inputMode() {
        return (this.input && this.input.mode) || 'desktop';
    }

    _readFlag(key) {
        try { return localStorage.getItem(key) === '1'; } catch (e) { return false; }
    }

    _writeFlag(key) {
        try { localStorage.setItem(key, '1'); } catch (e) { }
    }

    /** Small "?" next to the sound toggle; a soft dot until first opened. */
    _addGuideButton() {
        this.ui.addButton('guide', '', 88, 30, 44, 30,
            () => this._openGuide(),
            { draw: (ctx, btn, hovered) => this._drawGuideButton(ctx, btn, hovered) });
    }

    _drawGuideButton(ctx, btn, hovered) {
        const left = btn.x - btn.w / 2, top = btn.y - btn.h / 2;
        ctx.save();
        ctx.fillStyle = hovered ? 'rgba(30,41,59,0.85)' : 'rgba(15,23,42,0.55)';
        ctx.strokeStyle = hovered ? 'rgba(148,163,184,0.6)' : 'rgba(100,116,139,0.35)';
        ctx.lineWidth = 1;
        Utils.roundRect(ctx, left, top, btn.w, btn.h, 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#94a3b8';
        ctx.font = '700 15px Orbitron';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', btn.x, btn.y + 1);
        if (!this._guideSeen) {
            const pulse = 0.5 + 0.5 * Math.sin((this.bgTime || 0) * 3);
            ctx.globalAlpha = 0.55 + 0.45 * pulse;
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath();
            ctx.arc(left + btn.w - 5, top + 5, 3, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    _openGuide(page) {
        const S = this.state.STATES;
        const from = this.state.currentState;
        this.state.change(S.GUIDE, {
            returnState: from === S.ACT ? S.ACT : S.HUB,
            returnContext: from === S.ACT ? { actId: this._actView } : null,
            page
        });
    }

    _closeGuide() {
        this.state.change(this._guideReturn || this.state.STATES.HUB, this._guideReturnCtx);
    }

    _setGuidePage(i) {
        const n = GameManager.GUIDE_PAGES.length;
        this._guidePage = (i + n) % n;
        this._guideScroll = 0;
        this._guideScrollTarget = 0;
        this._guideMax = 0;
        this.ui.clearButtons();
        this._buildGuideButtons();
    }

    _guideLayout() {
        const W = this.canvas.width;
        const L = { x: W / 2 - 380, y: 62, w: 760, h: 530 };
        // Scrollable viewport between the tabs and the page counter.
        L.viewTop = L.y + 108;
        L.viewBottom = L.y + L.h - 80;
        return L;
    }

    _guideScrollBy(dy) {
        this._guideScrollTarget = Math.max(0, Math.min(this._guideMax, this._guideScrollTarget + dy));
    }

    _buildGuideButtons() {
        const W = this.canvas.width;
        const L = this._guideLayout();
        const pages = GameManager.GUIDE_PAGES;
        const tabW = 160, gap = 10;
        const x0 = W / 2 - (pages.length * tabW + (pages.length - 1) * gap) / 2 + tabW / 2;
        pages.forEach((p, i) => {
            this.ui.addButton(`guide-tab${i}`, p.title, x0 + i * (tabW + gap), L.y + 78, tabW, 34,
                () => this._setGuidePage(i),
                { color: i === this._guidePage ? '#f59e0b' : '#475569' });
        });
        const by = L.y + L.h - 34;
        this.ui.addButton('guide-prev', '‹ PREV', W / 2 - 170, by, 140, 40,
            () => this._setGuidePage(this._guidePage - 1), { color: '#475569' });
        this.ui.addButton('guide-close', 'CLOSE', W / 2, by, 140, 40,
            () => this._closeGuide(), { color: '#3b82f6' });
        this.ui.addButton('guide-next', 'NEXT ›', W / 2 + 170, by, 140, 40,
            () => this._setGuidePage(this._guidePage + 1), { color: '#475569' });
        this.ui.focus('guide-close');
    }

    _renderGuide(ctx) {
        const W = this.canvas.width;
        const H = this.canvas.height;
        const L = this._guideLayout();
        const page = GameManager.GUIDE_PAGES[this._guidePage];
        const touch = this._inputMode() === 'touch';

        ctx.save();
        ctx.fillStyle = 'rgba(6,10,18,0.78)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(12,18,30,0.97)';
        ctx.strokeStyle = 'rgba(59,130,246,0.45)';
        ctx.lineWidth = 1.5;
        Utils.roundRect(ctx, L.x, L.y, L.w, L.h, 12);
        ctx.fill();
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '700 22px Orbitron';
        ctx.fillText('FIELD GUIDE', W / 2, L.y + 42);

        const left = L.x + 48, maxW = L.w - 104;
        const startY = L.viewTop + 26;
        let y = startY;
        ctx.save();
        ctx.beginPath();
        ctx.rect(L.x + 4, L.viewTop, L.w - 8, L.viewBottom - L.viewTop);
        ctx.clip();
        ctx.translate(0, -Math.round(this._guideScroll));
        if (page.table) {
            // Controls: one row per action, desktop vs touch side by side.
            const colA = left + 210, colB = left + 470;
            ctx.textAlign = 'left';
            ctx.font = '700 11px Orbitron';
            ctx.fillStyle = touch ? '#64748b' : '#3b82f6';
            ctx.fillText('KEYBOARD / MOUSE', colA, y);
            ctx.fillStyle = touch ? '#3b82f6' : '#64748b';
            ctx.fillText('TOUCH', colB, y);
            y += 30;
            for (const [what, desk, tap] of page.table) {
                ctx.fillStyle = '#94a3b8';
                ctx.font = '600 16px Rajdhani';
                ctx.fillText(what, left, y);
                ctx.fillStyle = touch ? '#64748b' : '#e2e8f0';
                ctx.fillText(desk, colA, y);
                ctx.fillStyle = touch ? '#e2e8f0' : '#64748b';
                ctx.fillText(tap, colB, y);
                y += 32;
            }
        } else {
            ctx.textAlign = 'left';
            for (const item of page.items) {
                if (item.head) {
                    ctx.fillStyle = '#f59e0b';
                    ctx.font = '700 13px Orbitron';
                    ctx.fillText(item.head, left, y);
                    y += 22;
                }
                ctx.fillStyle = '#cbd5e1';
                ctx.font = '400 17px Rajdhani';
                for (const line of this._wrapText(ctx, item.text, maxW, 3)) {
                    ctx.fillText(line, left, y);
                    y += 23;
                }
                y += 14;
            }
        }
        ctx.restore();

        // Content height -> how far the page can scroll.
        const viewH = L.viewBottom - L.viewTop;
        const contentH = (y - startY) + 30;
        this._guideMax = Math.max(0, contentH - viewH);
        if (this._guideScrollTarget > this._guideMax) this._guideScrollTarget = this._guideMax;
        if (this._guideMax > 0) this._renderGuideScrollHints(ctx, L, viewH);

        ctx.textAlign = 'center';
        ctx.fillStyle = '#475569';
        ctx.font = '500 12px Rajdhani';
        ctx.fillText(`${this._guidePage + 1} / ${GameManager.GUIDE_PAGES.length}`, W / 2, L.y + L.h - 64);
        ctx.restore();

        this.ui.renderButtons();
    }

    /** Edge fades + a slim scrollbar when the page does not fit. */
    _renderGuideScrollHints(ctx, L, viewH) {
        const bg = 'rgba(12,18,30,';
        const fade = (y0, y1, fromTop) => {
            const g = ctx.createLinearGradient(0, y0, 0, y1);
            g.addColorStop(0, bg + (fromTop ? '0.97)' : '0)'));
            g.addColorStop(1, bg + (fromTop ? '0)' : '0.97)'));
            ctx.fillStyle = g;
            ctx.fillRect(L.x + 4, y0, L.w - 8, y1 - y0);
        };
        ctx.save();
        if (this._guideScroll > 1) fade(L.viewTop, L.viewTop + 22, true);
        if (this._guideScroll < this._guideMax - 1) fade(L.viewBottom - 26, L.viewBottom, false);

        const tx = L.x + L.w - 16;
        const thumbH = Math.max(28, viewH * viewH / (viewH + this._guideMax));
        const thumbY = L.viewTop + (viewH - thumbH) * (this._guideScroll / this._guideMax);
        ctx.fillStyle = 'rgba(71,85,105,0.35)';
        Utils.roundRect(ctx, tx - 2, L.viewTop, 4, viewH, 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(148,163,184,0.75)';
        Utils.roundRect(ctx, tx - 2, thumbY, 4, thumbH, 2);
        ctx.fill();
        ctx.restore();
    }

    // ── Act screen ──

    _actScreenLayout(n) {
        const W = this.canvas.width;
        const cardW = 170, cardH = 150, gap = 18;
        const totalW = n * cardW + (n - 1) * gap;
        const x0 = (W - totalW) / 2 + cardW / 2;
        return { cardW, cardH, y: 262, xs: Array.from({ length: n }, (_, i) => x0 + i * (cardW + gap)) };
    }

    /** One-line summary of a stage's key difficulty number. */
    _stageSummary(act, stage) {
        const p = stage.params;
        if (act.game === 'timingbar') return `${p.requiredHits} HITS · ${p.maxTime}s`;
        if (act.game === 'stack') return `${p.targetBlocks} BLOCKS HIGH`;
        if (act.game === 'orbital') return `${p.blocksNeeded} PACKETS · ${p.ports} PORTS`;
        if (act.game === 'signal') return `${p.keys} KEYS · ${p.timeLimit}s`;
        if (act.game === 'route') return `${p.traces} TRACES · ${p.size}×${p.size} · ${p.timeLimit}s`;
        return '';
    }

    _buildActButtons() {
        const W = this.canvas.width;
        const H = this.canvas.height;
        const act = this.progress.act(this._actView);
        if (!act) return;
        const L = this._actScreenLayout(act.stages.length);

        act.stages.forEach((stage, i) => {
            this.ui.addButton(`stage${i}`, stage.tier, L.xs[i], L.y, L.cardW, L.cardH,
                () => this._startStage(act.id, i),
                { draw: (ctx, btn, hovered) => this._drawStageCard(ctx, btn, hovered, act, i) });
        });

        const n = act.id;
        if (this.progress.isGatePlayable(n)) {
            this.ui.addButton('gate', `⚡ BREACH GATE ${n} → ACT ${n + 1}`, W / 2, 430, 320, 46,
                () => this._tryStartGate(n),
                { color: '#f59e0b' });
        } else if (this.progress.isActComplete(n) && this.progress.isActUnlocked(n + 1)) {
            this.ui.addButton('next', `NEXT: ACT ${n + 1} →`, W / 2, 430, 240, 42,
                () => this.state.change(this.state.STATES.ACT, { actId: n + 1 }),
                { color: '#22c55e' });
        }

        this.ui.addButton('back', '← ACTS', 70, H - 35, 100, 32,
            () => this.state.change(this.state.STATES.HUB),
            { color: '#475569' });
        this._addGuideButton();

        // Focus the first stage that still needs work (or the gate).
        let target = 'gate';
        for (let i = 0; i < act.stages.length; i++) {
            if (this.progress.isStageUnlocked(act.id, i) && !this.progress.isStageCompleted(act.id, i)) {
                target = `stage${i}`;
                break;
            }
        }
        this.ui.focus(target);
        if (!this.ui.focused) this.ui.focus('stage0');
    }

    _drawStageCard(ctx, btn, hovered, act, i) {
        const theme = getLevelTheme(act.themeId);
        const stage = act.stages[i];
        const done = this.progress.isStageCompleted(act.id, i);
        const unlocked = this.progress.isStageUnlocked(act.id, i);
        const color = done ? '#22c55e' : unlocked ? theme.zoneColor : '#475569';
        const left = btn.x - btn.w / 2, top = btn.y - btn.h / 2;

        ctx.save();
        ctx.globalAlpha = unlocked ? 1 : 0.6;
        ctx.fillStyle = hovered && unlocked ? 'rgba(30,41,59,0.95)' : 'rgba(15,23,42,0.9)';
        ctx.strokeStyle = color;
        ctx.lineWidth = hovered ? 2 : 1.2;
        if (hovered && unlocked) { ctx.shadowColor = color; ctx.shadowBlur = 14; }
        Utils.roundRect(ctx, left, top, btn.w, btn.h, 10);
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#64748b';
        ctx.font = '600 12px Rajdhani';
        ctx.fillText(`STAGE ${i + 1}`, btn.x, top + 26);
        ctx.fillStyle = color;
        ctx.font = '700 17px Orbitron';
        ctx.fillText(stage.tier, btn.x, top + 56);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '600 14px Rajdhani';
        ctx.fillText(this._stageSummary(act, stage), btn.x, top + 84);

        const status = done ? 'CLEARED' : unlocked ? 'READY' : 'LOCKED';
        ctx.fillStyle = done ? '#22c55e' : unlocked ? '#3b82f6' : '#94a3b8';
        ctx.font = '700 13px Rajdhani';
        ctx.fillText(status, btn.x, top + 116);

        const best = this.progress.stage(act.id, i).best;
        if (best > 0) {
            ctx.fillStyle = '#475569';
            ctx.font = '400 12px Rajdhani';
            ctx.fillText('BEST ' + best, btn.x, top + 136);
        }
        ctx.restore();
    }

    _renderActScreen(ctx) {
        const W = this.canvas.width;
        const act = this.progress.act(this._actView);
        if (!act) return;
        const theme = getLevelTheme(act.themeId);
        const game = GameRegistry.get(act.game);

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = theme.zoneColor;
        ctx.font = '700 13px Orbitron';
        ctx.fillText(`ACT ${act.id}${game ? ' · ' + game.title : ''}`, W / 2, 34);
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '700 26px Orbitron';
        ctx.fillText(act.key, W / 2, 68);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '400 16px Rajdhani';
        ctx.fillText(act.story, W / 2, 98);
        if (act.controls) {
            ctx.fillStyle = '#64748b';
            ctx.font = '500 14px Rajdhani';
            ctx.fillText(act.controls, W / 2, 124);
        }

        // Path between stage cards
        const L = this._actScreenLayout(act.stages.length);
        ctx.strokeStyle = 'rgba(71,85,105,0.5)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 6]);
        ctx.beginPath();
        ctx.moveTo(L.xs[0], L.y);
        ctx.lineTo(L.xs[L.xs.length - 1], L.y);
        ctx.stroke();
        ctx.setLineDash([]);

        const done = this.progress.stagesDone(act.id);
        ctx.fillStyle = done === act.stages.length ? '#22c55e' : '#64748b';
        ctx.font = '600 14px Rajdhani';
        ctx.fillText(done === act.stages.length ? 'ACT COMPLETE' : `${done}/${act.stages.length} STAGES CLEARED`, W / 2, 372);
        ctx.restore();
    }

    _totalBest() {
        let sum = 0;
        for (const a of this.progress.acts) {
            for (let i = 0; i < a.stages.length; i++) sum += this.progress.stage(a.id, i).best;
        }
        return sum;
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

    _gateTracker(n) {
        // Gate 1 keeps the original key so pre-campaign attempts still count.
        const key = n === 1 ? 'sb_packetpurge' : `sb_gate_${n}`;
        return this._gateTrackers[n] || (this._gateTrackers[n] = new ChallengeGate(key));
    }

    /** Gate n opens act n + 1 (Packet Purge, harder each gate). */
    _tryStartGate(n) {
        const say = (msg) => { this._hubMessage = msg; this._hubMessageTimer = 2.5; };
        if (this.progress.isGateOpen(n)) { say(`Gate ${n} is already breached`); return; }
        if (!this.progress.isActComplete(n)) { say(`Clear every stage of ACT ${n} first`); return; }
        if (!this.progress.isActAvailable(n + 1)) { say(`ACT ${n + 1} is in development`); return; }

        const WINDOW = 3 * 60 * 1000;
        const MAX = 2;
        const tracker = this._gateTracker(n);
        if (!tracker.canAttempt(WINDOW, MAX)) {
            const wait = Math.ceil(tracker.timeUntilReset(WINDOW, MAX));
            say(`The lock is recalibrating (${wait}s)`);
            return;
        }
        tracker.record(WINDOW);

        const cfg = CAMPAIGN.gates[n - 1];
        const mechanic = new PacketPurgeMechanic({ waves: cfg.waves, speedScale: cfg.speedScale });
        this.state.change(this.state.STATES.MINIGAME, {
            mechanic,
            title: `GATE ${n} · PACKET PURGE`,
            subtitle: `${cfg.waves} waves — purge infected packets before they reach the core`,
            hint: 'Tap the faster RED packets — leave the blue ones',
            onComplete: (success) => {
                if (success) {
                    this.progress.openGate(n);
                    this._hubMessage = `ACT ${n + 1} UNLOCKED`;
                } else {
                    this._hubMessage = 'Purge failed — the lock holds';
                }
                this._hubMessageTimer = 3.0;
                this.state.change(this.state.STATES.HUB);
            }
        });
    }

    /** Start stage `index` of act `actId` with that game's tier params. */
    _startStage(actId, index) {
        const act = this.progress.act(actId);
        if (!act || !this.progress.isStageUnlocked(actId, index)) {
            this._hubMessage = 'Clear the previous stage first';
            this._hubMessageTimer = 2.5;
            return false;
        }
        const stage = act.stages[index];
        const game = GameRegistry.get(act.game);
        if (!game) return false;
        this._stage = { actId, index };
        this._actView = actId;
        const S = this.state.STATES;

        if (game.kind === 'bar') {
            this.levels.startStage(Object.assign({
                id: act.themeId,
                name: `${act.key} · ${stage.tier}`,
                desc: act.story
            }, stage.params));
            this.state.change(S.LEVEL);
            return true;
        }

        const mechanic = game.create(stage.params);
        this._stageRevives = 0;
        const cfg = {
            mechanic,
            stage: true,
            title: `${act.key} · ${stage.tier}`,
            subtitle: act.story,
            footHint: index === 0 ? act.hint : null,
            onComplete: (success, m) => {
                if (success) {
                    this._onStageCleared(m.score, 0);
                } else {
                    this._onStageFailed({
                        score: m.computeScore ? m.computeScore() : (m.score || 0),
                        noRevive: !game.revive,
                        revivesUsed: this._stageRevives,
                        message: game.revive ? null : (game.failMessage || null),
                        // A revivable game continues from where it stopped.
                        resume: game.revive ? cfg : null
                    });
                }
            }
        };
        this.state.change(S.MINIGAME, cfg);
        return true;
    }

    /** Record a cleared stage, then route: congrats / act screen. */
    _onStageCleared(score, delayMs) {
        const S = this.state.STATES;
        const st = this._stage;
        if (!st) return;
        const res = this.progress.completeStage(st.actId, st.index, score);
        const later = (ms, fn) => (ms > 0 ? setTimeout(fn, ms) : fn());

        if (res.actCompleted && this.progress.isCampaignComplete() && !this.progress.congratsSeen) {
            later(delayMs, () => this.state.change(S.CONGRATS));
            return;
        }
        if (res.actCompleted) {
            const n = st.actId;
            this._hubMessage = this.progress.isActAvailable(n + 1)
                ? `ACT ${n} COMPLETE — breach gate ${n} to reach ACT ${n + 1}`
                : `ACT ${n} COMPLETE — ACT ${n + 1} is in development`;
            this._hubMessageTimer = 3.5;
        }
        later(delayMs, () => this.state.change(S.ACT, { actId: st.actId }));
    }

    _onStageFailed(ctx) {
        this.state.change(this.state.STATES.GAME_OVER, Object.assign({ stage: this._stage }, ctx));
    }

    /** Start the current stage again from scratch (pause → RESTART). */
    _restartStage() {
        const st = this._stage;
        if (st) this._startStage(st.actId, st.index);
    }

    _backToAct() {
        const actId = (this._stage && this._stage.actId) || this._actView;
        this.state.change(this.state.STATES.ACT, { actId });
    }

    /** Routes canvas presses: UI buttons → minigame → hidden energy easter egg. */
    _hitTestUI(x, y, source) {
        if (this.ui.handleClick(x, y)) return true;
        // Taps outside the leave prompt must not reach the paused game.
        if (this._quit) return true;

        if (this.state.currentState === this.state.STATES.MINIGAME &&
            this._activeMinigame && this._activeMinigame.handlePointer) {
            // Hold-to-play games get mouse holds from _handleMouseDown; the
            // click that follows the release must not start a new hold.
            if (this._activeMinigame.wantsHold && source === 'click') return true;
            const offset = this._computeInputOffset(performance.now());
            this._activeMinigame.handlePointer(x, y, 'down', offset);
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
        const st = this._goStage || this._stage;
        if (st) this._startStage(st.actId, st.index);
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
            hitTestUI: (x, y, source) => this._hitTestUI(x, y, source),
            onMove: (x, y) => this.ui.updateMouse(x, y),
            onPress: (pointerType, ts) => this._handleConfirm(ts),
            onSwipe: (dir, ts) => this._handleSwipe(dir, ts),
            onKey: (action) => this._handleKeyAction(action),
            onKeyUp: (action) => this._handleKeyUp(action),
            onMouseDown: (x, y) => this._handleMouseDown(x, y),
            onPointerUp: () => this._releaseHold('pointer'),
            onBlur: () => this._releaseHold('all'),
            onWheel: (delta) => this._handleWheel(delta)
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

    /** Arrow keys + Enter drive the on-screen buttons on menu-like screens. */
    _handleUiNavKey(code) {
        const S = this.state.STATES;
        const nav = [S.MENU, S.HUB, S.ACT, S.GAME_OVER, S.ENDLESS_OVER, S.CONGRATS, S.LEADERBOARD];
        if (this.state.transitioning || nav.indexOf(this.state.currentState) < 0) return false;
        const dirs = {
            ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
            KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right'
        };
        const enter = code === 'Enter' || code === 'NumpadEnter';
        if (this.state.currentState === S.HUB) {
            // Act map: ←/→ scroll the carousel, Enter opens the focused act
            // unless another button (↑/↓) holds the keyboard focus.
            if (dirs[code] === 'left' || dirs[code] === 'right') {
                this.ui.focusId = null;
                this._mapGo(this._mapIndex + (dirs[code] === 'left' ? -1 : 1));
                return true;
            }
            if (enter) {
                if (this.ui.activateFocus()) return true;
                this._openMapAct(this.progress.acts[this._mapIndex]);
                return true;
            }
        }
        // Act screen: with no keyboard focus (e.g. the mouse moved), Enter
        // starts the next stage that still needs clearing.
        if (this.state.currentState === S.ACT && enter && !this.ui.focused) {
            const act = this.progress.act(this._actView);
            if (act && act.stages.length) {
                let next = act.stages.findIndex((st, k) => this.progress.isStageUnlocked(act.id, k) && !this.progress.isStageCompleted(act.id, k));
                if (next < 0) next = 0;
                this._startStage(act.id, next);
                return true;
            }
        }
        if (dirs[code]) { this.ui.moveFocus(dirs[code]); return true; }
        if (enter) return this.ui.activateFocus();
        return false;
    }

    /** Mouse wheel / trackpad on the act map scrolls the carousel. */
    _handleWheel(delta) {
        if (this.state.currentState === this.state.STATES.GUIDE && !this.state.transitioning) {
            this._guideScrollBy(delta * 0.8);
            return;
        }
        if (this.state.currentState !== this.state.STATES.HUB || this.state.transitioning) return;
        if (this._wheelCooldown > 0 || Math.abs(delta) < 4) return;
        this._wheelCooldown = 0.25;
        this._mapGo(this._mapIndex + (delta > 0 ? 1 : -1));
    }

    _dispatchKey(action) {
        if (this._quit) {
            // Only the panel reacts: Esc steps back, arrows/Enter = buttons.
            const code = action.code;
            const dirs = {
                ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
                KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right'
            };
            if (code === 'Escape') this._pauseBack();
            else if (code === 'Enter' || code === 'NumpadEnter') this.ui.activateFocus();
            else if (dirs[code]) this.ui.moveFocus(dirs[code]);
            return;
        }
        if (this._handleUiNavKey(action.code)) return;
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
        // Field guide on touch: swipe up/down scrolls, left/right turns pages.
        if (this.state.currentState === this.state.STATES.GUIDE) {
            if (dir === 'up') this._guideScrollBy(180);
            if (dir === 'down') this._guideScrollBy(-180);
            if (dir === 'left') this._setGuidePage(this._guidePage + 1);
            if (dir === 'right') this._setGuidePage(this._guidePage - 1);
            return;
        }
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

// Field guide pages (rendered by _renderGuide).
GameManager.GUIDE_PAGES = [
    {
        title: 'MISSION',
        items: [
            { text: `An attacker is inside the system. ${CAMPAIGN.acts.length} acts stand between them and full control.` },
            { head: 'ACTS & STAGES', text: 'Each act is one game. Its stages are that game\'s difficulty tiers — clear them in order to complete the act.' },
            { head: 'GATES', text: 'A cleared act opens its gate. Breach the gate (Packet Purge) to reach the next act. Acts marked IN DEVELOPMENT are on their way.' }
        ]
    },
    {
        title: 'CONTROLS',
        table: [
            ['Menus', 'Arrow keys + Enter', 'Tap'],
            ['Go back', 'Esc', '← buttons'],
            ['Timing Bar', 'SPACE', 'Tap anywhere'],
            ['Stack Overflow', 'SPACE or click', 'Tap anywhere'],
            ['Orbital Shield', '← / →  or  A / D', 'Tap a port'],
            ['Signal Lock', 'Hold SPACE or mouse', 'Hold anywhere'],
            ['Route Trace', 'Click a tile · arrows + SPACE', 'Tap a tile'],
            ['Packet Purge', 'Click red packets', 'Tap red packets'],
            ['Code Breaker', 'Arrow keys / WASD', 'Swipe'],
            ['Field guide', 'H', '? button']
        ]
    },
    {
        title: 'GAMES',
        items: [
            { head: 'TIMING BAR', text: 'Hit while the marker is inside the zone. Centre hits score PERFECT and combos multiply your score.' },
            { head: 'STACK OVERFLOW', text: 'Drop blocks to build a tower past the limit line. Blocks keep the crane\'s sideways momentum, so release a little early.' },
            { head: 'ORBITAL SHIELD', text: 'A port blinks, then a packet flies at it. Snap the shield to that port to block it. Pink packets hop to a neighbouring port.' },
            { head: 'SIGNAL LOCK', text: 'Hold to raise your signal, release to lower it. Keep it on the target until SYNC fills to lock a key, before time runs out.' },
            { head: 'ROUTE TRACE', text: 'Rotate tiles to connect your node to the attacker. Connected tiles glow green. Trace every route before time runs out.' },
            { head: 'PACKET PURGE', text: 'Destroy the red infected packets before they reach the core. Leave the blue ones alone.' }
        ]
    },
    {
        title: 'ENERGY',
        items: [
            { head: 'ENERGY', text: 'Up to 6 cells. Energy refills slowly over time.' },
            { head: 'RECOVERY PROTOCOL', text: 'Failed a Timing Bar or Orbital Shield stage? Spend 1⚡ and win the Code Breaker to continue with one life; in Signal Lock and Route Trace you get 20 more seconds. Twice per stage.' },
            { head: 'ENDLESS MODE', text: `Unlocks after ACT ${CAMPAIGN.finalAct}. Its leaderboard uses your operator name and password, so you can keep your rank on any browser.` }
        ]
    }
];
