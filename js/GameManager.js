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
        // Players who unlocked Endless land on its slot of the act map until
        // they open an act (and again after visiting Endless).
        this._hubEndlessFocus = true;
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
        // Network layer atmosphere eases toward the layer of the current screen.
        const layer = this._bgLayerTarget();
        this._bgLayer = this._bgLayer === undefined ? layer : this._bgLayer + (layer - this._bgLayer) * Math.min(1, dt * 3);
        this._syncPageLayer(layer);
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
        const W = VIEW.W;
        const H = VIEW.H;

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
                const cx = VIEW.W / 2;
                this.ui.addButton('start', '▶  START MISSION', cx, 520, 240, 48,
                    () => this.state.change(S.HUB));
                this._setBrandLink(true);
            },
            render: (ctx) => {
                const W = VIEW.W;
                const H = VIEW.H;
                const cx = W / 2;
                // The menu reflects system integrity: corrupted and red at first,
                // calm once the system is clean.
                const integrity = this.progress.integrity();
                const corrupt = 1 - integrity;
                const tone = UITheme.integrityColor(integrity);
                const time = this.bgTime || 0;

                // Title (RGB-split while compromised) + version badge
                ctx.save();
                ctx.font = '900 40px Orbitron';
                ctx.textAlign = 'center';
                if (corrupt > 0) {
                    const jitter = UITheme.reducedMotion ? 0 : Math.sin(time * 23) * Math.sin(time * 7) * 3 * corrupt;
                    ctx.globalAlpha = 0.55 * corrupt;
                    ctx.fillStyle = '#ef4444';
                    ctx.fillText('SYNCBREAKER', cx - 2 - jitter, 70);
                    ctx.fillStyle = '#38bdf8';
                    ctx.fillText('SYNCBREAKER', cx + 2 + jitter, 70);
                    ctx.globalAlpha = 1;
                }
                ctx.fillStyle = '#e2e8f0';
                ctx.fillText('SYNCBREAKER', cx, 70);
                const titleW = ctx.measureText('SYNCBREAKER').width;
                ctx.font = '700 18px Orbitron';
                ctx.fillStyle = '#22c55e';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.fillText('(v3)', cx + titleW / 2 + 22, 56);
                ctx.restore();

                // Subtitle
                ctx.fillStyle = tone;
                ctx.font = '600 16px Rajdhani';
                ctx.fillText(integrity >= 1 ? '✓ CYBER DEFENSE PROTOCOL COMPLETE ✓' : '⚠ CYBER DEFENSE PROTOCOL ⚠', cx, 100);

                // Story panel
                const panelX = cx - 320;
                const panelY = 130;
                const panelW = 640;
                const panelH = 350;

                // Panel background
                UITheme.panel(ctx, panelX, panelY, panelW, panelH, {
                    chamfer: 14,
                    fill: 'rgba(15, 23, 42, 0.78)',
                    stroke: UITheme.rgba(UITheme.rgb(tone), 0.45)
                });

                // Terminal header
                ctx.fillStyle = tone;
                ctx.font = '700 16px Orbitron';
                ctx.textAlign = 'left';
                ctx.fillText('> STATUS REPORT', panelX + 20, panelY + 30);

                // Terminal line
                ctx.strokeStyle = '#1e293b';
                ctx.beginPath();
                ctx.moveTo(panelX + 15, panelY + 42);
                ctx.lineTo(panelX + panelW - 15, panelY + 42);
                ctx.stroke();

                // Story text
                const alert = integrity >= 1
                    ? { text: '[SECURE] System integrity restored. The attacker is locked out.', color: '#22c55e', bold: true }
                    : integrity >= 0.5
                        ? { text: '[ALERT] The attacker is falling back toward the core.', color: '#f59e0b', bold: true }
                        : { text: '[WARNING] Your system is under cyber attack!', color: '#ef4444', bold: true };
                const lines = [
                    alert,
                    { text: '', color: '' },
                    { text: 'An unknown attacker has infiltrated your network.', color: '#e2e8f0' },
                    { text: 'Malicious code has been injected into critical system files.', color: '#e2e8f0' },
                    integrity >= 1
                        ? { text: 'No attacker activity detected.', color: '#22c55e' }
                        : { text: 'The attacker is still active and spreading.', color: '#f59e0b' },
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

                // Operator status along the bottom of the panel
                UITheme.clearanceChip(ctx, panelX + 150, panelY + panelH - 30, this.progress.clearanceLevel(), { color: tone });
                UITheme.integrityMeter(ctx, panelX + panelW - 300, panelY + panelH - 26, 280, integrity, { time });

                // Corruption overlay while the system is compromised
                UITheme.glitch(ctx, W, H, corrupt * 0.6, time);

                // Buton
                this.ui.renderButtons();

                // Version + author
                ctx.fillStyle = 'rgba(100,116,139,0.6)';
                ctx.font = '400 14px Rajdhani';
                ctx.textAlign = 'center';
                ctx.fillText('v3.0 · Written by dormhi', cx, H - 16);

                // Credits
                ctx.fillStyle = 'rgba(148,163,184,0.55)';
                ctx.font = '300 14px Rajdhani';
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
                    ctx.font = '600 16px Rajdhani';
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
                // Endless players land on the Endless slot; everyone else on their act.
                this._mapIndex = this.progress.isEndlessUnlocked() && this._hubEndlessFocus
                    ? this.progress.acts.length
                    : (this._actView || this.progress.currentActId()) - 1;
                this._mapScroll = this._mapIndex;
                if (this._securedAnim) this._securedAnim.t = -0.5;   // after the screen change
                this._buildActMapButtons();
                this._pickEnergyEggCell();
                this.tipBar.setTips('map', TipBar.MAP);
            },
            update: (dt) => {
                if (this._hubMessageTimer > 0) this._hubMessageTimer -= dt;
                if (this._wheelCooldown > 0) this._wheelCooldown -= dt;
                const sa = this._securedAnim;
                if (sa && sa.t !== null) {
                    const before = sa.t;
                    sa.t += dt;
                    if (before < 0 && sa.t >= 0) Sound.playStamp();
                    if (sa.t >= 0.6) this._securedAnim = null;
                }
                // Ease the carousel toward the focused act (the finger leads while dragging).
                if (!this._mapDrag) {
                    this._mapScroll += (this._mapIndex - this._mapScroll) * Math.min(1, dt * 10);
                    if (Math.abs(this._mapIndex - this._mapScroll) < 0.001) this._mapScroll = this._mapIndex;
                }
                // Background parallax follows the carousel (not with reduced motion).
                this._bgShift = UITheme.reducedMotion ? 0 : -this._mapScroll * 30;
                // Catch-up: a finished campaign shows the celebration once.
                if (this.progress.isCampaignComplete() && !this.progress.congratsSeen) {
                    this.progress.markCongratsSeen();
                    this.state.change(S.CONGRATS);
                }
            },
            render: (ctx) => {
                const W = VIEW.W;
                const H = VIEW.H;

                ctx.fillStyle = '#e2e8f0';
                ctx.font = '700 22px Orbitron';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'alphabetic';
                ctx.fillText('OPERATION MAP', W / 2, 30);

                ctx.fillStyle = '#64748b';
                ctx.font = '400 14px Rajdhani';
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
            exit: () => {
                this.ui.clearButtons();
                this._mapDrag = null;
                if (this._securedAnim && this._securedAnim.t !== null) this._securedAnim = null;
            },
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
                this._hubEndlessFocus = false;
                this._buildActButtons();
                const act = this.progress.act(this._actView);
                this.tipBar.setTips('act' + this._actView,
                    [TipBar.ACT.common].concat((act && TipBar.ACT[act.game]) || []));
            },
            update: (dt) => {
                if (this._hubMessageTimer > 0) this._hubMessageTimer -= dt;
                const a = this._ladderAnim;
                if (a && a.actId === this._actView) {
                    a.t += dt;
                    if (!a.sound && a.t >= GameManager.LADDER_FILL) {
                        a.sound = true;
                        Sound.playWaveUp();
                    }
                    if (a.t >= GameManager.LADDER_FILL + GameManager.LADDER_BURST) this._ladderAnim = null;
                }
                const c = this._clearanceUp;
                if (c && c.actId === this._actView) {
                    c.t += dt;
                    if (!c.sound && c.t >= 0) {
                        c.sound = true;
                        Sound.playLevelComplete();
                    }
                    if (c.t >= GameManager.CLEARANCE_SHOW) this._clearanceUp = null;
                }
            },
            render: (ctx) => {
                const W = VIEW.W;
                const H = VIEW.H;
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
            exit: () => {
                this.ui.clearButtons();
                this._ladderAnim = null;
                this._clearanceUp = null;
            },
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
                    this._beginResultStars(this.levels);
                    this._onStageCleared(this.levels.score, 1500, this._resultStars.n);
                }
                this._tickResultStars(dt);

                if (this.levels.levelFailed === true) {
                    this.levels.levelFailed = 'handled';
                    this._onStageFailed({
                        score: this.levels.score,
                        revivesUsed: this.levels.revivesUsed
                    });
                }
            },
            render: (ctx, alpha) => {
                const W = VIEW.W;
                const H = VIEW.H;

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
                    this._drawResultStars(ctx, W / 2, H / 2 + 46);
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
                const W = VIEW.W;
                const H = VIEW.H;

                // Title
                const isRevive = this._lockpickReason === 'revive' || this._lockpickReason === 'endless_revive';
                const title = isRevive ? 'RECOVERY PROTOCOL' : 'CODE BREAKER';
                const subtitle = 'Break the code to restore the connection';
                ctx.fillStyle = '#f59e0b';
                ctx.font = '700 22px Orbitron';
                ctx.textAlign = 'center';
                ctx.fillText(title, W / 2, 40);
                ctx.fillStyle = '#64748b';
                ctx.font = '400 14px Rajdhani';
                ctx.fillText(subtitle, W / 2, 60);

                // Instructions
                ctx.fillStyle = '#64748b';
                ctx.font = '400 16px Rajdhani';
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
                        width: VIEW.W,
                        height: VIEW.H
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
                    // A cleared campaign stage shows its stars a little longer.
                    if (m.result === 'success' && (this._mgConfig || {}).stage) {
                        this._beginResultStars(m);
                        this._mgEndTimer = Math.max(this._mgEndTimer, GameManager.STARS_HOLD);
                    }
                }
                this._tickResultStars(dt);
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
                const W = VIEW.W;
                const H = VIEW.H;
                const cfg = this._mgConfig || {};

                ctx.fillStyle = '#f59e0b';
                ctx.font = '700 22px Orbitron';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'alphabetic';
                ctx.fillText(cfg.title || 'MINIGAME', W / 2, 44);

                if (cfg.subtitle) {
                    ctx.fillStyle = '#64748b';
                    ctx.font = '400 14px Rajdhani';
                    ctx.fillText(cfg.subtitle, W / 2, 64);
                }
                if (cfg.hint) {
                    ctx.fillStyle = '#64748b';
                    ctx.font = '400 16px Rajdhani';
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
                if (this._resultStars && this._mgHandled) this._drawResultStars(ctx, W / 2, H - 120);
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
                const cx = VIEW.W / 2;
                const cy = VIEW.H / 2;
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
                const W = VIEW.W;
                const H = VIEW.H;
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
                    ctx.font = '400 16px Rajdhani';
                    ctx.fillText(this._goMessage, cx, cy);
                } else if (this._noRevive) {
                    ctx.fillStyle = '#ef4444';
                    ctx.font = '400 16px Rajdhani';
                    ctx.fillText('Recovery protocol failed', cx, cy);
                } else if (this._revivesUsed >= (this.levels.maxRevives || 2)) {
                    ctx.fillStyle = '#f59e0b';
                    ctx.font = '400 16px Rajdhani';
                    ctx.fillText('No recovery charges left for this node', cx, cy);
                }

                if (this._goCooldown > 0) {
                    ctx.fillStyle = '#f59e0b';
                    ctx.font = '600 16px Rajdhani';
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
                const W = VIEW.W;
                const H = VIEW.H;

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
                const cx = VIEW.W / 2;
                const cy = VIEW.H / 2;
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

                // Back to the Endless lobby
                this.ui.addButton('hub', '← ENDLESS', cx, cy + 155, 200, 40,
                    () => {
                        this.levels.endlessMode = false;
                        this.state.change(S.ENDLESS_HUB);
                    },
                    { color: '#64748b' }
                );
            },
            render: (ctx) => {
                const W = VIEW.W;
                const H = VIEW.H;
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
                ctx.font = '500 16px Rajdhani';
                ctx.fillText(`Wave: ${this._eoWave} | Hit: ${this._eoHitCount} | Max Combo: x${this._eoMaxCombo}`, cx, cy - 10);

                // Best
                const best = this.levels._loadEndlessBest();
                if (this._eoScore >= best && best > 0) {
                    ctx.fillStyle = '#f59e0b';
                    ctx.font = '600 16px Rajdhani';
                    ctx.fillText('🏆 NEW RECORD!', cx, cy + 15);
                } else if (best > 0) {
                    ctx.fillStyle = '#475569';
                    ctx.font = '400 14px Rajdhani';
                    ctx.fillText(`Best: ${best}`, cx, cy + 15);
                }

                if (this._eoNoRevive) {
                    ctx.fillStyle = '#ef4444';
                    ctx.font = '400 14px Rajdhani';
                    ctx.fillText('Recovery protocol failed', cx, cy + 32);
                }

                if (this._endlessUploadStatus) {
                    ctx.fillStyle = '#64748b';
                    ctx.font = '400 14px Rajdhani';
                    ctx.fillText(this._endlessUploadStatus, cx, cy + 50);
                }

                this.ui.renderButtons();
            },
            exit: () => this.ui.clearButtons(),
            onKey: (e) => {
                if (e.code === 'Escape') {
                    this.levels.endlessMode = false;
                    this.state.change(S.ENDLESS_HUB);
                }
            }
        });

        // ── ENDLESS HUB (lobby: play + leaderboard; only after the final act) ──
        this.state.register(S.ENDLESS_HUB, {
            enter: () => {
                this.ui.clearButtons();
                if (!this.progress.isEndlessUnlocked()) { this.state.change(S.HUB); return; }
                Sound.startAmbient();
                this._hubEndlessFocus = true;
                const cx = VIEW.W / 2;
                this.ui.addButton('endless-play', '▶  START RUN', cx, 418, 260, 50,
                    () => {
                        this.levels.endlessMode = false;
                        this.state.change(S.ENDLESS);
                    },
                    { color: '#facc15' });
                this.ui.addButton('endless-board', '🏆  LEADERBOARD', cx, 482, 260, 46,
                    () => this.state.change(S.LEADERBOARD), { color: '#38bdf8' });
                this.ui.addButton('back', '← ACTS', 70, VIEW.H - 35, 100, 32,
                    () => this.state.change(S.HUB), { color: '#475569' });
                this._addGuideButton();
                this.ui.focus('endless-play');
            },
            update: (dt) => {
                if (this._hubMessageTimer > 0) this._hubMessageTimer -= dt;
            },
            render: (ctx) => {
                this.ui.renderEnergyBar({
                    current: this.energy.currentEnergy,
                    max: this.energy.maxEnergy,
                    nextRegenIn: this.energy.getTimeToNextRegen()
                });
                this._renderEndlessHub(ctx);
                this.ui.renderButtons();
            },
            exit: () => this.ui.clearButtons(),
            onKey: (e) => {
                if (e.code === 'Escape') this.state.change(S.HUB);
                if (e.code === 'KeyH') this._openGuide();
            }
        });

        // ── CONGRATS (Endless Mode unlocked) ──
        this.state.register(S.CONGRATS, {
            enter: () => {
                this.ui.clearButtons();
                Sound.stopAmbient();
                this.progress.markCongratsSeen();
                const cx = VIEW.W / 2;
                const cy = VIEW.H / 2;
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
                const cx = VIEW.W / 2;
                const H = VIEW.H;
                this._leaderboardEntries = [];
                this._leaderboardMe = null;
                this._leaderboardStatus = 'Connecting...';
                this.ui.addButton('leaderboard-retry', '↻ REFRESH', cx - 115, H - 45, 180, 36,
                    () => this._loadLeaderboard(), { color: '#3b82f6' });
                this.ui.addButton('leaderboard-hub', '← ENDLESS', cx + 115, H - 45, 180, 36,
                    () => this.state.change(S.ENDLESS_HUB), { color: '#64748b' });

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
            onKey: (e) => { if (e.code === 'Escape') this.state.change(S.ENDLESS_HUB); }
        });

        // Enter initial state
        const menuH = this.state._handlers[S.MENU];
        if (menuH) menuH.enter();
    }

    _addProfileBackButton() {
        const cx = VIEW.W / 2;
        const cy = VIEW.H / 2;
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
        const W = VIEW.W;
        const H = VIEW.H;
        const cx = W / 2;
        ctx.save();
        ctx.fillStyle = '#f59e0b';
        ctx.font = '700 24px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText('OPERATOR PROFILE', cx, H / 2 - 40);
        if (this._profileStatus) {
            ctx.fillStyle = /not configured|Offline/.test(this._profileStatus) ? '#ef4444' : '#94a3b8';
            ctx.font = '400 16px Rajdhani';
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
        const W = VIEW.W;
        const H = VIEW.H;
        const cx = W / 2;
        ctx.save();
        ctx.fillStyle = '#f59e0b';
        ctx.font = '700 24px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText('∞ ENDLESS LEADERBOARD', cx, 60);
        ctx.fillStyle = '#64748b';
        ctx.font = '400 16px Rajdhani';
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
        ctx.font = '600 14px Rajdhani';
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
            ctx.font = '600 16px Rajdhani';
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
            ctx.font = '400 16px Rajdhani';
            ctx.textAlign = 'center';
            ctx.fillText('Finish an Endless run to claim your place.', cx, 515);
        }
        if (this._leaderboardStatus) {
            ctx.fillStyle = '#94a3b8';
            ctx.font = '400 16px Rajdhani';
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
        const W = VIEW.W;
        const H = VIEW.H;
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
        ctx.font = '600 16px Rajdhani';
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
        ctx.font = '400 14px Rajdhani';
        ctx.fillText('Survive unlimited waves and compete against other operators', cx, by + 52);
        ctx.fillText('on the online leaderboard — play as long as you like.', cx, by + 70);

        // Total best score
        const totalBest = this._totalBest();
        ctx.fillStyle = '#64748b';
        ctx.font = '500 14px Rajdhani';
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
        const W = VIEW.W;
        return {
            W, cx: W / 2, cy: 300,
            cardW: 360, cardH: 230,
            spacing: 410, sideScale: 0.78,
            railY: 100, railStep: 64,
            chevronW: 44, chevronH: 70
        };
    }

    /** Centre x of act index i (0-based) for a given scroll position. */
    _mapX(i, scroll) {
        const L = this._actMapLayout();
        return L.cx + (i - scroll) * L.spacing;
    }

    /** Rail x of act index i; index acts.length is the Endless node at the end. */
    _mapRailX(i) {
        const L = this._actMapLayout();
        const n = this.progress.acts.length;
        return L.cx + (i - n / 2) * L.railStep;
    }

    /** The Endless node: open once unlocked, otherwise say how to get there. */
    _openEndlessNode() {
        if (this.progress.isEndlessUnlocked()) {
            this._mapGo(this.progress.acts.length);
        } else {
            this._hubMessage = `Complete ACT ${CAMPAIGN.finalAct} to unlock Endless Mode`;
            this._hubMessageTimer = 2.5;
        }
    }

    /** Focus act index i (clamped) and rebuild the map buttons. */
    /** Carousel slots: every act, plus Endless at the end once it is unlocked. */
    _mapCount() {
        return this.progress.acts.length + (this.progress.isEndlessUnlocked() ? 1 : 0);
    }

    _isEndlessSlot(i) {
        return i === this.progress.acts.length;
    }

    _mapGo(i) {
        const next = Math.max(0, Math.min(this._mapCount() - 1, i));
        if (next === this._mapIndex) return false;
        this._mapIndex = next;
        if (!this._isEndlessSlot(next)) this._actView = next + 1;
        this.ui.clearButtons();
        this._buildActMapButtons();
        return true;
    }

    // ── Carousel drag (touch) ──

    /** Claim a touch that starts on the card band of the HUB as a drag. */
    _mapDragStart(x, y, now = performance.now()) {
        if (this.state.currentState !== this.state.STATES.HUB || this.state.transitioning) return false;
        const L = this._actMapLayout();
        if (Math.abs(y - L.cy) > L.cardH / 2) return false;
        this._mapDrag = { x0: x, y0: y, scroll0: this._mapScroll, lastX: x, lastT: now, v: 0 };
        return true;
    }

    /** The carousel follows the finger, with a soft stop past the ends. */
    _mapDragMove(x, now = performance.now()) {
        const d = this._mapDrag;
        if (!d) return;
        const L = this._actMapLayout();
        const last = this._mapCount() - 1;
        let s = d.scroll0 - (x - d.x0) / L.spacing;
        if (s < 0) s *= 0.35;
        if (s > last) s = last + (s - last) * 0.35;
        this._mapScroll = s;
        const dt = (now - d.lastT) / 1000;
        if (dt > 0) {
            // Velocity in cards per second, smoothed over the last moves.
            const inst = -(x - d.lastX) / L.spacing / dt;
            d.v = d.v * 0.6 + inst * 0.4;
            d.lastX = x;
            d.lastT = now;
        }
    }

    /** Release: a tap opens what is under the finger, a drag snaps (a flick moves on). */
    _mapDragEnd(tap, now = performance.now()) {
        const d = this._mapDrag;
        if (!d) return;
        this._mapDrag = null;
        if (tap) {
            this._mapScroll = d.scroll0;
            this._hitTestUI(d.x0, d.y0, 'touch');
            return;
        }
        // A finger that stopped before lifting carries no flick.
        const v = now - d.lastT > 120 ? 0 : d.v;
        const s = this._mapScroll;
        const target = Math.abs(v) > 1.2 ? Math.round(s + Math.sign(v) * 0.5) : Math.round(s);
        const last = this._mapCount() - 1;
        this._mapGo(Math.max(0, Math.min(last, target)));
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
        const W = VIEW.W;
        const H = VIEW.H;
        const L = this._actMapLayout();
        const acts = this.progress.acts;
        const i = this._mapIndex;

        // Chevrons first so they win over the peeking side cards.
        if (i > 0) {
            this.ui.addButton('map-prev', '‹', L.chevronW / 2 + 4, L.cy, L.chevronW, L.chevronH,
                () => this._mapGo(this._mapIndex - 1),
                { draw: (ctx, btn, hovered) => this._drawChevron(ctx, btn, hovered, -1) });
        }
        const count = this._mapCount();
        if (i < count - 1) {
            this.ui.addButton('map-next', '›', W - L.chevronW / 2 - 4, L.cy, L.chevronW, L.chevronH,
                () => this._mapGo(this._mapIndex + 1),
                { draw: (ctx, btn, hovered) => this._drawChevron(ctx, btn, hovered, 1) });
        }

        // Focused card (opens the act, or the Endless lobby). Drawn by _renderActMap, so hidden here.
        if (this._isEndlessSlot(i)) {
            this.ui.addButton('endless-card', 'ENDLESS MODE', L.cx, L.cy, L.cardW, L.cardH,
                () => this.state.change(this.state.STATES.ENDLESS_HUB), { hidden: true });
        } else {
            const act = acts[i];
            this.ui.addButton(`act${act.id}`, act.key, L.cx, L.cy, L.cardW, L.cardH,
                () => this._openMapAct(act), { hidden: true });
        }

        // Side cards: tapping the visible part scrolls to them.
        const sideW = L.cardW * L.sideScale, sideH = L.cardH * L.sideScale;
        const inner = L.chevronW + 12;
        if (i > 0) {
            const right = L.cx - L.spacing + sideW / 2, left = inner;
            this.ui.addButton(`act${acts[i - 1].id}`, acts[i - 1].key, (left + right) / 2, L.cy, right - left, sideH,
                () => this._mapGo(this._mapIndex - 1), { hidden: true });
        }
        if (i < count - 1) {
            const left = L.cx + L.spacing - sideW / 2, right = W - inner;
            const id = this._isEndlessSlot(i + 1) ? 'endless-side' : `act${acts[i + 1].id}`;
            this.ui.addButton(id, '', (left + right) / 2, L.cy, right - left, sideH,
                () => this._mapGo(this._mapIndex + 1), { hidden: true });
        }

        // Gates on either side of the focused act (48 x 72 tap targets).
        [i, i + 1].forEach(n => {
            if (n < 1 || n > acts.length - 1) return;
            this.ui.addButton(`gate${n}`, '', this._mapX(n - 0.5, i), L.cy, 48, 72,
                () => this._tryStartGate(n), { hidden: true });
        });

        // Progress rail: one node per act, tap to jump there.
        acts.forEach((a, k) => {
            this.ui.addButton(`rail${a.id}`, '', this._mapRailX(k), L.railY, 48, 48,
                () => this._mapGo(k),
                { draw: (ctx, btn, hovered) => this._drawRailNode(ctx, btn, hovered, a, k) });
        });
        // Endless Mode: its own node at the very end of the rail.
        this.ui.addButton('rail-endless', '', this._mapRailX(acts.length), L.railY, 48, 48,
            () => this._openEndlessNode(),
            { draw: (ctx, btn, hovered) => this._drawEndlessNode(ctx, btn, hovered) });

        // Endless Mode and its leaderboard live behind the Endless node only.
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
        const L = this._actMapLayout();
        const w = L.cardW;
        const h = L.cardH;
        const left = -w / 2;
        const top = -h / 2;
        const theme = getLevelTheme(act.themeId);
        const color = status === 'complete' ? UITheme.color.ok
            : (status === 'locked' || status === 'dev') ? UITheme.color.locked
            : theme.zoneColor;
        const dim = status === 'locked' || status === 'dev';
        const game = GameRegistry.get(act.game);
        const time = UITheme.reducedMotion ? 0 : (this.bgTime || 0);   // frozen with reduced motion
        const layer = UITheme.layerOf(act.id);
        const stage = { x: left + 10, y: top + 10, w: w - 20, h: 96 };
        const cx = stage.x + stage.w / 2;
        const cy = stage.y + stage.h / 2;
        const seed = Math.floor(time * 6) * 7 + act.id * 13;
        const hash = k => Math.abs((Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453) % 1);

        ctx.save();
        UITheme.panel(ctx, left, top, w, h, {
            chamfer: 16,
            stroke: color,
            lineWidth: highlighted ? 2.2 : 1.4,
            fill: highlighted ? UITheme.color.panelHi : UITheme.color.panel,
            glow: dim ? null : color,
            dashed: status === 'dev'
        });
        if (dim) ctx.globalAlpha = 0.75;

        // Stage area
        ctx.save();
        ctx.beginPath();
        ctx.rect(stage.x, stage.y, stage.w, stage.h);
        ctx.clip();
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.08;
        ctx.fillRect(stage.x, stage.y, stage.w, stage.h);
        ctx.globalAlpha = dim ? 0.08 : 0.18;
        if (theme.bgType === 'scanlines') {
            const off = (time * 20) % 6;
            for (let y = stage.y - off; y < stage.y + stage.h; y += 6) {
                ctx.fillRect(stage.x, y, stage.w, 1);
            }
        } else {
            // Falling symbol columns, each row wrapping inside the stage area
            const cols = 8;
            const symbols = theme.particleSymbols;
            const step = stage.w / cols;
            const span = stage.h + 16;
            const rows = Math.ceil(span / 16);
            ctx.font = '600 12px monospace';
            ctx.textAlign = 'center';
            for (let col = 0; col < cols; col++) {
                const fall = (14 + col * 3) * time;
                const x = stage.x + col * step + step / 2;
                for (let row = 0; row < rows; row++) {
                    const y = stage.y + ((row * 16 + fall) % span);
                    ctx.fillText(symbols[(col + row) % symbols.length], x, y);
                }
            }
        }
        ctx.globalAlpha = dim ? 0.75 : 1;

        // Icon (acts in development show SIGNAL LOST instead) + stage headers
        if (status !== 'dev') {
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, cy, 30, 0, Math.PI * 2);
            ctx.stroke();
            ctx.save();
            ctx.translate(cx, cy);
            LevelIcons.draw(ctx, act.themeId, 34, color);
            ctx.restore();
        }

        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = color;
        ctx.font = UITheme.font('label', 700, 'Orbitron');
        ctx.fillText(`ACT ${act.id}${game ? ' · ' + game.title : ''}`, stage.x + 10, stage.y + 20);

        ctx.textAlign = 'right';
        ctx.fillStyle = layer.color;
        ctx.globalAlpha = 0.8;
        ctx.font = UITheme.font('label', 700);
        ctx.fillText(layer.key, stage.x + stage.w - 10, stage.y + 20);
        ctx.globalAlpha = dim ? 0.75 : 1;
        ctx.textAlign = 'left';

        // Status overlay on stage
        if (status === 'complete') {
            // 'SECURED' stamp to the right of the icon
            // A freshly secured act: the stamp slams down when the HUB first shows it.
            const sa = this._securedAnim;
            const fresh = sa && sa.actId === act.id && sa.t !== null;
            const q = fresh ? Utils.clamp(sa.t / 0.15, 0, 1) : 1;
            ctx.save();
            ctx.translate(cx + 102, cy);
            ctx.rotate(-0.12);
            ctx.scale(1 + 1.2 * (1 - q), 1 + 1.2 * (1 - q));
            ctx.strokeStyle = UITheme.color.ok;
            ctx.globalAlpha = 0.85 * q;
            ctx.lineWidth = 2.5;
            ctx.strokeRect(-60, -16, 120, 32);
            ctx.fillStyle = UITheme.color.ok;
            ctx.font = '900 16px Orbitron';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('SECURED', 0, 1);
            ctx.restore();
        } else if (status === 'locked' || status === 'dev') {
            ctx.strokeStyle = UITheme.color.textMute;
            ctx.globalAlpha = 0.3;
            ctx.lineWidth = 1;
            for (let k = 0; k < 6; k++) {
                const y = stage.y + 14 + hash(k) * 68;
                const lineW = 30 + hash(k + 7) * 60;
                ctx.beginPath();
                ctx.moveTo(cx - lineW / 2, y);
                ctx.lineTo(cx + lineW / 2, y);
                ctx.stroke();
            }
            if (status === 'locked') {
                ctx.globalAlpha = dim ? 0.75 : 1;
                this.ui._drawLockGlyph(ctx, cx - 11, cy - 6, 22, UITheme.color.textDim);
            } else {
                ctx.save();
                ctx.globalAlpha = 0.55 + 0.35 * Math.sin(time * 4);
                ctx.fillStyle = UITheme.color.textDim;
                ctx.font = UITheme.font('title', 700, 'Orbitron');
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('SIGNAL LOST', cx, cy);
                ctx.restore();
            }
        }
        ctx.restore();

        // Act key + story
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = dim ? UITheme.color.textMute : UITheme.color.text;
        ctx.font = '700 21px Orbitron';
        ctx.fillText(this.ui._fitText(act.key, w - 44), left + 22, top + 136);

        ctx.fillStyle = UITheme.color.textDim;
        ctx.font = UITheme.font('body', 500);
        ctx.fillText(this.ui._fitText(act.story, w - 44), left + 22, top + 160);

        // Tier row / dev tag
        if (status === 'dev') {
            ctx.textBaseline = 'middle';
            ctx.fillStyle = UITheme.color.textDim;
            ctx.font = UITheme.font('label', 700);
            ctx.fillText('⚙ IN DEVELOPMENT', left + 22, top + 192);
        } else {
            const done = this.progress.stagesDone(act.id);
            const n = act.stages.length;
            for (let k = 0; k < n; k++) {
                UITheme.tierBadge(ctx, left + 22 + 17 + k * 40, top + 192, act.stages[k].tier, 22, { dim: k >= done });
            }
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.font = UITheme.font('label', 700);
            if (status === 'complete') {
                ctx.fillStyle = UITheme.color.ok;
                ctx.fillText('COMPLETE', left + w - 22, top + 192);
            } else if (status === 'locked') {
                ctx.fillStyle = UITheme.color.textDim;
                ctx.fillText('LOCKED', left + w - 22, top + 192);
            } else {
                ctx.fillStyle = theme.zoneColor;
                ctx.fillText(`${done}/${n} STAGES`, left + w - 22, top + 192);
            }
        }

        // Footer
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        if (this._actBest(act) > 0) {
            ctx.fillStyle = UITheme.color.locked;
            ctx.font = UITheme.font('label', 600);
            ctx.fillText(`BEST ${this._actBest(act)}`, left + 22, top + h - 14);
        }
        // Stars earned in this act
        const stars = this.progress.actStars(act.id);
        if (stars.got > 0) {
            UITheme.star(ctx, -24, top + h - 19, 7, true);
            ctx.textAlign = 'left';
            ctx.fillStyle = '#facc15';
            ctx.font = UITheme.font('label', 700);
            ctx.fillText(`${stars.got}/${stars.max}`, -12, top + h - 14);
        }
        ctx.textAlign = 'right';
        if (status === 'active' || status === 'complete') {
            ctx.fillStyle = highlighted ? color : UITheme.color.textMute;
            ctx.font = '700 14px Orbitron';
            ctx.fillText('OPEN ▸', left + w - 22, top + h - 14);
        }

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
        const r = focused ? 13 : 11;
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
        ctx.font = '600 14px Rajdhani';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(act.id), btn.x, btn.y + 27);
        ctx.restore();
    }

    /**
     * Endless Mode node: a slowly turning dashed gold ring around an infinity
     * sign shaded gold to cyan, with a spark running along the loop. Locked,
     * it is grey with a small padlock. Reduced motion stops the ring and spark.
     */
    _drawEndlessNode(ctx, btn, hovered) {
        const open = this.progress.isEndlessUnlocked();
        const time = UITheme.reducedMotion ? 0 : (this.bgTime || 0);
        const x = btn.x, y = btn.y, r = 16;
        const gold = '#facc15';
        // Lemniscate point for parameter t (width ~2a).
        const a = 11;
        const at = (t) => {
            const d = 1 + Math.sin(t) * Math.sin(t);
            return [x + a * Math.cos(t) / d, y + a * Math.sin(t) * Math.cos(t) / d];
        };

        ctx.save();
        // Disc
        ctx.fillStyle = 'rgba(15,23,42,0.96)';
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = hovered ? 2.4 : 1.8;
        if (open) {
            const ring = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
            ring.addColorStop(0, '#f59e0b');
            ring.addColorStop(1, '#38bdf8');
            ctx.strokeStyle = ring;
            ctx.shadowColor = gold;
            ctx.shadowBlur = hovered ? 14 : 8;
        } else {
            ctx.strokeStyle = UITheme.color.locked;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Outer dashed ring, slowly turning
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(time * 0.6);
        ctx.setLineDash([4, 5]);
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = open ? gold : 'rgba(71,85,105,0.6)';
        ctx.globalAlpha = open ? 0.7 : 0.5;
        ctx.beginPath(); ctx.arc(0, 0, r + 5, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();

        // Infinity sign
        ctx.beginPath();
        for (let k = 0; k <= 48; k++) {
            const p = at(k / 48 * Math.PI * 2);
            if (k === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
        }
        ctx.closePath();
        if (open) {
            const g = ctx.createLinearGradient(x - a, y, x + a, y);
            g.addColorStop(0, '#f59e0b');
            g.addColorStop(0.5, gold);
            g.addColorStop(1, '#38bdf8');
            ctx.strokeStyle = g;
        } else {
            ctx.strokeStyle = UITheme.color.locked;
        }
        ctx.lineWidth = 2.2;
        ctx.lineJoin = 'round';
        ctx.stroke();

        if (open) {
            // Spark running along the loop
            const sp = at(time * 2.2);
            ctx.fillStyle = '#fff';
            ctx.shadowColor = gold;
            ctx.shadowBlur = 8;
            ctx.beginPath(); ctx.arc(sp[0], sp[1], 1.8, 0, Math.PI * 2); ctx.fill();
            ctx.shadowBlur = 0;
        } else {
            this.ui._drawLockGlyph(ctx, x + 8, y + 9, 8, UITheme.color.textDim);
        }

        if (this._isEndlessSlot(this._mapIndex)) {
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(x, y, r + 9, 0, Math.PI * 2); ctx.stroke();
        }

        ctx.fillStyle = open ? gold : '#64748b';
        ctx.font = '600 14px Rajdhani';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('ENDLESS', x, y + 27);
        ctx.restore();
    }

    /** The Endless slot of the act map (only shown once Endless is unlocked). */
    _drawEndlessCard(ctx, highlighted) {
        const L = this._actMapLayout();
        const w = L.cardW, h = L.cardH, left = -w / 2, top = -h / 2;
        const time = UITheme.reducedMotion ? 0 : (this.bgTime || 0);
        const gold = '#facc15';
        ctx.save();
        UITheme.panel(ctx, left, top, w, h, {
            chamfer: 16, stroke: gold, lineWidth: highlighted ? 2.4 : 1.6,
            fill: highlighted ? UITheme.color.panelHi : UITheme.color.panel, glow: gold
        });
        // Stage area: gold wash and the emblem
        ctx.save();
        ctx.beginPath();
        ctx.rect(left + 10, top + 10, w - 20, 96);
        ctx.clip();
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = gold;
        ctx.fillRect(left + 10, top + 10, w - 20, 96);
        ctx.globalAlpha = 1;
        this._drawInfinityEmblem(ctx, 0, top + 58, 44, time);
        ctx.restore();

        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = gold;
        ctx.font = UITheme.font('label', 700, 'Orbitron');
        ctx.fillText('AFTER THE CAMPAIGN', left + 20, top + 30);
        ctx.fillStyle = UITheme.color.text;
        ctx.font = '700 21px Orbitron';
        ctx.fillText('ENDLESS MODE', left + 22, top + 136);
        ctx.fillStyle = UITheme.color.textDim;
        ctx.font = UITheme.font('body', 500);
        ctx.fillText(this.ui._fitText('The attack never ends. Climb the leaderboard.', w - 44), left + 22, top + 160);

        const best = this.levels._loadEndlessBest();
        ctx.fillStyle = best > 0 ? gold : UITheme.color.textMute;
        ctx.font = UITheme.font('label', 700);
        ctx.textBaseline = 'middle';
        ctx.fillText(best > 0 ? `BEST ${best}` : 'NO RUN YET', left + 22, top + 192);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = highlighted ? gold : UITheme.color.textMute;
        ctx.font = '700 14px Orbitron';
        ctx.fillText('OPEN ▸', left + w - 22, top + h - 14);
        ctx.restore();
    }

    /** Infinity sign (lemniscate) path centred on (x, y), half-width a. */
    _infinityPath(ctx, x, y, a) {
        ctx.beginPath();
        for (let k = 0; k <= 64; k++) {
            const t = k / 64 * Math.PI * 2;
            const d = 1 + Math.sin(t) * Math.sin(t);
            const px = x + a * Math.cos(t) / d, py = y + a * Math.sin(t) * Math.cos(t) / d;
            if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
    }

    /** Big gold-to-cyan infinity emblem with a spark running along it. */
    _drawInfinityEmblem(ctx, x, y, a, time) {
        const g = ctx.createLinearGradient(x - a, y, x + a, y);
        g.addColorStop(0, '#f59e0b');
        g.addColorStop(0.5, '#facc15');
        g.addColorStop(1, '#38bdf8');
        ctx.save();
        ctx.lineJoin = 'round';
        // Soft halo, then the sign itself
        ctx.globalAlpha = 0.25;
        ctx.strokeStyle = g;
        ctx.lineWidth = a * 0.28;
        this._infinityPath(ctx, x, y, a);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.lineWidth = a * 0.11;
        ctx.shadowColor = '#facc15';
        ctx.shadowBlur = 16;
        ctx.stroke();
        ctx.shadowBlur = 0;
        const t = time * 1.6;
        const d = 1 + Math.sin(t) * Math.sin(t);
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#facc15';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(x + a * Math.cos(t) / d, y + a * Math.sin(t) * Math.cos(t) / d, a * 0.06, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    /** Endless lobby: emblem, title, best run and what is coming. */
    _renderEndlessHub(ctx) {
        const W = VIEW.W, cx = W / 2;
        const time = UITheme.reducedMotion ? 0 : (this.bgTime || 0);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#facc15';
        ctx.font = UITheme.font('label', 700, 'Orbitron');
        ctx.fillText(`AFTER ACT ${CAMPAIGN.finalAct} · NO FINISH LINE`, cx, 40);
        ctx.fillStyle = UITheme.color.text;
        ctx.font = '900 34px Orbitron';
        ctx.fillText('ENDLESS MODE', cx, 82);
        ctx.fillStyle = UITheme.color.textDim;
        ctx.font = UITheme.font('body', 500);
        ctx.fillText('The attacker never stops. Hold the line as long as you can.', cx, 110);

        // Emblem in a slowly turning dashed ring
        const ey = 232;
        ctx.save();
        ctx.translate(cx, ey);
        ctx.rotate(time * 0.25);
        ctx.setLineDash([6, 8]);
        ctx.strokeStyle = 'rgba(250,204,21,0.45)';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, 100, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        this._drawInfinityEmblem(ctx, cx, ey, 78, time);

        const best = this.levels._loadEndlessBest();
        ctx.fillStyle = best > 0 ? '#facc15' : UITheme.color.textMute;
        ctx.font = UITheme.font('title', 700, 'Orbitron');
        ctx.fillText(best > 0 ? `BEST ${best}` : 'NO RUN YET', cx, 365);
        ctx.fillStyle = UITheme.color.textMute;
        ctx.font = UITheme.font('label', 600);
        ctx.fillText('Timing Bar for now — more campaign games are coming to Endless', cx, 548);
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

    /** Firewall segments across the card band at gate n (open, breachable or locked). */
    _drawGateWall(ctx, x, cy, n) {
        const open = this.progress.isGateOpen(n);
        const playable = this.progress.isGatePlayable(n);
        const layerGate = UITheme.layerOf(n).key !== UITheme.layerOf(n + 1).key;
        const color = open ? UITheme.color.ok : playable ? UITheme.color.warn : UITheme.color.locked;
        const reach = layerGate ? 118 : 96;
        const pulse = playable ? 0.5 + 0.5 * Math.sin((this.bgTime || 0) * 3) : 0;
        ctx.save();
        ctx.fillStyle = color;
        // Open walls fade to a faint dotted line: the way is clear.
        ctx.globalAlpha = open ? 0.3 : 0.45 + 0.4 * pulse;
        const offsets = layerGate ? [-5, 5] : [0];
        for (let y = cy - reach; y <= cy + reach - 8; y += 14) {
            if (Math.abs(y + 4 - cy) < 30) continue;   // room for the gate node
            for (const o of offsets) {
                if (open) ctx.fillRect(x + o - 1, y + 2, 2, 4);
                else ctx.fillRect(x + o - 2, y, 4, 8);
            }
        }
        ctx.restore();
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
        const slots = Array.from({ length: this._mapCount() }, (_, k) => k);
        const order = slots
            .filter(k => Math.abs(k - scroll) < 1.7)
            .sort((a, b) => Math.abs(b - scroll) - Math.abs(a - scroll));
        const focusBtn = this.ui.buttons.find(b => b.id === (this._isEndlessSlot(this._mapIndex)
            ? 'endless-card' : `act${acts[this._mapIndex].id}`));
        for (const k of order) {
            const d = Math.min(1, Math.abs(k - scroll));
            const scale = 1 - (1 - L.sideScale) * d;
            ctx.save();
            ctx.globalAlpha = 1 - 0.5 * d;
            ctx.translate(this._mapX(k, scroll), L.cy);
            ctx.scale(scale, scale);
            const hl = k === this._mapIndex && d < 0.05 && focusBtn && this.ui.isHovered(focusBtn);
            if (this._isEndlessSlot(k)) this._drawEndlessCard(ctx, hl);
            else this._drawActCard(ctx, acts[k], this._actStatus(acts[k].id), hl);
            ctx.restore();
        }

        // Gates between neighbouring acts, moving with the track: a firewall
        // across the band (double between network layers) with the gate node on it.
        for (let n = 1; n < acts.length; n++) {
            const x = this._mapX(n - 0.5, scroll);
            if (x < -30 || x > L.W + 30) continue;
            this._drawGateWall(ctx, x, L.cy, n);
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
            ctx.beginPath(); ctx.moveTo(x1 + 14, L.railY); ctx.lineTo(x2 - 14, L.railY); ctx.stroke();
        }
        // Dotted gold lead from the final act to the Endless node.
        ctx.strokeStyle = this.progress.isEndlessUnlocked() ? 'rgba(250,204,21,0.75)' : 'rgba(250,204,21,0.25)';
        ctx.setLineDash([2, 5]);
        ctx.beginPath();
        ctx.moveTo(this._mapRailX(n - 1) + 14, L.railY);
        ctx.lineTo(this._mapRailX(n) - 22, L.railY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Network layers above the rail: a bracket and a name per group of acts.
        ctx.font = UITheme.font('label', 700);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        for (const layer of UITheme.layers) {
            const ks = layer.acts.map(id => id - 1).filter(k => k < n);
            if (!ks.length) continue;
            const x1 = this._mapRailX(ks[0]) - 14, x2 = this._mapRailX(ks[ks.length - 1]) + 14;
            ctx.globalAlpha = 0.75;
            ctx.strokeStyle = layer.color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x1, L.railY - 20); ctx.lineTo(x1, L.railY - 25);
            ctx.lineTo(x2, L.railY - 25); ctx.lineTo(x2, L.railY - 20);
            ctx.stroke();
            ctx.fillStyle = layer.color;
            ctx.fillText(layer.key, (x1 + x2) / 2, L.railY - 31);
        }
        ctx.globalAlpha = 1;

        // Operator status: clearance (acts cleared) and system integrity.
        const layer = UITheme.layerOf(this._mapIndex + 1);
        UITheme.clearanceChip(ctx, W / 2 - 130, L.railY + 54, this.progress.clearanceLevel(), { color: layer.color });
        UITheme.integrityMeter(ctx, W / 2 + 20, L.railY + 60, 200, this.progress.integrity(), { time: this.bgTime || 0 });
        ctx.restore();
    }

    _renderHubMessage(ctx, W, H) {
        if (!(this._hubMessageTimer > 0) || !this._hubMessage) return;
        ctx.save();
        ctx.globalAlpha = Math.min(1, this._hubMessageTimer);
        ctx.fillStyle = '#f59e0b';
        ctx.font = '600 16px Rajdhani';
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
                const k = r.width / VIEW.W;      // CSS px per canvas px
                const fs = Math.max(10, 12 * k);
                a.style.fontSize = fs + 'px';
                a.style.left = (r.left + 16 * k) + 'px';
                // Centre the badge on the footer line (canvas y = H - 24).
                a.style.top = (r.top + (VIEW.H - 24) * k - 1.2 * fs) + 'px';
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
        this.ui.addButton('pause', '', 40, VIEW.H - 34, 60, 48,
            () => this._openPause(),
            { focusable: false, exact: true, draw: (ctx, btn, hovered) => this._drawPauseButton(ctx, btn, hovered) });
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
        const W = VIEW.W, H = VIEW.H;
        const pause = this._quit && this._quit.mode === 'pause';
        const rows = pause ? (this._quit.cfg.onRestart ? 3 : 2) : 0;
        const h = pause ? 120 + rows * 56 : 190;
        return { x: W / 2 - 220, y: H / 2 - h / 2, w: 440, h };
    }

    _buildPauseButtons() {
        const q = this._quit;
        const W = VIEW.W;
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
            case S.ENDLESS_OVER:
                this.levels.endlessMode = false;
                this.state.change(S.ENDLESS_HUB);
                return true;
            case S.LEADERBOARD: this.state.change(S.ENDLESS_HUB); return true;
            case S.ENDLESS_HUB: this.state.change(S.HUB); return true;
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
        ctx.font = '500 16px Rajdhani';
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
        ctx.font = '700 16px Orbitron';
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
            returnState: from === S.ACT || from === S.ENDLESS_HUB ? from : S.HUB,
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
        const W = VIEW.W;
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
        const W = VIEW.W;
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
        const W = VIEW.W;
        const H = VIEW.H;
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
            ctx.font = '700 14px Orbitron';
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
                    ctx.font = '700 14px Orbitron';
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
        ctx.font = '500 14px Rajdhani';
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

    /**
     * Rising stage ladder: card centres climb left to right, a circuit track
     * runs under them (one node per card) and ends at the act's gate node.
     */
    _actScreenLayout(n, hasGate = true) {
        const W = VIEW.W;
        const cardW = 150, cardH = 150, gap = 18, rise = 18;
        const gateGap = 26, gateR = 22;
        const totalW = n * cardW + (n - 1) * gap + (hasGate ? gateGap + gateR * 2 : 0);
        const x0 = (W - totalW) / 2 + cardW / 2;
        const yMid = 282;
        const xs = [], ys = [], trackYs = [];
        for (let i = 0; i < n; i++) {
            xs.push(x0 + i * (cardW + gap));
            ys.push(yMid + ((n - 1) / 2 - i) * rise);
            trackYs.push(ys[i] + cardH / 2 + 16);
        }
        const gate = hasGate
            ? { x: xs[n - 1] + cardW / 2 + gateGap + gateR, y: trackYs[n - 1] - rise, r: gateR }
            : null;
        return { cardW, cardH, rise, xs, ys, trackYs, gate, statusY: 446, buttonY: 496 };
    }

    /** Does act `actId` end in a gate (the final act does not)? */
    _actHasGate(actId) {
        return !!CAMPAIGN.gates[actId - 1];
    }

    /**
     * How stage card i should look: 'cleared' | 'next' | 'locked', plus
     * `unlock` (0..1) while a freshly opened card plays its unlock effect.
     * During the track fill the card being opened still shows as locked.
     */
    _stageView(act, i) {
        const a = this._ladderAnim && this._ladderAnim.actId === act.id ? this._ladderAnim : null;
        if (a && i === a.seg + 1) {
            if (a.t < GameManager.LADDER_FILL) return { status: 'locked', unlock: null };
            return { status: 'next', unlock: Math.min(1, (a.t - GameManager.LADDER_FILL) / GameManager.LADDER_BURST) };
        }
        if (this.progress.isStageCompleted(act.id, i)) return { status: 'cleared', unlock: null };
        return { status: this.progress.isStageUnlocked(act.id, i) ? 'next' : 'locked', unlock: null };
    }

    /** Filled share (0..1) of track segment k: from card k to card k + 1 (or the gate). */
    _ladderFill(act, k) {
        const a = this._ladderAnim && this._ladderAnim.actId === act.id ? this._ladderAnim : null;
        if (a && k === a.seg) return Utils.easeOutQuad(Utils.clamp(a.t / GameManager.LADDER_FILL, 0, 1));
        return k < this.progress.stagesDone(act.id) ? 1 : 0;
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
        const W = VIEW.W;
        const H = VIEW.H;
        const act = this.progress.act(this._actView);
        if (!act) return;
        const L = this._actScreenLayout(act.stages.length, this._actHasGate(act.id));

        act.stages.forEach((stage, i) => {
            this.ui.addButton(`stage${i}`, stage.tier, L.xs[i], L.ys[i], L.cardW, L.cardH,
                () => this._startStage(act.id, i),
                { draw: (ctx, btn, hovered) => this._drawStageCard(ctx, btn, hovered, act, i) });
        });

        const n = act.id;
        if (this.progress.isGatePlayable(n)) {
            this.ui.addButton('gate', `⚡ BREACH GATE ${n} → ACT ${n + 1}`, W / 2, L.buttonY, 320, 46,
                () => this._tryStartGate(n),
                { color: '#f59e0b' });
            // The gate node at the end of the track is a tap target too.
            this.ui.addButton('gate-node', '', L.gate.x, L.gate.y, 56, 56,
                () => this._tryStartGate(n), { hidden: true, focusable: false });
        } else if (this.progress.isActComplete(n) && this.progress.isActUnlocked(n + 1)) {
            this.ui.addButton('next', `NEXT: ACT ${n + 1} →`, W / 2, L.buttonY, 240, 42,
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
        const v = this._stageView(act, i);
        const stage = act.stages[i];
        const actColor = getLevelTheme(act.themeId).zoneColor;
        const status = v.status;
        const left = btn.x - btn.w / 2;
        const top = btn.y - btn.h / 2;

        const time = UITheme.reducedMotion ? 0 : (this.bgTime || 0);   // frozen with reduced motion

        ctx.save();
        if (status === 'locked') ctx.globalAlpha = 0.6;
        if (status === 'next') {
            ctx.translate(btn.x, btn.y);
            ctx.scale(1.06, 1.06);
            ctx.translate(-btn.x, -btn.y);
        }

        if (status === 'cleared') {
            UITheme.panel(ctx, left, top, btn.w, btn.h, {
                chamfer: 12,
                stroke: UITheme.color.ok,
                lineWidth: hovered ? 2 : 1.4,
                fill: hovered ? UITheme.color.panelHi : UITheme.color.panel,
                glow: hovered ? UITheme.color.ok : null
            });
        } else if (status === 'next') {
            UITheme.panel(ctx, left, top, btn.w, btn.h, {
                chamfer: 12,
                stroke: actColor,
                lineWidth: 2.2,
                fill: UITheme.color.panelHi,
                glow: actColor
            });
            ctx.save();
            UITheme.chamferPath(ctx, left - 4, top - 4, btn.w + 8, btn.h + 8, 12);
            ctx.strokeStyle = actColor;
            ctx.lineWidth = 1.2;
            ctx.globalAlpha = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(time * 3));
            ctx.stroke();
            ctx.restore();
        } else {
            UITheme.panel(ctx, left, top, btn.w, btn.h, {
                chamfer: 12,
                stroke: UITheme.color.locked,
                lineWidth: 1.2,
                dashed: true
            });
        }

        if (status === 'locked') {
            const seed = Math.floor(time * 6) * 7 + i * 13;
            const h = k => Math.abs((Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453) % 1);
            ctx.save();
            ctx.beginPath();
            ctx.rect(left, top, btn.w, btn.h);
            ctx.clip();
            ctx.strokeStyle = UITheme.color.textMute;
            ctx.globalAlpha *= 0.25;
            ctx.lineWidth = 1;
            for (let k = 0; k < 5; k++) {
                const y = top + 16 + h(k) * (btn.h - 40);
                const len = 20 + h(k + 1) * 40;
                const x = left + (btn.w - len) / 2;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x + len, y);
                ctx.stroke();
            }
            ctx.restore();
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';

        UITheme.tierBadge(ctx, btn.x, top + 30, stage.tier, 26, { dim: status === 'locked' });

        ctx.font = '700 17px Orbitron';
        ctx.fillStyle = status === 'cleared' ? UITheme.color.ok : status === 'next' ? actColor : UITheme.color.textMute;
        ctx.fillText(this.ui._fitText(stage.tier, btn.w - 16), btn.x, top + 72);

        ctx.font = UITheme.font('body', 600);
        ctx.fillStyle = UITheme.color.textDim;
        ctx.fillText(this.ui._fitText(this._stageSummary(act, stage), btn.w - 16), btn.x, top + 98);

        ctx.font = UITheme.font('label', 700);
        if (status === 'cleared') {
            // Best stars of this stage (a cleared stage has at least one).
            UITheme.starRow(ctx, btn.x, top + 119, this.progress.stageStars(act.id, i), 9, 24);
        } else if (status === 'next') {
            ctx.fillStyle = actColor;
            ctx.fillText('NEXT ▸', btn.x, top + 124);
        } else {
            ctx.fillStyle = UITheme.color.textDim;
            ctx.textAlign = 'left';
            const label = 'LOCKED';
            const textW = ctx.measureText(label).width || 50;
            const glyphX = btn.x - (textW + 16) / 2;
            this.ui._drawLockGlyph(ctx, glyphX, top + 115, 11, UITheme.color.textDim);
            ctx.fillText(label, glyphX + 16, top + 124);
            ctx.textAlign = 'center';
        }

        const best = this.progress.stage(act.id, i).best;
        if (best > 0) {
            ctx.font = UITheme.font('label', 500);
            ctx.fillStyle = UITheme.color.locked;
            ctx.fillText('BEST ' + best, btn.x, top + 142);
        }

        if (status === 'next' && v.unlock !== null) {
            const flashAlpha = 0.35 * (1 - v.unlock);
            UITheme.chamferPath(ctx, left, top, btn.w, btn.h, 12);
            ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
            ctx.fill();
            const glyphY = top + 40 - 40 * v.unlock;
            ctx.globalAlpha = 1 - v.unlock;
            ctx.translate(btn.x, glyphY + 9);
            ctx.rotate(0.6 * v.unlock);
            ctx.translate(-btn.x, -(glyphY + 9));
            this.ui._drawLockGlyph(ctx, btn.x - 9, glyphY, 18, actColor);
        }

        ctx.restore();
    }

    _renderActScreen(ctx) {
        const W = VIEW.W;
        const act = this.progress.act(this._actView);
        if (!act) return;
        const theme = getLevelTheme(act.themeId);
        const game = GameRegistry.get(act.game);

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = theme.zoneColor;
        ctx.font = '700 14px Orbitron';
        ctx.fillText(`ACT ${act.id}${game ? ' · ' + game.title : ''}`, W / 2, 34);
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '700 26px Orbitron';
        ctx.fillText(act.key, W / 2, 68);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '400 16px Rajdhani';
        ctx.fillText(act.story, W / 2, 98);
        if (act.controls) {
            ctx.fillStyle = '#64748b';
            ctx.font = '500 16px Rajdhani';
            ctx.fillText(act.controls, W / 2, 124);
        }

        const L = this._actScreenLayout(act.stages.length, this._actHasGate(act.id));
        this._drawStageTrack(ctx, act, L, theme.zoneColor);

        const c = this._clearanceUp;
        if (c && c.actId === act.id && c.t >= 0) {
            this._drawClearanceBanner(ctx, W / 2, L.statusY - 4, c, UITheme.layerOf(act.id).color);
        } else {
            const done = this.progress.stagesDone(act.id);
            ctx.fillStyle = done === act.stages.length ? '#22c55e' : '#64748b';
            ctx.font = '600 16px Rajdhani';
            ctx.fillText(done === act.stages.length ? 'ACT COMPLETE' : `${done}/${act.stages.length} STAGES CLEARED`, W / 2, L.statusY);
        }
        ctx.restore();
    }

    /** "CLEARANCE GRANTED · L4 OPERATOR": pops in, holds, fades out. */
    _drawClearanceBanner(ctx, cx, cy, c, color) {
        const t = c.t, end = GameManager.CLEARANCE_SHOW;
        const pop = UITheme.reducedMotion ? 1 : Utils.easeOutQuad(Utils.clamp(t / 0.25, 0, 1));
        const w = 440, h = 50;
        ctx.save();
        ctx.globalAlpha = Utils.clamp((end - t) / 0.4, 0, 1);
        ctx.translate(cx, cy);
        ctx.scale(0.85 + 0.15 * pop, 0.85 + 0.15 * pop);
        UITheme.panel(ctx, -w / 2, -h / 2, w, h, { chamfer: 12, stroke: color, lineWidth: 2, fill: UITheme.color.panelHi, glow: color });
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = UITheme.color.textDim;
        ctx.font = UITheme.font('label', 700);
        ctx.fillText('CLEARANCE GRANTED', 0, -11);
        ctx.fillStyle = color;
        ctx.font = UITheme.font('title', 700, 'Orbitron');
        ctx.fillText(UITheme.clearanceLabel(c.level), 0, 11);
        ctx.restore();
    }

    /** Circuit track under the ladder: dashed base, act-coloured fill, nodes, gate. */
    _drawStageTrack(ctx, act, L, color) {
        const n = act.stages.length;
        const segs = L.gate ? n : n - 1;
        // Segment k: from node k, along its track line, step up mid-gap, on to the next node.
        const points = (k) => {
            const x1 = L.xs[k], y1 = L.trackYs[k];
            const x2 = k + 1 < n ? L.xs[k + 1] : L.gate.x - L.gate.r;
            const y2 = k + 1 < n ? L.trackYs[k + 1] : L.gate.y;
            const mx = k + 1 < n ? (x1 + x2) / 2 : x1 + L.cardW / 2 + 13;
            return [[x1, y1], [mx, y1], [mx, y2], [x2, y2]];
        };
        const polyline = (pts, share) => {
            let total = 0;
            for (let j = 1; j < pts.length; j++) total += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]);
            let left = total * share;
            ctx.beginPath();
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (let j = 1; j < pts.length && left > 0; j++) {
                const dx = pts[j][0] - pts[j - 1][0], dy = pts[j][1] - pts[j - 1][1];
                const len = Math.hypot(dx, dy);
                const f = Math.min(1, left / len);
                ctx.lineTo(pts[j - 1][0] + dx * f, pts[j - 1][1] + dy * f);
                left -= len;
            }
            ctx.stroke();
        };

        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        for (let k = 0; k < segs; k++) {
            const pts = points(k);
            ctx.strokeStyle = UITheme.color.line;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 6]);
            polyline(pts, 1);
            ctx.setLineDash([]);
            const fill = this._ladderFill(act, k);
            if (fill > 0) {
                ctx.strokeStyle = color;
                ctx.lineWidth = 3;
                polyline(pts, fill);
            }
        }

        // Card stems and nodes: lit once the stage is reachable.
        for (let i = 0; i < n; i++) {
            const view = this._stageView(act, i);
            const lit = view.status !== 'locked';
            const x = L.xs[i], y = L.trackYs[i];
            ctx.strokeStyle = lit ? color : UITheme.color.line;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, L.ys[i] + L.cardH / 2);
            ctx.lineTo(x, y - 6);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, Math.PI * 2);
            ctx.fillStyle = view.status === 'cleared' ? color : UITheme.color.panel;
            ctx.fill();
            ctx.strokeStyle = lit ? color : UITheme.color.locked;
            ctx.stroke();
        }

        // Gate node at the end, drawn by the map's gate painter (scaled up).
        if (L.gate) {
            const btn = this.ui.buttons.find(b => b.id === 'gate-node' || b.id === 'gate');
            ctx.save();
            ctx.translate(L.gate.x, L.gate.y);
            ctx.scale(L.gate.r / 16, L.gate.r / 16);
            this._drawGateNode(ctx, { x: 0, y: 0, w: 32, h: 32 }, !!btn && this.ui.isHovered(btn), act.id);
            ctx.restore();
            ctx.fillStyle = UITheme.color.textMute;
            ctx.font = UITheme.font('label', 700);
            ctx.textAlign = 'center';
            ctx.fillText(`GATE ${act.id}`, L.gate.x, L.gate.y + L.gate.r + 20);
        }
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
        this._resultStars = null;
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
                    this._onStageCleared(m.score, 0, this._resultStars ? this._resultStars.n : 1);
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
    _onStageCleared(score, delayMs, stars = 1) {
        const S = this.state.STATES;
        const st = this._stage;
        if (!st) return;
        const firstClear = !this.progress.isStageCompleted(st.actId, st.index);
        const res = this.progress.completeStage(st.actId, st.index, score, stars);
        // First clear: the act screen plays the track fill + unlock once.
        const act = this.progress.act(st.actId);
        const opensNext = act && (st.index + 1 < act.stages.length || this._actHasGate(st.actId));
        this._ladderAnim = firstClear && opensNext && !UITheme.reducedMotion
            ? { actId: st.actId, seg: st.index, t: -GameManager.LADDER_DELAY, sound: false }
            : null;
        const later = (ms, fn) => (ms > 0 ? setTimeout(fn, ms) : fn());

        if (res.actCompleted && this.progress.isCampaignComplete() && !this.progress.congratsSeen) {
            later(delayMs, () => this.state.change(S.CONGRATS));
            return;
        }
        if (res.actCompleted) {
            // The HUB stamps SECURED on the act card the first time it shows it.
            this._securedAnim = UITheme.reducedMotion ? null : { actId: st.actId, t: null };
            // The act screen announces the new clearance once the track has filled.
            this._clearanceUp = {
                actId: st.actId,
                level: this.progress.clearanceLevel(),
                t: -(GameManager.LADDER_DELAY + GameManager.LADDER_FILL),
                sound: false
            };
            const n = st.actId;
            this._hubMessage = this.progress.isActAvailable(n + 1)
                ? `ACT ${n} COMPLETE — breach gate ${n} to reach ACT ${n + 1}`
                : `ACT ${n} COMPLETE — ACT ${n + 1} is in development`;
            this._hubMessageTimer = 3.5;
        }
        later(delayMs, () => this.state.change(S.ACT, { actId: st.actId }));
    }

    /** Stars for the stage just cleared, from the game's end-of-stage numbers. */
    _stageStars(source) {
        const st = this._stage;
        const act = st && this.progress.act(st.actId);
        if (!act) return 1;
        const revived = act.game === 'timingbar' ? this.levels.revivesUsed > 0 : this._stageRevives > 0;
        const stats = source && source.starStats ? source.starStats() : null;
        return CAMPAIGN.starsFor(act.game, act.stages[st.index].tier, stats, revived);
    }

    /** Start the result-star reveal for a cleared stage (`source` = game or LevelManager). */
    _beginResultStars(source) {
        const st = this._stage;
        const before = st ? this.progress.stageStars(st.actId, st.index) : 0;
        const n = this._stageStars(source);
        this._resultStars = { n, t: 0, newBest: before > 0 && n > before };
    }

    /** Advance the result reveal; the stamp and each lit star make a sound once. */
    _tickResultStars(dt) {
        const r = this._resultStars;
        if (!r) return;
        const before = r.t;
        r.t += dt;
        const crossed = (at) => before < at && r.t >= at;
        if (crossed(0.05)) Sound.playStamp();
        for (let k = 0; k < r.n; k++) {
            if (crossed(GameManager.STARS_FIRST + k * GameManager.STARS_STEP)) Sound.playStar(k);
        }
    }

    /**
     * Result panel: an ACCESS GRANTED stamp slams down, then three stars pop
     * in one by one (lit ones in gold). Reduced motion drops the slam and pops.
     */
    _drawResultStars(ctx, cx, cy) {
        const r = this._resultStars;
        if (!r) return;
        const calm = UITheme.reducedMotion;
        const w = 260, h = 104;
        ctx.save();
        ctx.globalAlpha = Utils.clamp(r.t / 0.15, 0, 1);
        UITheme.panel(ctx, cx - w / 2, cy - h / 2, w, h, { chamfer: 12, stroke: '#facc15', fill: UITheme.color.panelHi });
        ctx.restore();

        // Stamp: drops from 1.8x to 1x over 0.12 s, with a small rotation.
        const s = calm ? 1 : 1 + 0.8 * (1 - Utils.clamp(r.t / 0.12, 0, 1));
        ctx.save();
        ctx.globalAlpha = calm ? 1 : Utils.clamp(r.t / 0.08, 0, 1);
        ctx.translate(cx, cy - 26);
        ctx.rotate(-0.05);
        ctx.scale(s, s);
        ctx.strokeStyle = UITheme.color.ok;
        ctx.lineWidth = 2;
        ctx.strokeRect(-92, -14, 184, 28);
        ctx.fillStyle = UITheme.color.ok;
        ctx.font = '900 15px Orbitron';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('ACCESS GRANTED', 0, 1);
        ctx.restore();

        for (let k = 0; k < 3; k++) {
            const x = cx + (k - 1) * 56, y = cy + 14;
            const local = r.t - GameManager.STARS_FIRST - k * GameManager.STARS_STEP;
            if (local < 0) {
                UITheme.star(ctx, x, y, 17, false);
                continue;
            }
            // Pop: overshoot then settle.
            const p = Utils.clamp(local / 0.2, 0, 1);
            const scale = k < r.n && !calm ? 1 + 0.35 * Math.sin(p * Math.PI) : 1;
            UITheme.star(ctx, x, y, 17 * scale, k < r.n);
        }
        if (r.newBest && r.t > GameManager.STARS_FIRST + 3 * GameManager.STARS_STEP) {
            ctx.save();
            ctx.fillStyle = '#facc15';
            ctx.font = UITheme.font('label', 700, 'Orbitron');
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('NEW BEST', cx, cy + 40);
            ctx.restore();
        }
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
            onWheel: (delta) => this._handleWheel(delta),
            onDragStart: (x, y) => this._mapDragStart(x, y),
            onDragMove: (x) => this._mapDragMove(x),
            onDragEnd: (x, y, tap) => this._mapDragEnd(tap)
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
        const nav = [S.MENU, S.HUB, S.ACT, S.ENDLESS_HUB, S.GAME_OVER, S.ENDLESS_OVER, S.CONGRATS, S.LEADERBOARD];
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
                if (this._isEndlessSlot(this._mapIndex)) this.state.change(S.ENDLESS_HUB);
                else this._openMapAct(this.progress.acts[this._mapIndex]);
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
            d.y += d.speed * dt * (1 + 0.35 * (this._bgLayer || 0));   // deeper layers run faster

            // Reset position to top with a random character when it drops below the screen
            if (d.y > 660) {
                d.y = Utils.randFloat(-60, -10);
                d.x = Utils.randFloat(0, 960);
                d.char = chars[Utils.randInt(0, chars.length - 1)];
            }
        }
    }

    /** Layer index (0 PERIMETER, 1 INTERNAL, 2 CORE) the background should show. */
    _bgLayerTarget() {
        const S = this.state.STATES;
        const st = this.state.currentState;
        if (st === S.MENU || st === S.ENDLESS || st === S.ENDLESS_OVER || st === S.LEADERBOARD || st === S.CONGRATS) return 0;
        const n = this.progress.acts.length;
        const actId = st === S.HUB
            ? Math.max(0, Math.min(n - 1, Math.round(this._mapScroll || 0))) + 1
            : (this._actView || 1);
        return UITheme.layers.indexOf(UITheme.layerOf(actId));
    }

    /** Mirror the layer on <body> so the page around the canvas matches (CSS). */
    _syncPageLayer(i) {
        if (i === this._pageLayer) return;
        this._pageLayer = i;
        if (typeof document !== 'undefined' && document.body && document.body.dataset) {
            document.body.dataset.layer = UITheme.layers[i].key.toLowerCase();
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

        // Network layer tint, blended between neighbouring layers while it eases.
        const layers = UITheme.layers;
        const f = Utils.clamp(this._bgLayer || 0, 0, layers.length - 1);
        const i0 = Math.floor(f), i1 = Math.min(layers.length - 1, i0 + 1);
        const tint = UITheme.mix(layers[i0].color, layers[i1].color, f - i0);
        const glow = ctx.createRadialGradient(W / 2, H * 1.15, 0, W / 2, H * 1.15, H);
        glow.addColorStop(0, UITheme.rgba(tint, 0.14));
        glow.addColorStop(1, UITheme.rgba(tint, 0));
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, H);

        // Parallax: layers further back move less (set by the HUB carousel).
        const shift = this._bgShift || 0;
        const wrap = (x) => ((x % W) + W) % W;

        // 2. Grid — CG: Coordinate system visualization
        ctx.save();
        ctx.strokeStyle = UITheme.rgba(tint, 0.07);
        ctx.lineWidth = 0.5;
        const gridSize = 60;
        for (let x = ((shift % gridSize) + gridSize) % gridSize; x <= W; x += gridSize) {
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
            ctx.fillStyle = UITheme.rgba(tint, 1);
            ctx.font = d.size + 'px monospace';
            ctx.fillText(d.char, wrap(d.x + shift * 0.6), d.y);
        }
        ctx.restore();

        // 4. Floating particles — CG: Particle system + smooth animation
        ctx.save();
        for (const p of this.bgParticles) {
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = '#e2e8f0';
            ctx.beginPath();
            ctx.arc(wrap(p.x + shift * 0.3), p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // 5. CORE (layer 2) only: faint scanlines and a slow interference band.
        const core = Utils.clamp(1 - Math.abs(f - 2), 0, 1);
        if (core > 0 && !UITheme.reducedMotion) {
            ctx.save();
            ctx.globalAlpha = 0.05 * core;
            ctx.fillStyle = '#000';
            for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
            ctx.globalAlpha = 0.05 * core;
            ctx.fillStyle = UITheme.rgba(tint, 1);
            ctx.fillRect(0, ((this.bgTime || 0) * 40) % (H + 40) - 20, W, 14);
            ctx.restore();
        }
    }
}

// Act screen unlock effect (seconds): the track fills to the next card,
// then its lock breaks. Starts after a short wait for the screen fade.
GameManager.LADDER_DELAY = 0.35;
GameManager.LADDER_FILL = 0.6;
GameManager.LADDER_BURST = 0.5;
// Result stars: first star pops after STARS_FIRST s, then one every STARS_STEP;
// a cleared minigame stage stays on screen for STARS_HOLD s.
GameManager.STARS_FIRST = 0.3;
GameManager.STARS_STEP = 0.25;
GameManager.STARS_HOLD = 2.0;
// How long the act screen shows "CLEARANCE GRANTED" after an act is cleared.
GameManager.CLEARANCE_SHOW = 2.6;

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
