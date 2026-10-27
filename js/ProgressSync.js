/* =========================================
   ProgressSync.js — The operator's progress, kept with the account

   An operator account is required to play (2026-10-27). Its progress
   follows it to every browser; the browser keeps a copy so the game also
   runs offline once the operator has signed in there.

   Synced (the operator's progress): the campaign save (sb_campaign_v1),
   Endless bests (sb_endless_bests), lessons seen (sb_coach_*) and the
   field guide flag (sb_guide_seen). Everything else stays with the
   browser: language, sound, energy, challenge attempt windows, the game
   picked in the Endless lobby.

   Both copies are merged, never overwritten: a stage cleared on any
   browser stays cleared, the best score and stars win, gates and lessons
   add up. So the order of syncs never loses progress. Only RESET replaces
   the saved copy on purpose (`push(true)` after clearing the browser).

   Save epoch: bumping EPOCH wipes every browser's saved data once on its
   next visit (the owner's decision, docs/ACT_PLAN.md 5b). Language and
   sound stay. The Supabase session ('sb-…-auth-token') goes too.
   Server side: supabase/schema.sql (operator_progress).
   ========================================= */

class ProgressSync {
    constructor(storage, service) {
        this.storage = storage || null;
        this.service = service || null;
        this._sent = null;        // JSON of the copy the server holds
        this._busy = null;
    }

    // ── Save epoch ──

    /** Wipe the browser's saved data once per epoch. @returns {boolean} wiped */
    static applyEpoch(storage) {
        if (!storage) return false;
        try {
            if (storage.getItem('sb_epoch') === ProgressSync.EPOCH) return false;
            const keep = new Set(['sb_lang', 'sb_muted']);
            ProgressSync.keys(storage)
                .filter(k => (k.startsWith('sb_') || k.startsWith('sb-')) && !keep.has(k))
                .forEach(k => storage.removeItem(k));
            storage.setItem('sb_epoch', ProgressSync.EPOCH);
            return true;
        } catch (e) {
            return false;
        }
    }

    static keys(storage) {
        const out = [];
        try { for (let i = 0; i < storage.length; i++) out.push(storage.key(i)); } catch (e) { }
        return out.filter(k => typeof k === 'string');
    }

    static isSynced(key) {
        return key === 'sb_campaign_v1' || key === 'sb_endless_bests' || key === 'sb_guide_seen' || key.startsWith('sb_coach_');
    }

    // ── The progress blob ──

    static _json(storage, key) {
        try { return JSON.parse(storage.getItem(key)); } catch (e) { return null; }
    }

    /** The browser's copy: { v, campaign, endlessBests, coach: { game: flags }, guideSeen }. */
    static collect(storage) {
        const blob = { v: 1, campaign: null, endlessBests: {}, coach: {}, guideSeen: false };
        if (!storage) return blob;
        const campaign = ProgressSync._json(storage, 'sb_campaign_v1');
        if (campaign && typeof campaign === 'object') blob.campaign = campaign;
        const bests = ProgressSync._json(storage, 'sb_endless_bests');
        if (bests && typeof bests === 'object' && !Array.isArray(bests)) blob.endlessBests = bests;
        for (const k of ProgressSync.keys(storage)) {
            if (!k.startsWith('sb_coach_')) continue;
            const flags = ProgressSync._json(storage, k);
            if (flags && typeof flags === 'object') blob.coach[k.slice(9)] = flags;
        }
        blob.guideSeen = storage.getItem('sb_guide_seen') === '1';
        return blob;
    }

    /** Merge two copies: whatever either one has cleared, earned or seen. */
    static merge(a, b) {
        a = a || {};
        b = b || {};
        const out = { v: 1, campaign: ProgressSync._mergeCampaign(a.campaign, b.campaign), endlessBests: {}, coach: {}, guideSeen: !!(a.guideSeen || b.guideSeen) };
        for (const src of [a.endlessBests || {}, b.endlessBests || {}]) {
            for (const game of Object.keys(src)) {
                const e = src[game];
                if (!e || !(Number(e.score) > 0)) continue;
                const cur = out.endlessBests[game];
                if (!cur || Number(e.score) > cur.score) out.endlessBests[game] = { score: Math.floor(Number(e.score)), round: Math.max(1, Math.floor(Number(e.round)) || 1) };
            }
        }
        for (const src of [a.coach || {}, b.coach || {}]) {
            for (const game of Object.keys(src)) {
                const flags = src[game];
                if (!flags || typeof flags !== 'object') continue;
                const into = out.coach[game] || (out.coach[game] = {});
                for (const f of Object.keys(flags)) if (flags[f]) into[f] = true;
            }
        }
        return out;
    }

