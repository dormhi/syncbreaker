/* =========================================
   StackOverflowMechanic.js — Physics bonus (Matter.js)

   A crane sweeps above the core. Press SPACE / tap to release the
   hanging stack frame; it falls under real rigid-body physics, keeps
   part of the crane's sideways momentum, and settles on the stack.

   - Build a STABLE tower up to the target line to win.
   - A frame that falls off the platform is lost (3 lives); a collapsing
     tower costs one life per frame that drops.
   - Crane speed rises with every frame placed.
   - Limited frame budget, so the run always ends.

   CRANE MOTION is analytic (x = cx + A * sin(phase(t))), like the
   timing bar: the release point never depends on the frame rate.
   Rendering and release both use renderTime() so the frame drops from
   exactly where the player saw it.

   Used as mission 5 (FIREWALL). SCORE = 100 per frame in the tower
   + 250 per life left + 50 per unused frame.

   MOBILE: the whole screen is the drop button (tap anywhere), and the
   HUD text is sized to stay legible when the 960x640 canvas is scaled
   down to a phone.

   LESSON (Coach, useCoach): the first stage opens with the goal line,
   the crane and one practice drop (a lost frame costs nothing there).
   Shown once (sb_coach_stack).
   ========================================= */

const _PhysicsMechanicBaseSO = (typeof PhysicsMechanic !== 'undefined') ? PhysicsMechanic : class {};

class StackOverflowMechanic extends _PhysicsMechanicBaseSO {
    constructor(options = {}) {
        // Sleeping lets settled frames stop jittering; contacts wake them.
        super(Object.assign({ gravity: 1100, enableSleeping: true }, options));
        this.rng = options.rng || Math.random;

        this.targetBlocks = options.targetBlocks || 7;
        this.maxDrops = options.maxDrops || 12;
        this.maxLives = options.lives || 3;

        this.blockH = 28;
        this.minBlockW = 82;
        this.maxBlockW = 116;

        // Crane
        this.craneAmp = 170;          // px either side of center
        this.baseOmega = options.baseOmega || 1.35; // rad/s at the start
        this.omegaStep = 0.07;        // +7% per placed frame
        this.momentumKeep = 0.3;      // share of crane velocity the frame keeps

        this.respawnDelay = 0.35;     // s after a landing before the next frame hangs
        this.settleSpeed = 18;        // px/s — below this a frame counts as at rest
        this.stableHold = 1.0;        // s the tower must stand above the line
        // Frames buried this deep under the top, once at rest, are frozen
        // (made static). Iterative solvers let tall box stacks creep and
        // collapse on their own; freezing keeps physics where the player
        // acts — the top of the tower — and stops phantom collapses.
        this.freezeDepth = options.freezeDepth !== undefined ? options.freezeDepth : 3;

        // Matter body settings for every frame.
        this.frameBody = Object.assign({
            friction: 0.9,
            frictionStatic: 1.2,
            restitution: 0,
            // No air drag: the fall is purely ballistic, so a player can
            // read the drift from the crane speed.
            frictionAir: 0,
            density: 0.002,
            chamfer: { radius: 3 }
        }, options.frameBody);
    }

    _rand(min, max) { return min + this.rng() * (max - min); }

    _setupBodies(context = {}) {
        const M = this.world.M;
        this.width = context.width || 960;
        this.height = context.height || 640;

        const W = this.width, H = this.height;
        this.cx = W / 2;
        this.platformW = 210;
        this.platformTop = H - 96;
        this.railY = 112;
        this.hookY = 150;
        this.targetY = this.platformTop - this.targetBlocks * this.blockH;
        // Contacts sink a fraction of a pixel, so exactly `targetBlocks`
        // frames would otherwise fall just short of the line.
        this.targetTolerance = 4;

        this.ground = this.world.addBody(M.Bodies.rectangle(
            this.cx, this.platformTop + 12, this.platformW, 24,
            { isStatic: true, friction: 1, label: 'ground' }
        ));

        this.lives = this.maxLives;
        this.lost = 0;
        this.drops = 0;
        this.placed = [];       // [{ body, w, h, tag }]
        this.falling = null;    // { body, w, h, tag, landedAt }
        this.hanging = null;    // { w, h, tag } while aiming
        this.respawnTimer = 0;
        this.stableTimer = 0;
        this.score = 0;
        this.flash = 0;

        // Crane phase is integrated so speed changes never make it jump.
        this._phase = this.rng() * Math.PI * 2;
        this._phaseAt = 0;      // simulation time of _phase
        this.omega = this.baseOmega;

        this.world.onCollision((a, b) => this._onContact(a, b));
        this._hangNext();

        this.coach = null;
        if (this.coachStore && this.firstStage && !this.coachStore.seen('tutorial') && typeof Coach !== 'undefined') {
            this.coach = new Coach(this.coachStore).push(
                { kind: 'info', rects: 'line', text: 'Rebuild the firewall: stack {n} blocks up to the STACK LIMIT line.', vars: { n: this.targetBlocks } },
                { kind: 'info', rects: 'crane', text: { desktop: 'The crane swings the next block. Press SPACE (or click) to drop it.', touch: 'The crane swings the next block. Tap anywhere to drop it.' } },
                { kind: 'drop', rects: 'crane', text: 'Drop your first block onto the platform.' },
                { kind: 'placed', text: 'Watch it fall: it keeps some of the crane\'s sideways swing.' },
                { kind: 'info', key: 'tutorial', text: 'Good! Let go a little EARLY so the swing carries the block over the tower. Reach the line and let the tower stand still for a moment.' }
            );
        }
    }

