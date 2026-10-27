/* =========================================
   SoundManager.js — Audio Synthesis
   Web Audio API oscillator-based sound FX
   CG Concept: Audio feedback for interactions
   ========================================= */

class SoundManager {
    constructor() {
        this.ctx = null;
        // Two channels, each with the player's level: the ambient music and
        // the sound effects (sb_music / sb_volume, 0..1).
        this.levels = { music: this._loadLevel('sb_music'), sfx: this._loadLevel('sb_volume') };
        this.buses = {};
        this.enabled = !this._loadMuted();
        this._ambientNodes = null;
        this._initOnInteraction();
    }

    _loadMuted() {
        try { return localStorage.getItem('sb_muted') === '1'; } catch (e) { return false; }
    }

    _saveMuted() {
        try { localStorage.setItem('sb_muted', this.enabled ? '0' : '1'); } catch (e) { }
    }

    _loadLevel(key) {
        let v = NaN;
        try { v = parseFloat(localStorage.getItem(key)); } catch (e) { }
        return isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
    }

    /** Muted: the speaker is off, or both channels are at 0 %. */
    isMuted() { return !this.enabled; }

    level(kind) { return this.levels[kind]; }

    /**
     * Set a channel ('music' | 'sfx') to 0..1. Both at 0 mutes; turning one
     * up from a muted state unmutes. Music at 0 stops the ambient bed.
     */
    setLevel(kind, v) {
        const level = Math.max(0, Math.min(1, Math.round((Number(v) || 0) * 100) / 100));
        this.levels[kind] = level;
        try { localStorage.setItem(kind === 'music' ? 'sb_music' : 'sb_volume', String(level)); } catch (e) { }
        const bus = this.buses[kind];
        if (bus && this.ctx) bus.gain.setTargetAtTime(level * level, this.ctx.currentTime, 0.02);
        const silent = this.levels.music === 0 && this.levels.sfx === 0;
        if (silent && !this.isMuted()) this.setMuted(true);
        else if (!silent && this.isMuted()) this.setMuted(false);
        if (kind === 'music' && level === 0) this.stopAmbient();
        return level;
    }

    /** A channel's bus, made on first use. Ears hear loudness roughly as gain². */
    _bus(kind) {
        if (!this.buses[kind]) {
            const g = this.ctx.createGain();
            g.gain.value = this.levels[kind] * this.levels[kind];
            g.connect(this.ctx.destination);
            this.buses[kind] = g;
        }
        return this.buses[kind];
    }

    /** Mute/unmute all audio. Muting also silences the ambient bed. */
    setMuted(muted) {
        this.enabled = !muted;
        if (!this.enabled) this.stopAmbient();
        this._saveMuted();
        return this.isMuted();
    }

    toggleMute() { return this.setMuted(!this.isMuted()); }

    _initOnInteraction() {
        const init = () => {
            if (!this.ctx) {
                this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            }
            document.removeEventListener('click', init);
            document.removeEventListener('keydown', init);
        };
        document.addEventListener('click', init);
        document.addEventListener('keydown', init);
    }

    /**
     * Single oscillator tone
     */
    _tone(freq, type = 'sine', duration = 0.12, vol = 0.12, freqEnd = null) {
        if (!this.ctx || !this.enabled) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        if (freqEnd) {
            osc.frequency.exponentialRampToValueAtTime(
                freqEnd, this.ctx.currentTime + duration
            );
        }

        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this._bus('sfx'));
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    // ── Game event sounds ──

    playPerfect(theme) {
        this._tone(theme.soundFreq, theme.soundType, 0.12, 0.3);
        this._tone(theme.soundFreq * 1.5, theme.soundType, 0.1, 0.2);
    }

    playGood(theme) {
        this._tone(theme.soundFreq * 0.8, theme.soundType, 0.1, 0.25);
    }

    playMiss() {
        this._tone(150, 'sawtooth', 0.25, 0.25, 80);
    }

    playWaveUp() {
        [400, 600, 800].forEach((f, i) => {
            setTimeout(() => this._tone(f, 'sine', 0.15, 0.25), i * 80);
        });
    }

    playLevelComplete() {
        [400, 500, 600, 800].forEach((f, i) => {
            setTimeout(() => this._tone(f, 'sine', 0.2, 0.3), i * 100);
        });
    }

    playLevelFail() {
        this._tone(300, 'sawtooth', 0.35, 0.25, 80);
    }

    // ── Interface sounds (kept quiet: they play on every menu action) ──

    /** Button press. */
    playClick() {
        this._tone(1400, 'square', 0.03, 0.04);
    }

