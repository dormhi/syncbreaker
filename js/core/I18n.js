/* =========================================
   I18n.js — Languages (English / Türkçe)

   The English text is the key: I18n.t('Start mission') returns the
   Turkish entry from js/i18n/tr.js when Turkish is on, and the English
   text itself when there is no entry yet — the game never shows a broken
   key while the translation grows phase by phase (docs/I18N_PLAN.md).

   Placeholders: I18n.t('Land {n} hits', { n: 8 }).
   Variants: I18n.pick({ desktop, touch }, mode) picks, then translates.

   The choice is kept in localStorage `sb_lang`. On a first visit a
   Turkish browser starts in Turkish, everything else in English.
   Level names, game names and security jargon stay English by rule.
   ========================================= */

const I18n = {
    lang: 'en',
    langs: [
        { code: 'tr', name: 'Türkçe' },
        { code: 'en', name: 'English' }
    ],
    dict: {},
    listeners: [],

    /** Pick the saved language, else the browser's. */
    init(storage) {
        let saved = null;
        try { saved = storage && storage.getItem('sb_lang'); } catch (e) { saved = null; }
        if (saved && I18n.langs.some(l => l.code === saved)) I18n.lang = saved;
        else {
            const nav = typeof navigator !== 'undefined' ? (navigator.language || '') : '';
            I18n.lang = /^tr\b/i.test(nav) ? 'tr' : 'en';
        }
        I18n._applyDocument();
        return I18n.lang;
    },

    set(lang, storage) {
        if (!I18n.langs.some(l => l.code === lang) || lang === I18n.lang) return false;
        I18n.lang = lang;
        try { if (storage) storage.setItem('sb_lang', lang); } catch (e) { }
        I18n._applyDocument();
        I18n.listeners.forEach(fn => fn(lang));
        return true;
    },

    onChange(fn) { I18n.listeners.push(fn); },

    /** Add entries: I18n.add('tr', { 'English': 'Türkçe' }). */
    add(lang, entries) {
        I18n.dict[lang] = Object.assign(I18n.dict[lang] || {}, entries);
    },

    t(text, vars) {
        if (text === null || text === undefined) return '';
        let out = String(text);
        if (I18n.lang !== 'en') {
            const d = I18n.dict[I18n.lang];
            if (d && Object.prototype.hasOwnProperty.call(d, out)) out = d[out];
        }
        if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
        return out;
    },

    /** A string, or { desktop, touch } by input mode — translated. */
    pick(text, mode) {
        if (!text || typeof text === 'string') return I18n.t(text);
        return I18n.t((mode === 'touch' ? text.touch : text.desktop) || text.desktop || text.touch || '');
    },

    _applyDocument() {
        if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = I18n.lang;
    }
};

if (typeof module !== 'undefined' && module.exports) module.exports = I18n;
