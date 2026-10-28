/* =========================================
   EnergySystem.js — Energy as a percentage (0–100)

   Energy is the only limit on recoveries: every lockpick try costs
   COSTS.REVIVE (25 %), in the campaign and in Endless, as many times as
   the energy lasts (beta feedback 2026-10-28; before that a stage had two
   recoveries and energy hardly mattered). It refills by 1 % every 15 s
   (20 % per 5 minutes, as fast as the old one cell per 5 minutes), and to
   100 % when Gate 9 (Dual Ring, "seal the system") is breached.

   Kept in this browser only (sb_energy: { pct, ts }); the old save of
   0–6 cells ({ energy, ts }) is read once as a share of 100.
   ========================================= */

class EnergySystem {
    constructor() {
        this.maxEnergy = 100;
        this.currentEnergy = 100;
        this.regenInterval = 15;     // seconds per 1 %
        this.regenTimer = 0;

        this.COSTS = {
            REVIVE: 25
        };

        this._load();
    }

    update(dt) {
        if (this.currentEnergy >= this.maxEnergy) {
            this.regenTimer = 0;
            return;
        }
        this.regenTimer += dt;
        if (this.regenTimer >= this.regenInterval) {
            const steps = Math.floor(this.regenTimer / this.regenInterval);
            this.regenTimer -= steps * this.regenInterval;
            this.currentEnergy = Math.min(this.currentEnergy + steps, this.maxEnergy);
            this._save();
        }
    }

    /**
     * Grant energy (Gate 9 refills to the top). Clamped to the cap.
     * Deliberately does NOT touch the time-based regeneration timer.
     * @returns {number} amount actually gained
     */
    addEnergy(amount) {
        if (!(amount > 0)) return 0;
        const before = this.currentEnergy;
        this.currentEnergy = Math.min(this.currentEnergy + amount, this.maxEnergy);
        const gained = this.currentEnergy - before;
        if (gained > 0) this._save();
        return gained;
    }

    /** Back to 100 %. */
    fill() { return this.addEnergy(this.maxEnergy); }

    canAfford(action) {
        const cost = this.COSTS[action];
        return cost !== undefined && this.currentEnergy >= cost;
    }

    spend(action) {
        if (!this.canAfford(action)) return false;
        this.currentEnergy -= this.COSTS[action];
        this._save();
        return true;
    }

    /** Seconds until the next 1 %. */
    getTimeToNextRegen() {
        if (this.currentEnergy >= this.maxEnergy) return 0;
        return this.regenInterval - this.regenTimer;
    }

    /** Seconds until 100 %. */
    getTimeToFull() {
        if (this.currentEnergy >= this.maxEnergy) return 0;
        return (this.maxEnergy - this.currentEnergy - 1) * this.regenInterval + this.getTimeToNextRegen();
    }

    _save() {
        try {
            localStorage.setItem('sb_energy', JSON.stringify({
                pct: this.currentEnergy,
                ts: Date.now()
            }));
        } catch (e) { }
    }

    _load() {
        try {
            const d = JSON.parse(localStorage.getItem('sb_energy'));
            if (!d) return;
            // The old save counted 0–6 cells.
            const start = typeof d.pct === 'number' ? d.pct : Math.round((d.energy || 0) * 100 / 6);
            const elapsed = Math.max(0, (Date.now() - d.ts) / 1000);
            const gain = Math.floor(elapsed / this.regenInterval);
            this.currentEnergy = Math.max(0, Math.min(start + gain, this.maxEnergy));
            this.regenTimer = elapsed % this.regenInterval;
        } catch (e) {
            this.currentEnergy = this.maxEnergy;
        }
    }
}
