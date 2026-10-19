/* =========================================
   ProfileForm.js — Operator sign-up / sign-in overlay (DOM)

   Real <input> fields over the canvas, so mobile keyboards, password
   managers and autofill work. Styled in css/style.css (.sb-form).

   Modes
     create  name + password + confirm   (new operator)
     signin  name + password             (same operator, another browser)
     secure  password + confirm          (operator created before passwords)

   open(mode, { onSubmit(mode, values) -> Promise<string|null>, onCancel })
   onSubmit resolves to an error message, or null on success.
   ========================================= */

class ProfileForm {
    constructor(canvas) {
        this.canvas = canvas;
        this.root = null;
        this.mode = null;
        this.handlers = null;
        this._busy = false;
        this._onResize = () => this._position();
    }

    get isOpen() { return !!this.root; }

    open(mode, handlers) {
        this.close();
        this.mode = mode;
        this.handlers = handlers || {};
        this._build();
        this._position();
        window.addEventListener('resize', this._onResize);
        const first = this.root.querySelector('input');
        if (first) setTimeout(() => first.focus(), 0);
    }

    close() {
        if (!this.root) return;
        window.removeEventListener('resize', this._onResize);
        this.root.remove();
        this.root = null;
        this._busy = false;
    }

    setStatus(text, isError) {
        if (!this.root) return;
        const el = this.root.querySelector('.sb-form-status');
        el.textContent = text || '';
        el.classList.toggle('is-error', !!isError);
    }

    // ── Build ──

    _el(tag, cls, text) {
        const el = document.createElement(tag);
        if (cls) el.className = cls;
        if (text !== undefined) el.textContent = text;
        return el;
    }

    _field(label, attrs) {
        const wrap = this._el('label', 'sb-form-field');
        wrap.appendChild(this._el('span', 'sb-form-label', label));
        const input = this._el('input', 'sb-form-input');
        for (const k of Object.keys(attrs)) input.setAttribute(k, attrs[k]);
        wrap.appendChild(input);
        return wrap;
    }

    _build() {
        const m = this.mode;
        const copy = {
            create: { title: 'OPERATOR PROFILE', sub: 'Pick a unique name and a password — use them to play from any browser.', cta: 'CREATE OPERATOR' },
            signin: { title: 'SIGN IN', sub: 'Continue your operator from another browser.', cta: 'SIGN IN' },
            secure: { title: 'SECURE YOUR NAME', sub: 'Set a password so you can play this operator from any browser.', cta: 'SAVE PASSWORD' }
        }[m];

        const root = this._el('div', 'sb-form-backdrop');
        const form = this._el('form', 'sb-form');
        form.setAttribute('novalidate', '');
        form.appendChild(this._el('div', 'sb-form-title', copy.title));
        form.appendChild(this._el('div', 'sb-form-sub', copy.sub));

        if (m !== 'secure') {
            form.appendChild(this._field('OPERATOR NAME', {
                name: 'username', type: 'text', autocomplete: 'username', maxlength: '16',
                autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
                placeholder: '3–16 letters, numbers, _ -'
            }));
        }
        form.appendChild(this._field('PASSWORD', {
            name: 'password', type: 'password', maxlength: '72',
            autocomplete: m === 'signin' ? 'current-password' : 'new-password',
            placeholder: 'at least 8 characters'
        }));
        if (m !== 'signin') {
            form.appendChild(this._field('CONFIRM PASSWORD', {
                name: 'confirm', type: 'password', maxlength: '72', autocomplete: 'new-password'
            }));
        }

        form.appendChild(this._el('div', 'sb-form-status'));
        const submit = this._el('button', 'sb-form-submit', copy.cta);
        submit.type = 'submit';
        form.appendChild(submit);

        const row = this._el('div', 'sb-form-row');
        const back = this._el('button', 'sb-form-link', '← BACK');
        back.type = 'button';
        back.addEventListener('click', () => this._cancel());
        row.appendChild(back);
        if (m === 'create' || m === 'signin') {
            const swap = this._el('button', 'sb-form-link',
                m === 'create' ? 'Already have a name? SIGN IN' : 'New here? CREATE A NAME');
            swap.type = 'button';
            swap.addEventListener('click', () => {
                const name = this._value('username');
                const next = m === 'create' ? 'signin' : 'create';
                this.open(next, this.handlers);
                const input = this.root.querySelector('input[name="username"]');
                if (input) input.value = name;
            });
            row.appendChild(swap);
        } else {
            const later = this._el('button', 'sb-form-link', 'LATER');
            later.type = 'button';
            later.addEventListener('click', () => this._cancel());
            row.removeChild(back);
            row.appendChild(later);
        }
        form.appendChild(row);

        form.addEventListener('submit', (e) => { e.preventDefault(); this._submit(); });
        root.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Escape') this._cancel();
        });
        root.addEventListener('pointerdown', (e) => e.stopPropagation());

        root.appendChild(form);
        document.body.appendChild(root);
        this.root = root;
    }

    _position() {
        if (!this.root || !this.canvas.getBoundingClientRect) return;
        const r = this.canvas.getBoundingClientRect();
        Object.assign(this.root.style, {
            left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px'
        });
    }

    _value(name) {
        const el = this.root && this.root.querySelector(`input[name="${name}"]`);
        return el ? el.value : '';
    }

    _cancel() {
        const h = this.handlers;
        this.close();
        if (h && h.onCancel) h.onCancel();
    }

    async _submit() {
        if (this._busy) return;
        const m = this.mode;
        const values = { name: this._value('username').trim(), password: this._value('password') };
        if (m !== 'signin' && values.password !== this._value('confirm')) {
            this.setStatus('Passwords do not match.', true);
            return;
        }
        this._busy = true;
        this.setStatus(m === 'signin' ? 'Signing in…' : 'Saving…', false);
        const submit = this.root.querySelector('.sb-form-submit');
        submit.disabled = true;
        let error = null;
        try {
            error = this.handlers.onSubmit ? await this.handlers.onSubmit(m, values) : null;
        } catch (e) {
            error = (e && e.message) || 'Something went wrong.';
        }
        if (!this.root) return; // closed on success
        this._busy = false;
        submit.disabled = false;
        if (error) this.setStatus(error, true);
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = ProfileForm;