    static _mergeCampaign(a, b) {
        if (!a || a.v !== 1) return b && b.v === 1 ? b : null;
        if (!b || b.v !== 1) return a;
        const stages = {};
        for (const id of new Set([...Object.keys(a.stages || {}), ...Object.keys(b.stages || {})])) {
            const la = (a.stages || {})[id] || [], lb = (b.stages || {})[id] || [];
            const list = [];
            for (let i = 0; i < Math.max(la.length, lb.length); i++) {
                const x = la[i] || {}, y = lb[i] || {};
                list.push({
                    completed: !!(x.completed || y.completed),
                    best: Math.max(Number(x.best) || 0, Number(y.best) || 0),
                    stars: Math.max(Number(x.stars) || 0, Number(y.stars) || 0)
                });
            }
            stages[id] = list;
        }
        const gates = [...new Set([...(a.gates || []), ...(b.gates || [])])].filter(g => typeof g === 'number').sort((x, y) => x - y);
        return {
            v: 1, stages, gates,
            endlessUnlocked: !!(a.endlessUnlocked || b.endlessUnlocked),
            congratsSeen: !!(a.congratsSeen || b.congratsSeen)
        };
    }

    /** Write a copy into the browser (the synced keys only). */
    static write(storage, blob) {
        if (!storage || !blob) return;
        try {
            if (blob.campaign) storage.setItem('sb_campaign_v1', JSON.stringify(blob.campaign));
            if (Object.keys(blob.endlessBests || {}).length) storage.setItem('sb_endless_bests', JSON.stringify(blob.endlessBests));
            for (const game of Object.keys(blob.coach || {})) storage.setItem(`sb_coach_${game}`, JSON.stringify(blob.coach[game]));
            if (blob.guideSeen) storage.setItem('sb_guide_seen', '1');
        } catch (e) { }
    }

    /** Forget the operator's progress on this browser (sign out, RESET). */
    static clear(storage) {
        if (!storage) return;
        ProgressSync.keys(storage).filter(k => ProgressSync.isSynced(k)).forEach(k => storage.removeItem(k));
    }

    // ── Sync with the account ──

    /**
     * Fetch the saved copy and merge it with the browser's. The browser
     * gets the merged copy; the server too if it was missing something.
     * @returns {Promise<boolean>} true if the browser's copy changed.
     */
    async pull() {
        if (!this.service || !this.service.hasProfile()) return false;
        const saved = await this.service.getProgress();
        const local = ProgressSync.collect(this.storage);
        const merged = ProgressSync.merge(local, saved);
        const changed = JSON.stringify(ProgressSync.merge(local, null)) !== JSON.stringify(merged);
        if (changed) ProgressSync.write(this.storage, merged);
        this._sent = saved ? JSON.stringify(ProgressSync.merge(saved, null)) : null;
        await this.push();
        return changed;
    }

    /**
     * Send the browser's copy if the server does not hold it yet.
     * `replace` (RESET) sends it even when it has less than the server.
     */
    async push(replace = false) {
        if (!this.service || !this.service.hasProfile()) return false;
        const blob = ProgressSync.merge(ProgressSync.collect(this.storage), null);
        const json = JSON.stringify(blob);
        if (!replace && json === this._sent) return false;
        await this.service.saveProgress(blob);
        this._sent = json;
        return true;
    }

    /** Push in the background when something changed; errors wait for the next try. */
    sync() {
        if (this._busy || !this.service || !this.service.hasProfile()) return this._busy;
        this._busy = this.push().catch(() => false).finally(() => { this._busy = null; });
        return this._busy;
    }
}

// Bump to wipe every browser's saved data once (docs/ACT_PLAN.md 5b).
ProgressSync.EPOCH = '2026-10-27';

if (typeof module !== 'undefined' && module.exports) module.exports = ProgressSync;
