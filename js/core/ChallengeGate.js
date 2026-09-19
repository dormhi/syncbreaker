/* =========================================
   ChallengeGate.js — Attempt Windows

   Tracks timestamped attempts for a challenge in localStorage.
   "N attempts per window" semantics: once the N attempts are used,
   the player must wait until the window rolls over (the oldest
   attempt ages out) before trying again.

   Examples:
     Dual Ring   → 2 attempts / 5 minutes
     PacketPurge → 2 attempts / 3 minutes
   ========================================= */

class ChallengeGate {
    constructor(key) {
        this.key = key;
        this._stamps = this._load();
    }

    _load() {
        try {
            const raw = JSON.parse(localStorage.getItem(this.key));
            return Array.isArray(raw) ? raw.filter(t => typeof t === 'number' && t > 0) : [];
        } catch (e) {
            return [];
        }
    }

    _save() {
        try { localStorage.setItem(this.key, JSON.stringify(this._stamps)); } catch (e) { }
    }

    _prune(windowMs, now) {
        const cutoff = now - windowMs;
        this._stamps = this._stamps.filter(t => t > cutoff);
    }

    attemptsUsed(windowMs, now) {
        const t = (typeof now === 'number') ? now : Date.now();
        this._prune(windowMs, t);
        return this._stamps.length;
    }

    remaining(windowMs, max, now) {
        return Math.max(0, max - this.attemptsUsed(windowMs, now));
    }

    canAttempt(windowMs, max, now) {
        return this.remaining(windowMs, max, now) > 0;
    }

    /** Consume one attempt. */
    record(windowMs, now) {
        const t = (typeof now === 'number') ? now : Date.now();
        this._prune(windowMs, t);
        this._stamps.push(t);
        this._save();
        return this._stamps.length;
    }

    /** Seconds until attempts become available again (0 if available now). */
    timeUntilReset(windowMs, max, now) {
        const t = (typeof now === 'number') ? now : Date.now();
        this._prune(windowMs, t);
        if (this._stamps.length < max) return 0;
        const oldest = Math.min.apply(null, this._stamps);
        return Math.max(0, (windowMs - (t - oldest)) / 1000);
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = ChallengeGate;
