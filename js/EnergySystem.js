/* =========================================
   EnergySystem.js — Energy/Charge Management
   ========================================= */

class EnergySystem {
    constructor() {
        this.maxEnergy = 6;
        this.currentEnergy = 6;
        this.regenInterval = 5 * 60; // 5 minutes
        this.regenTimer = 0;

        // Define energy costs for different actions
        this.COSTS = {
            REVIVE: 1,
            SHORTCUT: 2
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
            this.regenTimer -= this.regenInterval;
            this.currentEnergy = Math.min(this.currentEnergy + 1, this.maxEnergy);
            this._save();
        }
    }

    /**
     * Grant energy (e.g. from the Dual Ring easter egg). Clamped to the cap.
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

    getTimeToNextRegen() {
        if (this.currentEnergy >= this.maxEnergy) return 0;
        return this.regenInterval - this.regenTimer;
    }

    _save() {
        try {
            localStorage.setItem('sb_energy', JSON.stringify({
                energy: this.currentEnergy,
                ts: Date.now()
            }));
        } catch (e) { }
    }

    _load() {
        try {
            const d = JSON.parse(localStorage.getItem('sb_energy'));
            if (!d) return;
            const elapsed = (Date.now() - d.ts) / 1000;
            const gain = Math.floor(elapsed / this.regenInterval);
            this.currentEnergy = Math.min(d.energy + gain, this.maxEnergy);
            this.regenTimer = elapsed % this.regenInterval;
        } catch (e) {
            this.currentEnergy = this.maxEnergy;
        }
    }
}
