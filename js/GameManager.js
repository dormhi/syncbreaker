/* =========================================
   GameManager.js — Ana Oyun Yöneticisi
   Tüm state handler'ları ve koordinasyon
   ========================================= */

class GameManager {
    constructor(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;

        // Alt sistemler
        this.state = new StateManager();
        this.energy = new EnergySystem();
        this.ui = new UIManager(ctx, canvas);
        this.lockpick = new LockpickSystem();
        this.levels = new LevelManager();

        // Arka plan efektleri — CG: Animation + Rendering
        this.bgTime = 0;
        this.bgParticles = this._createBgParticles(35);
        this.dataRain = this._createDataRain(20);

        // State handler'ları kaydet
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

        // Temizle
        ctx.clearRect(0, 0, W, H);

        // Arkaplan — CG: Gradient rendering
        this._renderBackground(ctx, W, H);

        // State render
        this.state.render(ctx);
    }

    // ════════════════════════════════════════
    //  STATE HANDLER KAYITLARI
    // ════════════════════════════════════════

    _registerStates() {
        const S = this.state.STATES;

        // ── MENU ──
        this.state.register(S.MENU, {
            enter: () => {
                this.ui.clearButtons();
                const cx = this.canvas.width / 2;
                this.ui.addButton('start', '▶  GÖREVE BAŞLA', cx, 520, 240, 48,
                    () => this.state.change(S.HUB));
            },
            render: (ctx) => {
                const W = this.canvas.width;
                const H = this.canvas.height;
                const cx = W / 2;

                // Başlık
                ctx.fillStyle = '#e2e8f0';
                ctx.font = '900 40px Orbitron';
                ctx.textAlign = 'center';
                ctx.fillText('SYNCBREAKER', cx, 70);

                // Alt başlık
                ctx.fillStyle = '#ef4444';
                ctx.font = '600 15px Rajdhani';
                ctx.fillText('⚠ SİBER SAVUNMA PROTOKOLÜ ⚠', cx, 100);

                // Hikaye paneli
                const panelX = cx - 320;
                const panelY = 130;
                const panelW = 640;
                const panelH = 350;

                // Panel arka plan
                ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
                ctx.strokeStyle = '#1e293b';
                ctx.lineWidth = 1;
                Utils.roundRect(ctx, panelX, panelY, panelW, panelH, 8);
                ctx.fill();
                ctx.stroke();

                // Terminal başlığı
                ctx.fillStyle = '#ef4444';
                ctx.font = '700 14px Orbitron';
                ctx.textAlign = 'left';
                ctx.fillText('> DURUM RAPORU', panelX + 20, panelY + 30);

                // Terminal çizgisi
                ctx.strokeStyle = '#1e293b';
                ctx.beginPath();
                ctx.moveTo(panelX + 15, panelY + 42);
                ctx.lineTo(panelX + panelW - 15, panelY + 42);
                ctx.stroke();

                // Hikaye metni
                const lines = [
                    { text: '[UYARI] Sisteminiz siber saldırı altında!', color: '#ef4444', bold: true },
                    { text: '', color: '' },
                    { text: 'Kimliği belirsiz bir saldırgan, ağ altyapınıza sızdı.', color: '#e2e8f0' },
                    { text: 'Kritik sistem dosyalarına zararlı kod enjekte edildi.', color: '#e2e8f0' },
                    { text: 'Saldırgan hâlâ sistemde aktif ve yayılmaya devam ediyor.', color: '#f59e0b' },
                    { text: '', color: '' },
                    { text: '> GÖREVİNİZ:', color: '#3b82f6', bold: true },
                    { text: 'Her bir enfekte düğüme erişin ve zararlı veriyi temizleyin.', color: '#e2e8f0' },
                    { text: 'Kilitli düğümlere erişmek için şifre kırıcıyı (lockpick) kullanın.', color: '#e2e8f0' },
                    { text: 'Başarısız olursanız, kurtarma protokolünü devreye alabilirsiniz.', color: '#e2e8f0' },
                    { text: '', color: '' },
                    { text: '> DİKKAT: Enerji kaynakları sınırlı. Her operasyon hak tüketir.', color: '#f59e0b' },
                    { text: '  Sistemi tamamen temizlemeden durmayin!', color: '#64748b' },
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

                // Versiyon
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

        // ── HUB (Level Seçimi) ──
        this.state.register(S.HUB, {
            enter: () => {
                this.ui.clearButtons();
                this._buildHubButtons();
            },
            render: (ctx) => {
                const W = this.canvas.width;
                const H = this.canvas.height;

                // Başlık
                ctx.fillStyle = '#e2e8f0';
                ctx.font = '700 22px Orbitron';
                ctx.textAlign = 'center';
                ctx.fillText('ENFEKTe DÜĞÜMLER', W / 2, 38);

                ctx.fillStyle = '#64748b';
                ctx.font = '400 13px Rajdhani';
                ctx.fillText('Temizlenecek sistem düğümlerini seçin', W / 2, 58);

                // Enerji
                this.ui.renderEnergyBar({
                    current: this.energy.currentEnergy,
                    max: this.energy.maxEnergy,
                    nextRegenIn: this.energy.getTimeToNextRegen()
                });

                // Ağ topolojisi bağlantıları — CG: Line rendering
                this._renderHubConnections(ctx);

                // Butonlar
                this.ui.renderButtons();

                // Alt bilgi
                ctx.fillStyle = '#475569';
                ctx.font = '400 13px Rajdhani';
                ctx.textAlign = 'center';
                ctx.fillText('🔒 Kilitli düğümlere erişmek için şifre kırıcı kullan (2 enerji)', W / 2, H - 16);
            },
            exit: () => this.ui.clearButtons(),
            onKey: (e) => {
                if (e.code === 'Escape') this.state.change(S.MENU);
            }
        });

        // ── LEVEL (Gameplay) ──
        this.state.register(S.LEVEL, {
            enter: () => this.ui.clearButtons(),
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
                    ctx.fillText('DÜĞÜM TEMİZLENDİ!', W / 2, H / 2 - 70);
                    ctx.fillStyle = '#64748b';
                    ctx.font = '500 18px Rajdhani';
                    ctx.fillText(`Skor: ${this.levels.score} | Max Combo: x${this.levels.maxCombo}`, W / 2, H / 2 - 35);
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
                const lCtx = context || {};
                this._lockpickReason = lCtx.reason || 'shortcut';
                this._lockpickLevelIndex = lCtx.levelIndex;
                this._lockpickScore = lCtx.score || 0;

                const diff = lCtx.difficulty || 1;
                this.lockpick.start(diff, (success) => {
                    if (success) {
                        if (this._lockpickReason === 'shortcut') {
                            // Level'ı aç
                            if (this._lockpickLevelIndex !== undefined) {
                                this.levels.levels[this._lockpickLevelIndex].unlocked = true;
                                this.levels._saveProgress();
                            }
                            this.state.change(S.HUB);
                        } else if (this._lockpickReason === 'revive') {
                            // Kaldığı yerden devam — 1 can ile
                            this.levels.lives = 1;
                            this.levels.levelFailed = false;
                            this.levels.usedRevive = true;
                            this.state.change(S.LEVEL);
                        }
                    } else {
                        if (this._lockpickReason === 'revive') {
                            this.state.change(S.GAME_OVER, {
                                levelIndex: this._lockpickLevelIndex,
                                score: this._lockpickScore,
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

                // Başlık
                const title = this._lockpickReason === 'revive' ? 'KURTARMA PROTOKOLÜ' : 'ŞİFRE KIRICI';
                const subtitle = this._lockpickReason === 'revive'
                    ? 'Bağlantıyı yeniden kurmak için şifreyi kır'
                    : 'Kilitli düğüme erişmek için güvenlik şifresini kır';
                ctx.fillStyle = '#f59e0b';
                ctx.font = '700 22px Orbitron';
                ctx.textAlign = 'center';
                ctx.fillText(title, W / 2, 40);
                ctx.fillStyle = '#64748b';
                ctx.font = '400 13px Rajdhani';
                ctx.fillText(subtitle, W / 2, 60);

                // Talimat
                ctx.fillStyle = '#64748b';
                ctx.font = '400 14px Rajdhani';
                const hint = this.lockpick.started
                    ? 'Cursor node\'a geldiğinde doğru ok tuşuna bas!'
                    : 'Başlamak için herhangi bir ok tuşuna (↑↓←→) veya WASD bas';
                ctx.fillText(hint, W / 2, 70);

                // Lockpick
                this.lockpick.render(ctx, W / 2, H / 2 + 10);

                // Enerji
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

                // Revive butonu: enerji varsa VE bu level'da henüz revive kullanmadıysa
                if (!this._noRevive && !this._usedRevive && this.energy.canAfford('REVIVE')) {
                    const level = this.levels.levels[this._goLevelIndex];
                    this.ui.addButton('revive', '🔄 KURTARMA PROTOKOLÜ (1⚡)', cx, cy + 30, 290, 42,
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

                // Tekrar dene
                this.ui.addButton('retry', '↻ YENİDEN DENE', cx, cy + 85, 200, 40,
                    () => {
                        this.levels.startLevel(this._goLevelIndex);
                        this.state.change(S.LEVEL);
                    },
                    { color: '#3b82f6' }
                );

                // Hub'a dön
                this.ui.addButton('hub', '← DÜĞÜM SEÇİMİ', cx, cy + 135, 200, 40,
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
                ctx.fillText('OPERASYON BAŞARISIZ', cx, cy - 60);

                ctx.fillStyle = '#64748b';
                ctx.font = '500 18px Rajdhani';
                ctx.fillText(`Skor: ${this._goScore}`, cx, cy - 25);

                if (this._noRevive) {
                    ctx.fillStyle = '#ef4444';
                    ctx.font = '400 14px Rajdhani';
                    ctx.fillText('Kurtarma protokolü başarısız oldu', cx, cy);
                } else if (this._usedRevive) {
                    ctx.fillStyle = '#f59e0b';
                    ctx.font = '400 14px Rajdhani';
                    ctx.fillText('Bu düğümde kurtarma hakkı zaten kullanıldı', cx, cy);
                }

                this.ui.renderButtons();
            },
            exit: () => this.ui.clearButtons(),
            onKey: (e) => {
                if (e.code === 'Escape') this.state.change(S.HUB);
            }
        });

        // İlk state'e gir
        const menuH = this.state._handlers[S.MENU];
        if (menuH) menuH.enter();
    }

    // ── HUB Butonları ──

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

        // Pozisyonları kaydet (topoloji çizgileri için)
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

        // Menüye dön
        this.ui.addButton('menu', '← MENÜ', 70, H - 35, 100, 32,
            () => this.state.change(this.state.STATES.MENU),
            { color: '#475569' }
        );
    }

    _renderHubConnections(ctx) {
        if (!this._hubPositions || this._hubPositions.length < 2) return;

        ctx.save();
        for (let i = 0; i < this._hubPositions.length - 1; i++) {
            const a = this._hubPositions[i];
            const b = this._hubPositions[i + 1];
            const completed = a.level.completed;

            // Çizgi rengi: tamamlanmış → yeşil, açık → mavi, kilitli → gri
            ctx.strokeStyle = completed ? 'rgba(34,197,94,0.3)' : 'rgba(71,85,105,0.15)';
            ctx.lineWidth = completed ? 2 : 1;

            // Bağlantı çizgisi (buton kenarından kenarına)
            ctx.beginPath();
            ctx.moveTo(a.x + a.w * 0.4, a.y);
            ctx.lineTo(b.x - b.w * 0.4, b.y);
            ctx.stroke();

            // Bağlantı noktası (ortada küçük dot)
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

        canvas.style.cursor = 'pointer';
    }

    // ════════════════════════════════════════
    //  ARKA PLAN EFEKTLERİ
    //  CG Kavramları: Animation, Transformation,
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
            // CG: Translation + trigonometric movement
            p.x += Math.cos(p.angle) * p.speed * dt;
            p.y += Math.sin(p.angle) * p.speed * dt;
            p.angle += Utils.randFloat(-0.3, 0.3) * dt;

            // Wrap around — CG: coordinate wrapping
            if (p.x < -5) p.x = 965;
            if (p.x > 965) p.x = -5;
            if (p.y < -5) p.y = 645;
            if (p.y > 645) p.y = -5;
        }
    }

    _updateDataRain(dt) {
        const chars = '01アイウエオカキクケコ⟡⟢⟣';
        for (const d of this.dataRain) {
            d.y += d.speed * dt;
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