    /** Lesson on the first stage; the host passes a per-game store. */
    useCoach(store, firstStage) {
        this.coachStore = store || null;
        this.firstStage = !!firstStage;
    }

    update(dt) {
        // An info bubble freezes the scene (crane and physics).
        if (this.coach) {
            this.coach.update(dt || this.stepDt);
            if (!this.coach.active) this.coach = null;
            else if (this.coach.blocks) return;
        }
        super.update(dt);
    }

    render(ctx, W, H, gameTime, alpha = 1) {
        super.render(ctx, W, H, gameTime, alpha);
        if (!this.coach || !this.coach.active) return;
        const r = this.coach.step.rects;
        const rects = r === 'line' ? [{ x: this.cx - 300, y: this.targetY - 22, w: 600, h: 34 }]
            : r === 'crane' ? [{ x: this.cx - this.craneAmp - 70, y: this.railY - 10, w: 2 * this.craneAmp + 140, h: this.hookY - this.railY + this.blockH + 24 }] : [];
        this.coach.render(ctx, W, H, rects, { at: 'bottom' });
    }

    // ── Crane (analytic) ──

    _phaseAtTime(t) { return this._phase + this.omega * (t - this._phaseAt); }

    craneX(t) { return this.cx + this.craneAmp * Math.sin(this._phaseAtTime(t)); }

    craneVX(t) { return this.craneAmp * this.omega * Math.cos(this._phaseAtTime(t)); }

    _setOmega(omega) {
        // Re-anchor the phase at "now" so position stays continuous.
        this._phase = this._phaseAtTime(this.time);
        this._phaseAt = this.time;
        this.omega = omega;
    }

    // ── Frames ──

    _hangNext() {
        if (this.drops >= this.maxDrops) { this.hanging = null; return; }
        const w = Math.round(this._rand(this.minBlockW, this.maxBlockW));
        const tag = '0x' + (0x7f00 + Math.floor(this.rng() * 0xff)).toString(16).toUpperCase();
        this.hanging = { w, h: this.blockH, tag };
    }

    get canDrop() {
        return this.result === null && this.hanging !== null && this.falling === null;
    }

    /**
     * Release the hanging frame. `inputOffset` is how far past the last
     * simulated step the press happened (s); the frame drops from the
     * crane position that was on screen at that moment.
     */
    drop(inputOffset = 0) {
        if (this.coach && this.coach.blocks) { this.coach.next(); return false; }
        if (!this.canDrop) return false;
        const M = this.world.M;
        const off = Math.max(0, Math.min(this.stepDt, inputOffset || 0));
        const t = this.time - this.stepDt + off;

        const { w, h, tag } = this.hanging;
        const x = this.craneX(t);
        const body = M.Bodies.rectangle(x, this.hookY + h / 2, w, h,
            Object.assign({ label: 'frame' }, this.frameBody));
        this.world.addBody(body);
        this.world.setVelocity(body, this.craneVX(t) * this.momentumKeep, 0);

        this.falling = { body, w, h, tag, landedAt: null };
        this.hanging = null;
        this.drops++;
        this.releaseX = x;
        if (this.coach) this.coach.event('drop');
        return true;
    }

    _onContact(a, b) {
        const f = this.falling;
        if (!f || f.landedAt !== null) return;
        const other = a === f.body ? b : (b === f.body ? a : null);
        if (!other) return;
        if (other === this.ground || this.placed.some(p => p.body === other)) {
            f.landedAt = this.time;
        }
    }

    // ── Rules ──

    _isOut(body) {
        return body.position.y > this.platformTop + 60 ||
            body.position.x < -80 || body.position.x > this.width + 80;
    }

    _loseFrame(entry) {
        this.world.removeBody(entry.body);
        if (this.coach) {
            // Lesson: a lost frame is handed back, no life lost.
            this.drops--;
            if (this.coach.step && this.coach.step.kind === 'placed') this.coach.step = { kind: 'drop', rects: 'crane', text: 'It fell off — no harm in the lesson. Try again: drop it onto the platform.' };
            return;
        }
        this.lives--;
        this.lost++;
        this.flash = 0.35;
        if (typeof Sound !== 'undefined' && Sound.playMiss) Sound.playMiss();
    }

