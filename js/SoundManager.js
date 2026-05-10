/* =========================================
   SoundManager.js — Audio Synthesis
   Web Audio API oscillator-based sound FX
   CG Concept: Audio feedback for interactions
   ========================================= */

class SoundManager {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this._initOnInteraction();
    }

    // AudioContext requires user gesture to start
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
     * Play a single oscillator tone
     * @param {number} freq     - Start frequency (Hz)
     * @param {string} type     - sine | square | sawtooth | triangle
     * @param {number} duration - Seconds
     * @param {number} vol      - Volume 0-1
     * @param {number} freqEnd  - End frequency for sweep (optional)
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
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    // ── Game event sounds ──

    playPerfect(theme) {
        this._tone(theme.soundFreq, theme.soundType, 0.1, 0.1);
        this._tone(theme.soundFreq * 1.5, theme.soundType, 0.08, 0.07);
    }

    playGood(theme) {
        this._tone(theme.soundFreq * 0.8, theme.soundType, 0.08, 0.08);
    }

    playMiss() {
        this._tone(150, 'sawtooth', 0.2, 0.08, 80);
    }

    playWaveUp() {
        [400, 600, 800].forEach((f, i) => {
            setTimeout(() => this._tone(f, 'sine', 0.15, 0.08), i * 80);
        });
    }

    playLevelComplete() {
        [400, 500, 600, 800].forEach((f, i) => {
            setTimeout(() => this._tone(f, 'sine', 0.2, 0.1), i * 100);
        });
    }

    playLevelFail() {
        this._tone(300, 'sawtooth', 0.3, 0.08, 80);
    }
}

// Global singleton
const Sound = new SoundManager();
