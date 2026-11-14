/* privacy.html: language switch. Its own file so the page needs no inline script (CSP). */
// Opens in the game's language (?lang=tr, else the saved sb_lang); the buttons switch it.
(function () {
    var saved = null;
    try { saved = localStorage.getItem('sb_lang'); } catch (e) { }
    var asked = (location.search.match(/[?&]lang=(en|tr)\b/) || [])[1];
    function set(lang) {
        document.documentElement.lang = lang;
        var buttons = document.querySelectorAll('[data-set]');
        for (var i = 0; i < buttons.length; i++) buttons[i].setAttribute('aria-pressed', String(buttons[i].getAttribute('data-set') === lang));
        document.title = lang === 'tr' ? 'SyncBreaker · Gizlilik' : 'SyncBreaker · Privacy';
    }
    document.querySelector('.langs').addEventListener('click', function (e) {
        var lang = e.target.getAttribute && e.target.getAttribute('data-set');
        if (lang) set(lang);
    });
    set(asked || (saved === 'tr' || saved === 'en' ? saved : (/^tr\b/i.test(navigator.language || '') ? 'tr' : 'en')));
})();
