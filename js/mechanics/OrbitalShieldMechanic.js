/* =========================================
   OrbitalShieldMechanic.js — Act 3 · CLOSE_PORTS

   A core sits inside a ring of ports. Attack packets fly in from outside,
   each aimed at one port; the target port blinks first. The player snaps
   a shield between ports (←/→, A/D, or tap/click a port). A packet that
   hits the shielded port is blocked; otherwise it breaches (one life).
   Block `blocksNeeded` packets to win before the lives run out
   (lives come from the stage: 4/5/6/7 in the campaign).

   FAIRNESS
   - Attacks are planned by ARRIVAL time. Consecutive arrivals are spaced
     by a base gap plus a per-port cost for the distance the shield has to
     travel, so every packet is reachable.
   - Very hard: some packets switch to a NEIGHBOUR port early in flight
     (the new port blinks too), leaving enough time to react.

   Motion is analytic in simulation time (frame-rate independent); render
   uses renderTime() so the drawing matches the interpolated loop.

   LESSON (Coach, useCoach): the first stage opens with the ports, the
   shield, and practice until one packet is blocked (breaches cost
   nothing there). Shown once (sb_coach_orbital).
   ========================================= */

const _MechanicBaseOS = (typeof Mechanic !== 'undefined') ? Mechanic : class {};

class OrbitalShieldMechanic extends _MechanicBaseOS {
    constructor(options = {}) {
        super();
        this.rng = options.rng || Math.random;

        this.ports = options.ports || 4;
        this.speed = options.speed || 140;              // px/s inward
        this.blocksNeeded = options.blocksNeeded || 12;
        this.warn = options.warn !== undefined ? options.warn : 0.7;   // s of blink before launch
        this.gapMin = options.gapMin || 0.9;            // s between arrivals
        this.gapMax = options.gapMax || 1.3;
        this.stepCost = options.stepCost !== undefined ? options.stepCost : 0.12; // s per port of shield travel
        this.burstChance = options.burstChance || 0;    // chance an attack is a 3-packet burst
        this.burstGap = 0.26;
        this.switchChance = options.switchChance || 0;  // chance a packet hops to a neighbour port
        this.switchAt = 0.4;                            // fraction of the flight when it hops
        this.maxLives = options.lives || 3;

        this.resultDuration = 1.2;
        this.stepDt = 1 / 60;
    }

    _rand(min, max) { return min + this.rng() * (max - min); }

    init(context = {}) {
        this.active = true;
        this.result = null;
        this.width = context.width || 960;
        this.height = context.height || 640;
        this.cx = this.width / 2;
        this.cy = 330;
        this.ringR = 110;
        this.shieldR = 124;
        this.spawnR = 300;
        this.travel = (this.spawnR - this.shieldR) / this.speed;

        this.time = 0;
        this.lives = this.maxLives;
        this.blocked = 0;
        this.breaches = 0;
        this.score = 0;
        this.shieldPort = 0;
        this.shieldVis = this.portAngle(0);
        this.attacks = [];      // planned + in flight, ordered by arrival
        this.sparks = [];
        this.flash = 0;
        this._burstLeft = 0;
        this._lastPort = 0;
        this._lastArrive = 1.2; // first packet arrives after a short lead-in
        this._planAhead();

        this.coach = null;
        if (this.coachStore && this.firstStage && !this.coachStore.seen('tutorial') && typeof Coach !== 'undefined') {
            this.coach = new Coach(this.coachStore).push(
                { kind: 'info', rects: 'ring', text: 'Attack packets will fly in at these PORTS around the core.' },
                { kind: 'info', rects: 'ring', text: { desktop: 'Move your SHIELD to the port that BLINKS: click that port, or use ← →.', touch: 'Move your SHIELD to the port that BLINKS: tap that port.' } },
                { kind: 'block', rects: 'ring', text: 'Here they come — block one! Packets that get through cost nothing yet.' },
                { kind: 'info', key: 'tutorial', text: `Blocked! Stop ${this.blocksNeeded} packets to close the ports. From now on every packet that gets through costs a life.` }
            );
        }
    }

    /** Lesson on the first stage; the host passes a per-game store. */
    useCoach(store, firstStage) {
        this.coachStore = store || null;
        this.firstStage = !!firstStage;
    }

