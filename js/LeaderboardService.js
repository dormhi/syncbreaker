/* =========================================
   LeaderboardService.js — Supabase-backed Endless leaderboard
   ========================================= */

class LeaderboardService {
    constructor() {
        this.client = null;
        this.configurationError = null;
        this._clientLoading = null;
        this.profile = null;
        this.pendingKey = 'sb_endless_pending_submission';
    }

    // The config is loaded lazily because the static site stores it in an
    // .env-style text file rather than executing it as browser JavaScript.
    isConfigured() { return this.configurationError === null; }
    hasProfile() { return Boolean(this.profile); }

    async initialize() {
        await this._ensureClient();
        let { data: { session }, error } = await this.client.auth.getSession();
        if (error) throw error;
        if (!session) {
            const result = await this.client.auth.signInAnonymously();
            if (result.error) throw result.error;
        }
        await this.loadProfile();
        await this.flushPending();
        return this.profile;
    }

    async loadProfile() {
        if (!this.client) return null;
        const { data: { user }, error: userError } = await this.client.auth.getUser();
        if (userError || !user) return null;
        const { data, error } = await this.client
            .from('profiles')
            .select('display_name')
            .eq('id', user.id)
            .maybeSingle();
        if (error) throw error;
        this.profile = data ? { id: user.id, displayName: data.display_name } : null;
        return this.profile;
    }

    async _ensureClient() {
        if (this.client) return this.client;
        if (this._clientLoading) return this._clientLoading;

        this._clientLoading = (async () => {
            if (!window.supabase || !window.supabase.createClient) {
                throw new Error('Supabase client failed to load.');
            }
            const response = await fetch('js/supabase-config.js', { cache: 'no-store' });
            if (!response.ok) throw new Error('Leaderboard configuration file was not found.');
            const source = await response.text();
            const url = this._readEnvValue(source, 'NEXT_PUBLIC_SUPABASE_URL');
            const publishableKey = this._readEnvValue(source, 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
            if (!url || !publishableKey) {
                throw new Error('Supabase URL or publishable key is missing.');
            }
            this.client = window.supabase.createClient(url, publishableKey, {
                auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
            });
            return this.client;
        })();

        try {
            return await this._clientLoading;
        } catch (error) {
            this.configurationError = error;
            throw error;
        } finally {
            this._clientLoading = null;
        }
    }

    _readEnvValue(source, key) {
        const line = source.match(new RegExp(`^\\s*${key}\\s*=\\s*(.*?)\\s*$`, 'm'));
        if (!line || !line[1]) return '';
        return line[1].replace(/^['"]|['"]$/g, '').trim();
    }

    async createProfile(displayName) {
        const name = String(displayName || '').trim();
        if (!/^[A-Za-z0-9_ -]{3,16}$/.test(name)) {
            throw new Error('Name must be 3–16 letters, numbers, spaces, _ or - .');
        }
        await this.initialize();
        if (this.profile) return this.profile;
        const { data, error } = await this.client.rpc('create_leaderboard_profile', {
            p_display_name: name
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        this.profile = { id: row.id, displayName: row.display_name };
        await this.flushPending();
        return this.profile;
    }

    queueResult(result) {
        const next = this._normaliseResult(result);
        const current = this._readPending();
        if (!current || next.score > current.score) this._writePending(next);
    }

    async recordResult(result) {
        this.queueResult(result);
        if (this.profile) await this.flushPending();
    }

    async flushPending() {
        const pending = this._readPending();
        if (!pending || !this.profile || !this.client) return false;
        const { error } = await this.client.rpc('submit_endless_result', {
            p_score: pending.score,
            p_wave: pending.wave,
            p_hit_count: pending.hitCount
        });
        if (error) throw error;
        localStorage.removeItem(this.pendingKey);
        return true;
    }

    async getLeaderboard() {
        await this.initialize();
        if (!this.profile) throw new Error('Create your operator profile first.');
        const { data: entries, error: listError } = await this.client
            .from('leaderboard_entries')
            .select('display_name,best_score,best_wave,achieved_at')
            .order('best_score', { ascending: false })
            .order('achieved_at', { ascending: true })
            .limit(10);
        if (listError) throw listError;
        const { data: rankData, error: rankError } = await this.client.rpc('get_my_leaderboard_rank');
        if (rankError) throw rankError;
        return { entries: entries || [], me: Array.isArray(rankData) ? rankData[0] || null : rankData };
    }

    _normaliseResult(result) {
        const score = Math.floor(Number(result.score));
        const wave = Math.floor(Number(result.wave));
        const hitCount = Math.floor(Number(result.hitCount));
        if (!Number.isSafeInteger(score) || !Number.isSafeInteger(wave) || !Number.isSafeInteger(hitCount) ||
            score <= 0 || wave < 1 || hitCount < 1) {
            throw new Error('Invalid Endless result.');
        }
        return { score, wave, hitCount };
    }

    _readPending() {
        try {
            const saved = JSON.parse(localStorage.getItem(this.pendingKey));
            return saved ? this._normaliseResult(saved) : null;
        } catch (error) { return null; }
    }

    _writePending(result) {
        try { localStorage.setItem(this.pendingKey, JSON.stringify(result)); } catch (error) { }
    }
}
