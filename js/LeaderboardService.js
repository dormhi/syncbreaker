/* =========================================
   LeaderboardService.js — Supabase-backed Endless leaderboard

   Every browser is an anonymous Supabase user. An operator (unique name +
   password) can be played from any browser: signIn() links this browser
   to the operator, so scores and rank carry over.
   One list per Endless game (docs/ACT_PLAN.md 8b): results are queued per
   game ({ game: { score, round } }) until the operator can send them.
   Server side: supabase/leaderboard.sql + supabase/2026-10-19_operator_password.sql
   + supabase/2026-10-27_endless_games.sql
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

    /** Keep a finished run until it can be sent (only the game's best counts). */
    queueResult(result) {
        const next = this._normaliseResult(result);
        const pending = this._readPending();
        const current = pending[next.game];
        if (!current || next.score > current.score) {
            pending[next.game] = { score: next.score, round: next.round };
            this._writePending(pending);
        }
    }

    /** result: { game, score, round } */
    async recordResult(result) {
        this.queueResult(result);
        if (this.profile) await this.flushPending();
    }

    /** Send every queued game result; each one sent leaves the queue. */
    async flushPending() {
        const pending = this._readPending();
        if (!Object.keys(pending).length || !this.profile || !this.client) return false;
        for (const game of Object.keys(pending)) {
            const { error } = await this.client.rpc('submit_endless_game_result', {
                p_game: game,
                p_score: pending[game].score,
                p_round: pending[game].round
            });
            if (error) throw error;
            delete pending[game];
            this._writePending(pending);
        }
        return true;
    }

    /** Top 10 of one game and this operator's place in it. */
    async getLeaderboard(game) {
        await this.initialize();
        if (!this.profile) throw new Error('Create your operator profile first.');
        const { data: entries, error: listError } = await this.client
            .from('endless_game_entries')
            .select('display_name,best_score,best_round,achieved_at')
            .eq('game', game)
            .order('best_score', { ascending: false })
            .order('achieved_at', { ascending: true })
            .limit(10);
        if (listError) throw listError;
        const { data: rankData, error: rankError } = await this.client.rpc('get_my_endless_game_rank', { p_game: game });
        if (rankError) throw rankError;
        return { entries: entries || [], me: Array.isArray(rankData) ? rankData[0] || null : rankData };
    }

    _normaliseResult(result) {
        const game = String(result.game || '');
        const score = Math.floor(Number(result.score));
        const round = Math.floor(Number(result.round));
        if (!/^[a-z]+$/.test(game) || !Number.isSafeInteger(score) || !Number.isSafeInteger(round) ||
            score <= 0 || round < 1) {
            throw new Error('Invalid Endless result.');
        }
        return { game, score, round };
    }

    /** { game: { score, round } }; an old single pending result is a Timing Bar run. */
    _readPending() {
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(this.pendingKey)); } catch (error) { saved = null; }
        if (!saved || typeof saved !== 'object') return {};
        if ('score' in saved && 'wave' in saved) saved = { timingbar: { score: saved.score, round: saved.wave } };
        const out = {};
        for (const game of Object.keys(saved)) {
            try { const r = this._normaliseResult(Object.assign({ game }, saved[game])); out[game] = { score: r.score, round: r.round }; } catch (error) { }
        }
        return out;
    }

    _writePending(pending) {
        try {
            if (Object.keys(pending).length) localStorage.setItem(this.pendingKey, JSON.stringify(pending));
            else localStorage.removeItem(this.pendingKey);
        } catch (error) { }
    }
}