    /** Continue after a successful recovery: one life, fresh schedule. */
    revive() {
        this.lives = 1;
        this.result = null;
        this.active = true;
        this.attacks = [];
        this._burstLeft = 0;
        this._lastPort = this.shieldPort;
        this._lastArrive = this.time + 1.2;
        this._planAhead();
    }

    // ── Geometry ──

    portAngle(i) {
        return -Math.PI / 2 + (i % this.ports) * (Math.PI * 2 / this.ports);
    }

    portDistance(a, b) {
        const d = Math.abs(a - b) % this.ports;
        return Math.min(d, this.ports - d);
    }

    nearestPort(x, y) {
        const a = Math.atan2(y - this.cy, x - this.cx);
        const step = Math.PI * 2 / this.ports;
        return ((Math.round((a + Math.PI / 2) / step) % this.ports) + this.ports) % this.ports;
    }

    // ── Planning ──

    _planAhead() {
        while (this.attacks.length < 4) this._planNext();
    }

    _planNext() {
        let port, arrive;
        if (this._burstLeft > 0) {
            this._burstLeft--;
            port = this._lastPort;
            arrive = this._lastArrive + this.burstGap;
        } else {
            port = Math.floor(this.rng() * this.ports);
            const steps = this.portDistance(this._lastPort, port);
            arrive = this._lastArrive + this._rand(this.gapMin, this.gapMax) + this.stepCost * steps;
            if (this.burstChance > 0 && this.rng() < this.burstChance) this._burstLeft = 2;
        }

        // Never ask for a reaction that started in the past.
        const earliest = this.time + this.warn + this.travel + 0.05;
        if (arrive < earliest) arrive = earliest;

        const attack = {
            port, finalPort: port,
            arrive,
            launch: arrive - this.travel,
            warnAt: arrive - this.travel - this.warn,
            hop: null,
            done: false
        };

        // Very hard: hop to a neighbour early in flight (not inside a burst).
        if (this.switchChance > 0 && this._burstLeft === 0 && this.rng() < this.switchChance) {
            const dir = this.rng() < 0.5 ? -1 : 1;
            attack.finalPort = (port + dir + this.ports) % this.ports;
            attack.hop = { at: attack.launch + this.travel * this.switchAt, dur: 0.25 };
            // The shield may have to follow the hop: keep the next arrival reachable.
            arrive += this.stepCost;
        }

        this.attacks.push(attack);
        this._lastPort = attack.finalPort;
        this._lastArrive = Math.max(arrive, attack.arrive);
    }

    // ── Simulation ──

    update(dt) {
        if (!this.active) return;
        this.stepDt = dt || this.stepDt;
        // An info bubble freezes the scene.
        if (this.coach) {
            this.coach.update(this.stepDt);
            if (!this.coach.active) this.coach = null;
            else if (this.coach.blocks) return;
        }
        this.time += this.stepDt;
        const t = this.time;

        // Shield glides to its port (visual only; logic uses shieldPort).
        const target = this.portAngle(this.shieldPort);
        let d = target - this.shieldVis;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.shieldVis += d * Math.min(1, this.stepDt / 0.05);

        if (this.flash > 0) this.flash -= this.stepDt;
        for (let i = this.sparks.length - 1; i >= 0; i--) {
            const s = this.sparks[i];
            s.life -= this.stepDt * 2.2;
            s.x += s.vx * this.stepDt;
            s.y += s.vy * this.stepDt;
            if (s.life <= 0) this.sparks.splice(i, 1);
        }

        if (this.result !== null) return;

        for (const a of this.attacks) {
            if (a.done || t < a.arrive) continue;
            a.done = true;
            const pos = this._packetPos(a, a.arrive);
            if (this.shieldPort === a.finalPort) {
                this.blocked++;
                this._burst(pos.x, pos.y, '#f59e0b', 10);
                if (typeof Sound !== 'undefined' && Sound.playGood) Sound.playGood(OrbitalShieldMechanic.SOUND);
                if (this.coach) this.coach.event('block');
            } else if (this.coach) {
                // Lesson: a breach is only shown.
                this._burst(pos.x, pos.y, '#ef4444', 14);
                if (typeof Sound !== 'undefined' && Sound.playMiss) Sound.playMiss();
            } else {
                this.lives--;
                this.breaches++;
                this.flash = 0.35;
                this._burst(pos.x, pos.y, '#ef4444', 14);
                if (typeof Sound !== 'undefined' && Sound.playMiss) Sound.playMiss();
            }
            if (this.blocked >= this.blocksNeeded) {
                this.result = 'success';
                this.score = this.computeScore();
                return;
            }
            if (this.lives <= 0) {
                this.result = 'fail';
                return;
            }
        }
        this.attacks = this.attacks.filter(a => !a.done);
        this._planAhead();
    }