    /** Top edge (smallest y) of the settled tower, or platformTop if empty. */
    towerTop() {
        let top = this.platformTop;
        for (const p of this.placed) top = Math.min(top, p.body.bounds.min.y);
        return top;
    }

    /**
     * End-of-stage numbers for the star rules: frames lost and alignment
     * (1 = every frame centred on the one below, 0 = half a frame off).
     */
    starStats() {
        let off = 0;
        this.placed.forEach((p, i) => {
            const below = i === 0 ? this.cx : this.placed[i - 1].body.position.x;
            off += Math.min(1, Math.abs(p.body.position.x - below) / (p.w / 2));
        });
        return { lost: this.lost, align: this.placed.length ? 1 - off / this.placed.length : 0 };
    }

    computeScore() {
        return this.placed.length * 100 + this.lives * 250 + (this.maxDrops - this.drops) * 50;
    }

    hasReachedTarget() {
        return this.towerTop() <= this.targetY + this.targetTolerance;
    }

    _towerAtRest() {
        return this.placed.every(p => this.world.speedOf(p.body) < this.settleSpeed);
    }

    _freezeBuried() {
        if (this.freezeDepth <= 0 || this.falling) return;
        const M = this.world.M;
        const n = this.placed.length - this.freezeDepth;
        for (let i = 0; i < n; i++) {
            const b = this.placed[i].body;
            if (!b.isStatic && this.world.speedOf(b) < this.settleSpeed) M.Body.setStatic(b, true);
        }
    }

    _evaluate(dt) {
        if (this.flash > 0) this.flash -= dt;

        // Frames that left the play area (dropped off or toppled).
        for (let i = this.placed.length - 1; i >= 0; i--) {
            if (this._isOut(this.placed[i].body)) {
                this._loseFrame(this.placed[i]);
                this.placed.splice(i, 1);
            }
        }
        const f = this.falling;
        if (f && this._isOut(f.body)) {
            this._loseFrame(f);
            this.falling = null;
            this.respawnTimer = this.respawnDelay;
        }
        if (this.lives <= 0) { this.result = 'fail'; return; }

        // A landed frame joins the tower once it has come to rest (or after
        // a short grace period, so a rocking frame can't stall the crane).
        if (f && this.falling && f.landedAt !== null) {
            const rested = this.world.speedOf(f.body) < this.settleSpeed;
            if (rested || this.time - f.landedAt > 0.6) {
                this.placed.push(f);
                if (this.coach) this.coach.event('placed');
                this.falling = null;
                this.respawnTimer = this.respawnDelay;
                this._setOmega(this.baseOmega * (1 + this.omegaStep * this.placed.length));
                if (typeof Sound !== 'undefined' && Sound.playGood) Sound.playGood(StackOverflowMechanic.SOUND);
            }
        }

        this._freezeBuried();

        // Once the tower reaches the line, hold the next frame back so the
        // player isn't tempted to wreck a winning stack during the check.
        const reached = this.hasReachedTarget();
        if (!this.falling && !this.hanging && !reached) {
            if (this.respawnTimer > 0) this.respawnTimer -= dt;
            if (this.respawnTimer <= 0) this._hangNext();
        }

        // Win: the tower stands above the target line, at rest, for a while.
        if (!this.falling && reached && this._towerAtRest()) {
            this.stableTimer += dt;
            if (this.stableTimer >= this.stableHold) {
                this.result = 'success';
                this.score = this.computeScore();
                return;
            }
        } else {
            this.stableTimer = 0;
        }

        // Out of frames and nothing left in motion: the run is over.
        if (this.drops >= this.maxDrops && !this.falling && !this.hanging &&
            this._towerAtRest() && this.stableTimer === 0) {
            this._outOfFramesTimer = (this._outOfFramesTimer || 0) + dt;
            if (this._outOfFramesTimer >= 1.0) this.result = 'fail';
        } else {
            this._outOfFramesTimer = 0;
        }
    }

    // ── Input ──

    handleKey(code, inputOffset) {
        if (code === 'Space' || code === 'Enter') { this.drop(inputOffset); return true; }
        return false;
    }

    handleConfirm(inputOffset) { return this.drop(inputOffset); }

    handlePointer(x, y, phase, inputOffset) {
        if (phase && phase !== 'down') return false;
        this.drop(inputOffset);
        return true;
    }

    // ── Render ──

