/* =========================================
   CampaignProgress.js — Act / stage / gate progress

   Rules (docs/ACT_PLAN.md):
   - Act 1 is always open; act N (N > 1) is open once gate N-1 is open.
     A gate stays open forever once breached.
   - Stages inside an act unlock in order.
   - An act is complete when all of its stages are completed.
   - Gate N is playable when act N is complete, gate N is still closed
     and act N + 1 exists (is not in development).
   - Endless unlocks when the final act is complete. A legacy save that
     had already unlocked Endless keeps it.

   Save key: sb_campaign_v1. On first run the legacy keys
   (sb_progress, sb_group2_unlocked, sb_congrats_seen) are migrated once.
   ========================================= */

class CampaignProgress {
    constructor(campaign, storage) {
        this.campaign = campaign;
        this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
        this.data = this._load() || this._migrate();
        this._normalize();
        this._save();
    }

    // ── Persistence ──

    _read(key) {
        try { return this.storage ? this.storage.getItem(key) : null; } catch (e) { return null; }
    }

    _load() {
        try {
            const raw = JSON.parse(this._read(CampaignProgress.KEY));
            return (raw && raw.v === 1) ? raw : null;
        } catch (e) {
            return null;
        }
    }

    _save() {
        try { if (this.storage) this.storage.setItem(CampaignProgress.KEY, JSON.stringify(this.data)); } catch (e) { }
    }

    _empty() {
        return { v: 1, stages: {}, gates: [], endlessUnlocked: false, congratsSeen: false };
    }

    /** One-time import of the pre-campaign save (6 flat nodes). */
    _migrate() {
        const d = this._empty();
        let legacy = null;
        try { legacy = JSON.parse(this._read('sb_progress')); } catch (e) { legacy = null; }
        const done = {};
        const best = {};
        if (Array.isArray(legacy)) {
            for (const l of legacy) {
                if (!l || typeof l.id !== 'number') continue;
                done[l.id] = !!l.completed;
                best[l.id] = Math.max(0, Number(l.bestScore) || 0);
            }
        }
        // Old nodes 1-3 -> act 1 stages 1-3; old nodes 4-6 -> act 2 stages 1-3.
        const map = [[1, 1, 0], [2, 1, 1], [3, 1, 2], [4, 2, 0], [5, 2, 1], [6, 2, 2]];
        for (const [oldId, act, idx] of map) {
            if (!done[oldId]) continue;
            const list = d.stages[act] || (d.stages[act] = []);
            list[idx] = { completed: true, best: best[oldId] || 0 };
        }
        if (this._read('sb_group2_unlocked') === '1') d.gates.push(1);
        if ([1, 2, 3, 4, 5, 6].every(id => done[id])) d.endlessUnlocked = true;
        d.congratsSeen = this._read('sb_congrats_seen') === '1';
        return d;
    }

    /** Pad stage arrays to the act's length and drop junk. */
    _normalize() {
        const d = this.data;
        if (!d.stages || typeof d.stages !== 'object') d.stages = {};
        if (!Array.isArray(d.gates)) d.gates = [];
        for (const act of this.campaign.acts) {
            const list = Array.isArray(d.stages[act.id]) ? d.stages[act.id] : [];
            const out = [];
            for (let i = 0; i < act.stages.length; i++) {
                const s = list[i] || {};
                out.push({ completed: !!s.completed, best: Math.max(0, Number(s.best) || 0) });
            }
            d.stages[act.id] = out;
        }
        d.gates = d.gates.filter((g, i, a) => typeof g === 'number' && a.indexOf(g) === i);
        d.endlessUnlocked = !!d.endlessUnlocked;
        d.congratsSeen = !!d.congratsSeen;
    }

    reset() {
        this.data = this._empty();
        this._normalize();
        this._save();
    }

    // ── Queries ──

    act(id) { return this.campaign.acts.find(a => a.id === id) || null; }

    get acts() { return this.campaign.acts; }

    isActAvailable(id) {
        const a = this.act(id);
        return !!a && a.available && a.stages.length > 0;
    }

    isGateOpen(n) { return this.data.gates.indexOf(n) >= 0; }

    isActUnlocked(id) {
        if (!this.isActAvailable(id)) return false;
        return id === 1 || this.isGateOpen(id - 1);
    }

    stage(actId, i) {
        const list = this.data.stages[actId];
        return (list && list[i]) || { completed: false, best: 0 };
    }

    isStageCompleted(actId, i) { return this.stage(actId, i).completed; }

    isStageUnlocked(actId, i) {
        const a = this.act(actId);
        if (!a || i < 0 || i >= a.stages.length || !this.isActUnlocked(actId)) return false;
        return i === 0 || this.isStageCompleted(actId, i - 1);
    }

    stagesDone(actId) {
        const list = this.data.stages[actId] || [];
        return list.filter(s => s.completed).length;
    }

    isActComplete(actId) {
        const a = this.act(actId);
        return this.isActAvailable(actId) && this.stagesDone(actId) === a.stages.length;
    }

    /** Operator clearance level: the number of fully cleared acts (0..acts). */
    clearanceLevel() {
        return this.campaign.acts.filter(a => this.isActComplete(a.id)).length;
    }

    /**
     * System integrity, 0..1. Every act is an equal share, filled by its
     * cleared stages; acts still in development count as uncleared.
     */
    integrity() {
        const acts = this.campaign.acts;
        let sum = 0;
        for (const a of acts) {
            if (a.stages.length) sum += Math.min(1, this.stagesDone(a.id) / a.stages.length);
        }
        return acts.length ? sum / acts.length : 0;
    }

    isGatePlayable(n) {
        return !this.isGateOpen(n) && this.isActComplete(n) && this.isActAvailable(n + 1);
    }

    isCampaignComplete() {
        return this.campaign.acts.every(a => this.isActComplete(a.id));
    }

    isEndlessUnlocked() {
        return this.data.endlessUnlocked || this.isActComplete(this.campaign.finalAct);
    }

    /** First act the player still has work in (for the HUB focus). */
    currentActId() {
        for (const a of this.campaign.acts) {
            if (this.isActUnlocked(a.id) && !this.isActComplete(a.id)) return a.id;
        }
        let last = 1;
        for (const a of this.campaign.acts) if (this.isActUnlocked(a.id)) last = a.id;
        return last;
    }

    // ── Mutations ──

    /**
     * Record a cleared stage.
     * @returns {{actCompleted:boolean, endlessUnlocked:boolean}} what this
     *          clear newly achieved (both false on a replay).
     */
    completeStage(actId, i, score) {
        if (!this.isStageUnlocked(actId, i)) return { actCompleted: false, endlessUnlocked: false };
        const wasActComplete = this.isActComplete(actId);
        const wasEndless = this.isEndlessUnlocked();
        const s = this.data.stages[actId][i];
        s.completed = true;
        s.best = Math.max(s.best, Math.max(0, Math.round(Number(score) || 0)));
        const actCompleted = !wasActComplete && this.isActComplete(actId);
        const nowEndless = this.isEndlessUnlocked();
        if (nowEndless) this.data.endlessUnlocked = true;
        this._save();
        return { actCompleted, endlessUnlocked: nowEndless && !wasEndless };
    }

    openGate(n) {
        if (this.isGateOpen(n)) return false;
        this.data.gates.push(n);
        this._save();
        return true;
    }

    get congratsSeen() { return this.data.congratsSeen; }

    markCongratsSeen() {
        this.data.congratsSeen = true;
        this._save();
    }
}

CampaignProgress.KEY = 'sb_campaign_v1';

if (typeof module !== 'undefined' && module.exports) module.exports = CampaignProgress;