    /** Screen transition sweep. */
    playWhoosh() {
        this._tone(900, 'sawtooth', 0.16, 0.025, 140);
    }

    /** A stamp slamming down (ACCESS GRANTED, SECURED). */
    playStamp() {
        this._tone(140, 'sine', 0.2, 0.3, 45);
        this._tone(2200, 'square', 0.02, 0.05);
    }

    /** Result star k (0..2) lighting up: a rising chime. */
    playStar(k) {
        const f = [880, 1109, 1319][k] || 880;
        this._tone(f, 'triangle', 0.22, 0.16);
        this._tone(f * 2, 'sine', 0.12, 0.05);
    }

    // ── Ambient — Cyber Attack atmosphere ──
    // Multiple layered oscillators + noise bursts + data stream beeps

    startAmbient() {
        if (!this.ctx || !this.enabled || this._ambientNodes || this.levels.music === 0) return;

        const now = this.ctx.currentTime;

        // Layer 1: Deep threat drone (two detuned sines = beating)
        const drone1 = this.ctx.createOscillator();
        drone1.type = 'sine';
        drone1.frequency.setValueAtTime(65, now);

        const drone2 = this.ctx.createOscillator();
        drone2.type = 'sine';
        drone2.frequency.setValueAtTime(65.7, now); // beat frequency ~0.7Hz

        // Layer 2: Mid-range digital hum (filtered square)
        const digital = this.ctx.createOscillator();
        digital.type = 'square';
        digital.frequency.setValueAtTime(130, now);

        // Layer 3: High tension sine (slow LFO on volume for pulsing)
        const tension = this.ctx.createOscillator();
        tension.type = 'sine';
        tension.frequency.setValueAtTime(440, now);

        const lfo = this.ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(0.5, now); // 0.5 Hz pulse

        const lfoGain = this.ctx.createGain();
        lfoGain.gain.setValueAtTime(0.015, now);

        // Filters
        const lowpass = this.ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.setValueAtTime(400, now);

        // Per-layer gains
        const droneGain = this.ctx.createGain();
        droneGain.gain.setValueAtTime(0.35, now);

        const digitalGain = this.ctx.createGain();
        digitalGain.gain.setValueAtTime(0.06, now);

        const tensionGain = this.ctx.createGain();
        tensionGain.gain.setValueAtTime(0, now); // LFO controls this

        // Master gain — fade in
        const masterGain = this.ctx.createGain();
        masterGain.gain.setValueAtTime(0, now);
        masterGain.gain.linearRampToValueAtTime(0.22, now + 2.0);

        // Routing
        drone1.connect(droneGain);
        drone2.connect(droneGain);
        droneGain.connect(lowpass);

        digital.connect(digitalGain);
        digitalGain.connect(lowpass);

        lfo.connect(lfoGain);
        lfoGain.connect(tensionGain.gain); // LFO modulates tension volume
        tension.connect(tensionGain);
        tensionGain.connect(masterGain);

        lowpass.connect(masterGain);
        masterGain.connect(this._bus('music'));

        drone1.start();
        drone2.start();
        digital.start();
        tension.start();
        lfo.start();

        this._ambientNodes = {
            oscs: [drone1, drone2, digital, tension, lfo],
            masterGain
        };

        // Data stream blips — random high-pitched beeps (more frequent, louder)
        this._ambientBlipId = setInterval(() => {
            if (!this.ctx || !this.enabled) return;
            // Rapid data-stream beep
            const f = 1200 + Math.random() * 3000;
            this._tone(f, 'sine', 0.04, 0.07);
            // Occasional secondary lower beep
            if (Math.random() > 0.6) {
                setTimeout(() => {
                    this._tone(f * 0.5, 'square', 0.03, 0.04);
                }, 80);
            }
        }, 800 + Math.random() * 1500);

        // Warning pulse — periodic low sweep every ~4s
        this._ambientPulseId = setInterval(() => {
            if (!this.ctx || !this.enabled) return;
            this._tone(120, 'sawtooth', 0.4, 0.06, 60);
        }, 3500 + Math.random() * 2000);
    }

    stopAmbient() {
        if (!this._ambientNodes) return;
        const { oscs, masterGain } = this._ambientNodes;
        const now = this.ctx.currentTime;

        masterGain.gain.linearRampToValueAtTime(0, now + 0.5);
        setTimeout(() => {
            oscs.forEach(o => { try { o.stop(); } catch (e) { } });
        }, 600);

        if (this._ambientBlipId) clearInterval(this._ambientBlipId);
        if (this._ambientPulseId) clearInterval(this._ambientPulseId);
        this._ambientNodes = null;
    }
}

// Global singleton
const Sound = new SoundManager();