    _renderScene(ctx, W, H, alpha) {
        const t = this.renderTime(alpha);
        const cx = this.cx;

        ctx.save();

        // Target line
        const reached = this.hasReachedTarget();
        ctx.strokeStyle = reached ? 'rgba(34,197,94,0.8)' : 'rgba(245,158,11,0.55)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(cx - 300, this.targetY);
        ctx.lineTo(cx + 300, this.targetY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = reached ? '#22c55e' : '#f59e0b';
        ctx.font = '600 14px Orbitron, OrbitronTR';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText(UITheme.t('STACK LIMIT'), cx + 230, this.targetY - 4);

        // Crane rail
        ctx.strokeStyle = 'rgba(100,116,139,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - this.craneAmp - 40, this.railY);
        ctx.lineTo(cx + this.craneAmp + 40, this.railY);
        ctx.stroke();

        // Trolley + cable + hanging frame
        const hx = this.craneX(t);
        ctx.fillStyle = '#334155';
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 1.5;
        Utils.roundRect(ctx, hx - 16, this.railY - 8, 32, 16, 4);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(148,163,184,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hx, this.railY + 8);
        ctx.lineTo(hx, this.hookY);
        ctx.stroke();
        if (this.hanging) {
            const hb = this.hanging;
            ctx.save();
            ctx.translate(hx, this.hookY + hb.h / 2);
            this._drawFrame(ctx, hb.w, hb.h, hb.tag, '#f59e0b');
            ctx.restore();
        }

        // Platform (core)
        const g = this.world.interpolate(this.ground, alpha);
        ctx.fillStyle = 'rgba(59,130,246,0.18)';
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        Utils.roundRect(ctx, g.x - this.platformW / 2, g.y - 12, this.platformW, 24, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#3b82f6';
        ctx.font = '700 11px Orbitron, OrbitronTR';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('CORE', g.x, g.y + 1);

        // Frames (interpolated)
        for (const p of this.placed) {
            this.drawBox(ctx, p.body, p.w, p.h, alpha,
                (c, w, h) => this._drawFrame(c, w, h, p.tag, '#22c55e'));
        }
        if (this.falling) {
            const f = this.falling;
            this.drawBox(ctx, f.body, f.w, f.h, alpha,
                (c, w, h) => this._drawFrame(c, w, h, f.tag, '#f59e0b'));
        }

        ctx.restore();

        if (this.flash > 0) {
            ctx.save();
            ctx.globalAlpha = Math.min(1, this.flash / 0.35) * 0.18;
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        }

        this._renderHud(ctx, W, H);
    }

    _drawFrame(ctx, w, h, tag, color) {
        ctx.fillStyle = 'rgba(15,23,42,0.92)';
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        Utils.roundRect(ctx, -w / 2, -h / 2, w, h, 3);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.font = '700 15px Rajdhani';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tag, 0, 1);
    }

    _renderHud(ctx, W, H) {
        const y = H - 40;

        // Lives
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = '24px sans-serif';
        for (let i = 0; i < this.maxLives; i++) {
            ctx.fillStyle = i < this.lives ? '#ef4444' : 'rgba(239,68,68,0.2)';
            ctx.fillText('♥', W / 2 - 230 + i * 32, y);
        }

        // Height progress
        const barW = 160, barH = 8;
        const bx = W / 2 - barW / 2, by = y - 2;
        const span = this.platformTop - this.targetY;
        const frac = this.hasReachedTarget() ? 1
            : Math.max(0, Math.min(1, (this.platformTop - this.towerTop()) / span));
        ctx.fillStyle = '#1e293b';
        Utils.roundRect(ctx, bx, by, barW, barH, 2); ctx.fill();
        ctx.fillStyle = frac >= 1 ? '#22c55e' : '#f59e0b';
        Utils.roundRect(ctx, bx, by, barW * frac, barH, 2); ctx.fill();

        // Frames left
        ctx.fillStyle = '#94a3b8';
        ctx.font = '700 20px Rajdhani';
        ctx.textAlign = 'right';
        ctx.fillText(UITheme.t('FRAMES {n}', { n: this.maxDrops - this.drops }), W / 2 + 230, y);

        if (this.result !== null) {
            const ok = this.result === 'success';
            ctx.fillStyle = ok ? '#22c55e' : '#ef4444';
            ctx.font = '700 28px Orbitron, OrbitronTR';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(UITheme.t(ok ? 'FIREWALL STABLE' : 'STACK OVERFLOW'), W / 2, this.hookY + 70);
            if (ok) {
                ctx.fillStyle = '#94a3b8';
                ctx.font = '600 20px Rajdhani';
                ctx.fillText(UITheme.t('SCORE {n}', { n: this.score }), W / 2, this.hookY + 104);
            }
        }
    }
}

// Landing "thunk" voice for Sound.playGood(theme).
StackOverflowMechanic.SOUND = { soundFreq: 330, soundType: 'triangle' };

if (typeof module !== 'undefined' && module.exports) module.exports = StackOverflowMechanic;
