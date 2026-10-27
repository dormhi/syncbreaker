/* =========================================
   EndlessRun.js — One run of an Endless game (docs/ACT_PLAN.md 8b)

   The shared rules of the new Endless, kept apart from any one game:
   - round: the round being played (1, 2, …); score: the run's score.
   - health games: `health` (0..1) falls by `damage` for every mistake
     (`hurt`); reaching every `refillEvery`-th round gives back `refill`
     (never above `refillCap`).
   - timer games: `timeLeft` counts down; `nextRound(time)` starts the
     next round with a fresh timer.
   - pool games: `timeLeft` is one shared pool; `nextRound(time)` adds to it.
   A run ends with a reason: 'health' | 'time' | 'quit' (the player left).
   `revive()` (Code Breaker) brings an ended run back: one mistake's worth
   of health, or `reviveTime` seconds.
   Simulation only: the host calls `update(dt)` from its update step.
   ========================================= */

class EndlessRun {
    constructor(game, opts = {}) {
        this.game = game.key;
        this.kind = game.kind;
        this.damage = game.damage || 0.2;
        this.refillEvery = game.refillEvery || 0;
        this.refill = game.refill || 0;
        this.refillCap = game.refillCap || 1;
        this.reviveTime = opts.reviveTime || 20;
        this.round = 1;
        this.score = 0;
        this.health = 1;
        this.timeLeft = opts.time || 0;
        this.over = false;
        this.reason = null;
        this.revives = 0;
        this.hurtFlash = 0;   // seconds left of the red flash after a mistake
    }

    get timed() { return this.kind === 'timer' || this.kind === 'pool'; }

    update(dt) {
        if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - dt);
        if (this.over || !this.timed) return;
        this.timeLeft = Math.max(0, this.timeLeft - dt);
        if (this.timeLeft <= 0) this._end('time');
    }

    /**
     * Timer games whose mechanic keeps the round's clock (it waits for
     * lessons and pauses): the run follows it, and time out ends the run.
     */
    syncTime(timeLeft) {
        if (this.over) return;
        this.timeLeft = Math.max(0, timeLeft);
        if (this.timeLeft <= 0) this._end('time');
    }

    /** A mistake in a health game. @returns {boolean} true if it ended the run. */
    hurt(times = 1) {
        if (this.over || this.kind !== 'health') return this.over;
        this.health = Math.max(0, this.health - this.damage * times);
        this.hurtFlash = 0.4;
        // A few float steps of 1/6 must still reach zero exactly.
        if (this.health <= 1e-6) {
            this.health = 0;
            this._end('health');
        }
        return this.over;
    }

    addScore(points) {
        if (points > 0) this.score += Math.round(points);
    }

    /**
     * The current round is cleared: count it and start the next one.
     * `time` is the next round's timer (timer games) or the time it adds
     * (pool games); health games may get some health back.
     */
    nextRound(time = 0) {
        if (this.over) return;
        this.round++;
        if (this.kind === 'timer') this.timeLeft = time;
        else if (this.kind === 'pool') this.timeLeft += time;
        else if (this.refillEvery && this.round % this.refillEvery === 0) {
            this.health = Math.max(this.health, Math.min(this.refillCap, this.health + this.refill));
        }
    }

    /** The player left the run on purpose. */
    quit() { this._end('quit'); }

    /** Code Breaker won: the run goes on from where it ended. */
    revive() {
        if (!this.over || this.reason === 'quit') return false;
        this.over = false;
        this.reason = null;
        this.revives++;
        if (this.kind === 'health') this.health = Math.max(this.health, this.damage);
        else this.timeLeft = Math.max(this.timeLeft, 0) + this.reviveTime;
        return true;
    }

    _end(reason) {
        if (this.over) return;
        this.over = true;
        this.reason = reason;
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = EndlessRun;