    /** End-of-stage numbers for the star rules. */
    starStats() {
        return { breaches: this.breaches };
    }

    computeScore() {
        return this.blocked * 100 + this.lives * 250;
    }

    _burst(x, y, color, n) {
        for (let i = 0; i < n; i++) {
            const a = this.rng() * Math.PI * 2;
            const v = this._rand(60, 180);
            this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color });
        }
    }

    /** Packet position at time t (analytic). */
    _packetPos(a, t) {
        const r = this.spawnR - this.speed * Math.max(0, t - a.launch);
        let ang = this.portAngle(a.port);
        if (a.hop && t > a.hop.at) {
            const k = Math.min(1, (t - a.hop.at) / a.hop.dur);
            let d = this.portAngle(a.finalPort) - ang;
            d = Math.atan2(Math.sin(d), Math.cos(d));
            ang += d * (k * k * (3 - 2 * k));
        }
        return { x: this.cx + Math.cos(ang) * r, y: this.cy + Math.sin(ang) * r, r, ang };
    }

    /** Ports blinking now: launching soon, or the new target of a hop. */
    _alertPorts(t) {
        const out = new Set();
        for (const a of this.attacks) {
            if (a.done) continue;
            if (t >= a.warnAt && t < a.arrive) out.add(a.hop && t >= a.hop.at ? a.finalPort : a.port);
        }
        return out;
    }

    // ── Input ──

    moveShield(dir) {
        if (this.result !== null) return false;
        this.shieldPort = (this.shieldPort + dir + this.ports) % this.ports;
        return true;
    }

    setShield(port) {
        if (this.result !== null) return false;
        this.shieldPort = ((port % this.ports) + this.ports) % this.ports;
        return true;
    }

    handleKey(code) {
        if (this.coach && this.coach.blocks) {
            if (code === 'Space' || code === 'Enter') this.coach.next();
            return true;
        }
        if (code === 'ArrowLeft' || code === 'KeyA') return this.moveShield(-1);
        if (code === 'ArrowRight' || code === 'KeyD') return this.moveShield(1);
        return false;
    }

    handlePointer(x, y, phase) {
        if (phase && phase !== 'down') return false;
        if (this.coach && this.coach.blocks) { this.coach.next(); return true; }
        if (Math.hypot(x - this.cx, y - this.cy) < 24) return true;
        return this.setShield(this.nearestPort(x, y));
    }

    // ── Render ──

    renderTime(alpha = 1) {
        return this.time - this.stepDt * (1 - Math.max(0, Math.min(1, alpha)));
    }

    render(ctx, W, H, gameTime, alpha = 1) {
        const t = this.renderTime(alpha);
        const cx = this.cx, cy = this.cy;
        const amber = '#f59e0b';
        const alerts = this._alertPorts(t);

        ctx.save();

        // Ring + core
        ctx.strokeStyle = 'rgba(245,158,11,0.25)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, this.ringR, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(15,23,42,0.95)';
        ctx.strokeStyle = 'rgba(59,130,246,0.6)';
        ctx.beginPath(); ctx.arc(cx, cy, 34, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#3b82f6';
        ctx.font = '700 11px Orbitron';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('CORE', cx, cy + 1);

        // Ports
        const blink = 0.5 + 0.5 * Math.sin(t * 18);
        for (let i = 0; i < this.ports; i++) {
            const a = this.portAngle(i);
            const px = cx + Math.cos(a) * this.ringR, py = cy + Math.sin(a) * this.ringR;
            const hot = alerts.has(i);
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(a);
            ctx.fillStyle = hot ? `rgba(239,68,68,${0.35 + 0.55 * blink})` : 'rgba(15,23,42,0.95)';
            ctx.strokeStyle = hot ? '#ef4444' : 'rgba(245,158,11,0.7)';
            ctx.lineWidth = 1.5;
            Utils.roundRect(ctx, -7, -11, 14, 22, 3);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }

        // Shield arc
        const half = Math.min(0.42, (Math.PI * 2 / this.ports) * 0.32);
        ctx.strokeStyle = amber;
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.shadowColor = amber;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(cx, cy, this.shieldR, this.shieldVis - half, this.shieldVis + half);
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Packets in flight (with a short trail)
        for (const a of this.attacks) {
            if (a.done || t < a.launch || t >= a.arrive) continue;
            const p = this._packetPos(a, t);
            const tail = this._packetPos(a, t - 0.06);
            ctx.strokeStyle = 'rgba(239,68,68,0.35)';
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(p.x, p.y); ctx.stroke();
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.ang + Math.PI / 4);
            ctx.fillStyle = a.hop ? '#f472b6' : '#ef4444';
            ctx.fillRect(-6, -6, 12, 12);
            ctx.restore();
        }

        // Sparks
        for (const s of this.sparks) {
            ctx.globalAlpha = Math.max(0, s.life);
            ctx.fillStyle = s.color;
            ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
        }
        ctx.globalAlpha = 1;
        ctx.restore();

        if (this.flash > 0) {
            ctx.save();
            ctx.globalAlpha = Math.min(1, this.flash / 0.35) * 0.16;
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        }

        this._renderHud(ctx, W, H);
        if (this.coach && this.coach.active) {
            const R = this.shieldR + 34;
            const rects = this.coach.step.rects === 'ring' ? [{ x: this.cx - R, y: this.cy - R, w: 2 * R, h: 2 * R }] : [];
            this.coach.render(ctx, W, H, rects, { at: 'top' });
        }
    }

    _renderHud(ctx, W, H) {
        const y = H - 40;
        ctx.save();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        // Hearts are right-aligned before the progress bar, so 4-7 lives
        // grow to the left instead of running into it.
        ctx.font = '22px sans-serif';
        const step = 27;
        const x0 = W / 2 - 104 - this.maxLives * step;
        for (let i = 0; i < this.maxLives; i++) {
            ctx.fillStyle = i < this.lives ? '#ef4444' : 'rgba(239,68,68,0.2)';
            ctx.fillText('♥', x0 + i * step, y);
        }

        const barW = 160, barH = 8;
        const bx = W / 2 - barW / 2, by = y - 4;
        const frac = Math.min(1, this.blocked / this.blocksNeeded);
        ctx.fillStyle = '#1e293b';
        Utils.roundRect(ctx, bx, by, barW, barH, 2); ctx.fill();
        ctx.fillStyle = frac >= 1 ? '#22c55e' : '#f59e0b';
        Utils.roundRect(ctx, bx, by, barW * frac, barH, 2); ctx.fill();

        ctx.fillStyle = '#94a3b8';
        ctx.font = '700 20px Rajdhani';
        ctx.textAlign = 'right';
        ctx.fillText(`BLOCKED ${this.blocked}/${this.blocksNeeded}`, W / 2 + 250, y);

        if (this.result !== null) {
            const ok = this.result === 'success';
            ctx.fillStyle = ok ? '#22c55e' : '#ef4444';
            ctx.font = '700 28px Orbitron';
            ctx.textAlign = 'center';
            ctx.fillText(ok ? 'PORTS SEALED' : 'PORT BREACHED', W / 2, this.cy - 190 + 60);
            if (ok) {
                ctx.fillStyle = '#94a3b8';
                ctx.font = '600 20px Rajdhani';
                ctx.fillText(`SCORE ${this.score}`, W / 2, this.cy - 190 + 92);
            }
        }
        ctx.restore();
    }
}

// Block "clank" voice for Sound.playGood(theme).
OrbitalShieldMechanic.SOUND = { soundFreq: 520, soundType: 'square' };

if (typeof module !== 'undefined' && module.exports) module.exports = OrbitalShieldMechanic;
