/* =========================================
   LeaderboardService.js — Supabase-backed Endless leaderboard

   Every browser is an anonymous Supabase user. An operator (unique name +
   password) can be played from any browser: signIn() links this browser
   to the operator, so scores and rank carry over.
   Server side: supabase/leaderboard.sql + supabase/2026-10-19_operator_password.sql
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
    /** An operator created before passwords existed: ask them to set one. */
    needsPassword() { return Boolean(this.profile) && this.profile.hasPassword === false; }

    static validateName(name) {
        const n = String(name || '').trim();
        if (!/^[A-Za-z0-9_ -]{3,16}$/.test(n)) {
            return 'Name must be 3–16 letters, numbers, spaces, _ or - .';
        }
        return null;
    }

    static validatePassword(password) {
        const p = String(password || '');
        // bcrypt only uses the first 72 bytes.
        const bytes = (typeof TextEncoder !== 'undefined') ? new TextEncoder().encode(p).length : p.length;
        if (p.length < 8 || bytes > 72) return 'Password must be 8–72 characters.';
        return null;
    }

    /** Map server errors to messages a player can act on. */
    static friendlyError(error, fallback) {
        const message = error && error.message ? error.message : '';
        if (/duplicate|unique/i.test(message)) return 'That operator name is already taken.';
        if (/too many attempts/i.test(message)) return 'Too many attempts. Try again in 15 minutes.';
        if (/already has an operator/i.test(message)) return 'This browser already plays as an operator.';
        if (/current password/i.test(message)) return 'Current password is incorrect.';
        if (/password must/i.test(message)) return 'Password must be 8–72 characters.';
        if (/invalid display name/i.test(message)) return 'Name must be 3–16 letters, numbers, spaces, _ or - .';
        if (/failed to fetch|network/i.test(message)) return 'Offline — check your connection.';
        return message || fallback;
    }

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
        const { data, error } = await this.client.rpc('get_my_operator');
        if (error) {
            // Database not migrated yet: fall back to the browser-owned profile.
            if (!/get_my_operator/i.test(error.message || '')) throw error;
            const legacy = await this.client
                .from('profiles')
                .select('display_name')
                .eq('id', user.id)
                .maybeSingle();
            if (legacy.error) throw legacy.error;
            this.profile = legacy.data ? { id: user.id, displayName: legacy.data.display_name, hasPassword: null } : null;
            return this.profile;
        }
        this.profile = this._rowToProfile(data);
        return this.profile;
    }

    _rowToProfile(data) {
        const row = Array.isArray(data) ? data[0] : data;
        return row ? { id: row.id, displayName: row.display_name, hasPassword: row.has_password !== false } : null;
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

    /** New operator: unique name + password, owned by this browser. */
    async createProfile(displayName, password) {
        const name = String(displayName || '').trim();
        const nameError = LeaderboardService.validateName(name);
        if (nameError) throw new Error(nameError);
        const passError = LeaderboardService.validatePassword(password);
        if (passError) throw new Error(passError);
        await this.initialize();
        if (this.profile) return this.profile;
        const { data, error } = await this.client.rpc('create_operator', {
            p_display_name: name,
            p_password: password
        });
        if (error) throw error;
        this.profile = this._rowToProfile(data);
        await this.flushPending();
        return this.profile;
    }

    /**
     * Play an existing operator on this browser.
     * @returns {Promise<object|null>} the profile, or null if the name or
     *          password is wrong (the server rate-limits wrong guesses).
     */
    async signIn(displayName, password) {
        const name = String(displayName || '').trim();
        if (LeaderboardService.validateName(name) || !password) return null;
        await this.initialize();
        const { data, error } = await this.client.rpc('sign_in_operator', {
            p_display_name: name,
            p_password: password
        });
        if (error) throw error;
        const profile = this._rowToProfile(data);
        if (!profile) return null;
        this.profile = profile;
        await this.flushPending();
        return this.profile;
    }

    /** Protect the current operator (or change its password). */
    async setPassword(password, currentPassword = null) {
        const passError = LeaderboardService.validatePassword(password);
        if (passError) throw new Error(passError);
        await this.initialize();
        const { error } = await this.client.rpc('set_operator_password', {
            p_password: password,
            p_current_password: currentPassword
        });
        if (error) throw error;
        if (this.profile) this.profile.hasPassword = true;
        return true;
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
