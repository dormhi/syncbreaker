/* =========================================
   EndlessProgress.js — Best Endless results per game, on this browser

   Saved as `sb_endless_bests`: { game: { score, round } }. The old single
   best (`sb_endless_best`, Timing Bar only) is carried over once as the
   Timing Bar best. The server keeps the operator's own lists
   (LeaderboardService); this is the local record the lobby shows.
   ========================================= */

class EndlessProgress {
    constructor(storage) {
        this.storage = storage || null;
        this.key = 'sb_endless_bests';
        this.bests = this._load();
    }

    /** { score, round } for a game, zeros when it was never played. */
    best(game) {
        const b = this.bests[game];
        return { score: (b && b.score) || 0, round: (b && b.round) || 0 };
    }

    /** The highest score over every game (menu and map cards). */
    topScore() {
        return Object.values(this.bests).reduce((m, b) => Math.max(m, (b && b.score) || 0), 0);
    }

    /** Keep a finished run if it beats the game's best. @returns {boolean} new best */
    record(game, score, round) {
        if (!(score > this.best(game).score)) return false;
        this.bests[game] = { score: Math.floor(score), round: Math.max(1, Math.floor(round) || 1) };
        this._save();
        return true;
    }

    _load() {
        let bests = {};
        try { bests = JSON.parse(this.storage && this.storage.getItem(this.key)) || {}; } catch (e) { bests = {}; }
        if (typeof bests !== 'object' || Array.isArray(bests)) bests = {};
        if (!bests.timingbar) {
            // Carry over the old single Endless best (Timing Bar).
            let old = 0;
            try { old = parseInt(this.storage && this.storage.getItem('sb_endless_best'), 10) || 0; } catch (e) { old = 0; }
            if (old > 0) {
                bests.timingbar = { score: old, round: 1 };
                this.bests = bests;
                this._save();
            }
        }
        return bests;
    }

    _save() {
        try { if (this.storage) this.storage.setItem(this.key, JSON.stringify(this.bests)); } catch (e) { }
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = EndlessProgress;
