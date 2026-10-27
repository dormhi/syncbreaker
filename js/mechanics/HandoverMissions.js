/* =========================================
   HandoverMissions.js — Act 10 · RETURN_CONTROL missions

   Six short teaching missions before the clean system is handed back.
   Each extends MissionMechanic (no timer, no lives, always 3 stars):
     1 scan     VirusScanMission   scan file packets, quarantine, deliver
     2 password PasswordMission    passphrases, no reuse, password manager
     3 twofa    TwoFactorMission   turn on 2FA, backup codes, deny a push
     4 phishing PhishingMission    sort the owner's inbox: safe / phishing
     5 updates  UpdateMission      patch from official sources, auto-update
     6 backup   BackupMission      3-2-1 backups, ransomware, handover
   HandoverMissions.create(params) builds the one params.mission names.
   ========================================= */

const _MissionBaseHM = (typeof MissionMechanic !== 'undefined') ? MissionMechanic : class {};

/** Text in the player's language; addresses, file names and numbers have no entry and stay as they are. */
const hmT = (text, vars) => (typeof UITheme !== 'undefined' ? UITheme.t(text, vars) : text);

/** Shared drawing: a framed box with an optional title. */
function hmPanel(ctx, x, y, w, h, title, color = 'rgba(45,212,191,0.5)') {
    UITheme.panel(ctx, x, y, w, h, { chamfer: 10, fill: 'rgba(10,16,24,0.88)', stroke: color });
    if (!title) return;
    ctx.fillStyle = '#5eead4';
    ctx.font = '700 13px Orbitron, OrbitronTR';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(hmT(title), x + 14, y + 18);
}

function hmText(ctx, text, x, y, size = 17, color = '#e2e8f0', weight = 600, align = 'left', maxW) {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px Rajdhani`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    text = hmT(text);
    if (maxW) ctx.fillText(text, x, y, maxW); else ctx.fillText(text, x, y);
}

// ─────────────────────────────────────────
// 1 · Virus scan
// ─────────────────────────────────────────

class VirusScanMission extends _MissionBaseHM {
    start() {
        // verdict: what the scanner says; bad: the truth. note: shown once inspected.
        this.packets = [
            { name: 'DOCUMENTS', files: [
                { name: 'report_q3.pdf', from: 'Director\'s backup', verdict: 'clean' },
                { name: 'invoice_0423.pdf.exe', from: 'e-mail attachment', verdict: 'infected', bad: true, note: 'Trojan.Dropper — a program dressed up as a PDF' },
                { name: 'family_photos.zip', from: 'Director\'s backup', verdict: 'clean' },
                { name: 'budget.xlsx', from: 'Director\'s backup', verdict: 'clean' }
            ] },
            { name: 'DOWNLOADS', files: [
                { name: 'photo_editor_setup.exe', from: 'official website', verdict: 'clean' },
                { name: 'game_crack_keygen.exe', from: 'file-sharing site', verdict: 'infected', bad: true, note: 'HackTool.Keygen — cracks are a favourite hiding place' },
                { name: 'cv_template.docm', from: 'unknown sender', verdict: 'suspicious', bad: true, note: 'a document with MACROS from a stranger: macros can run code' },
                { name: 'song.mp3', from: 'music store', verdict: 'clean' }
            ] },
            { name: 'USB STICK FROM THE PARKING LOT', files: [
                { name: 'autorun.inf', from: 'USB stick', verdict: 'infected', bad: true, note: 'Worm.Autorun — starts itself when the stick is plugged in' },
                { name: 'tax_form_2025.pdf', from: 'Director\'s accountant (USB)', verdict: 'suspicious', bad: false, note: 'a real PDF the Director expected — the alarm is only because the file is brand new' },
                { name: 'holiday.jpg', from: 'USB stick', verdict: 'clean' },
                { name: 'notes.txt', from: 'USB stick', verdict: 'clean' }
            ] }
        ];
        this.packet = 0;
        this.phase = 'ready';       // ready -> scanning -> review -> (next packet) -> done
        this.progress = 0;
        this.delivered = 0;
        this.seen = {};
        this.task = 'Scan the first packet before it reaches the Director';
        this.teach(
            'EVENT · The attack is over and the Director wants their files back. Before anything reaches them, every packet goes through a VIRUS SCAN.',
            'An antivirus compares each file with SIGNATURES of known malware, and watches for odd BEHAVIOUR that new malware shows (heuristics).'
        );
    }

    get files() { return this.packets[this.packet].files; }

    tick(h) {
        if (this.phase !== 'scanning') return;
        this.progress = Math.min(1, this.progress + h / 1.4);
        if (this.progress >= 1) {
            this.phase = 'review';
            const f = this.files;
            this.task = 'Deal with every flagged file, then send the clean ones';
            if (f.some(x => x.verdict === 'infected') && !this.seen.infected) {
                this.seen.infected = true;
                this.teach('INFECTED = it matches a known virus signature. Never open it: QUARANTINE locks it away where it cannot run.');
            }
            if (f.some(x => /\.\w+\.exe$/.test(x.name)) && !this.seen.double) {
                this.seen.double = true;
                this.teach('Look at "invoice_0423.pdf.exe": computers often hide the last extension, so it LOOKS like a PDF. It is really a program (.exe).');
            }
            if (f.some(x => x.verdict === 'suspicious') && !this.seen.suspicious) {
                this.seen.suspicious = true;
                this.teach('SUSPICIOUS = no known signature, but something is odd. Check where it came from and what it really is, then decide: DELETE or KEEP.');
            }
        }
    }

    _resolve(file, keep) {
        if (file.verdict === 'infected') {
            file.done = 'quarantined';
            this.tell(hmT('{file} quarantined: it can never run.', { file: file.name }));
            return;
        }
        if (keep === !file.bad) {
            file.done = keep ? 'kept' : 'deleted';
            this.tell(keep ? 'Kept: a false alarm — scanners are careful, not always right. Checking was the right move.'
                : 'Deleted: macro documents from strangers are a classic way in.');
        } else {
            this.tell(keep ? 'Not that one: a macro document from an unknown sender can run code. Delete it.'
                : 'Wait — it is a real PDF the Director expected from their accountant. A brand-new file can trigger a false alarm. Keep it.', false, 4.5);
        }
    }

    _send() {
        const clean = this.files.filter(f => f.verdict === 'clean' || f.done === 'kept').length;
        this.delivered += clean;
        this.tell(hmT('{n} clean files delivered to the Director.', { n: clean }));
        this.packet++;
        if (this.packet >= this.packets.length) {
            this.phase = 'done';
            this.finish([
                'Keep your antivirus on and updated — new malware appears every day.',
                'Scan downloads, e-mail attachments and USB sticks before you open them. Never plug in a stick you found.',
                'Check the real file type: "name.pdf.exe" is a program, not a document.'
            ]);
            return;
        }
        this.phase = 'ready';
        this.progress = 0;
        this.task = hmT('Scan packet {n}: {name}', { n: this.packet + 1, name: hmT(this.packets[this.packet].name.toLowerCase()) });   // lower-case key: no toLowerCase on Turkish text
        if (this.packet === 2) this.teach('EVENT · A USB stick was found in the parking lot, labelled "TAX 2025". Attackers drop sticks on purpose. Never plug one in unscanned — here it goes into the scanner first.');
    }

    rowRect(i) { return { x: 50, y: 146 + i * 94, w: 590, h: 86 }; }

    buttons() {
        const out = [];
        if (this.phase === 'ready') out.push({ id: 'scan', x: 692, y: 440, w: 226, h: 72, label: hmT('SCAN PACKET {n}', { n: this.packet + 1 }), tone: 'primary', onTap: () => { this.phase = 'scanning'; this.progress = 0; this.task = 'Scanning…'; } });
        if (this.phase === 'review') {
            this.files.forEach((f, i) => {
                if (f.done || f.verdict === 'clean') return;
                const r = this.rowRect(i);
                if (f.verdict === 'infected') out.push({ id: 'q' + i, x: r.x + r.w - 170, y: r.y + 12, w: 160, h: 42, label: 'QUARANTINE', tone: 'danger', small: true, onTap: () => this._resolve(f) });
                else {
                    out.push({ id: 'd' + i, x: r.x + r.w - 220, y: r.y + 12, w: 100, h: 42, label: 'DELETE', tone: 'danger', small: true, onTap: () => this._resolve(f, false) });
                    out.push({ id: 'k' + i, x: r.x + r.w - 110, y: r.y + 12, w: 100, h: 42, label: 'KEEP', tone: 'safe', small: true, onTap: () => this._resolve(f, true) });
                }
            });
            if (this.files.every(f => f.verdict === 'clean' || f.done)) {
                out.push({ id: 'send', x: 692, y: 440, w: 226, h: 72, label: 'SEND CLEAN FILES', sub: 'to the Director', tone: 'safe', onTap: () => this._send() });
            }
        }
        return out;
    }

    drawScene(ctx) {
        if (this.phase === 'done') return;
        const p = this.packets[this.packet];
        hmPanel(ctx, 30, 110, 630, 420, hmT('PACKET {n}/3 · {name}', { n: this.packet + 1, name: hmT(p.name) }));
        const show = this.phase === 'review';
        p.files.forEach((f, i) => {
            const r = this.rowRect(i);
            ctx.fillStyle = 'rgba(30,41,59,0.55)';
            ctx.fillRect(r.x, r.y, r.w, r.h);
            const color = !show ? '#94a3b8' : f.done === 'quarantined' || f.done === 'deleted' ? '#64748b'
                : f.verdict === 'infected' ? '#ef4444' : f.verdict === 'suspicious' && !f.done ? '#f59e0b' : '#22c55e';
            ctx.fillStyle = color;
            ctx.fillRect(r.x, r.y, 5, r.h);
            hmText(ctx, f.name, r.x + 18, r.y + 22, 18, f.done === 'quarantined' || f.done === 'deleted' ? '#64748b' : '#f1f5f9', 700);
            const status = !show ? hmT('waiting for scan')
                : f.done ? hmT(f.done.toUpperCase())
                : f.verdict === 'clean' ? hmT('CLEAN') : f.verdict === 'infected' ? hmT('INFECTED · {note}', { note: hmT(f.note) })
                : hmT('SUSPICIOUS · from {from}: {note}', { from: hmT(f.from), note: hmT(f.note) });
            // Up to two lines, clear of the buttons while a file waits for a decision.
            const room = show && !f.done && f.verdict !== 'clean' ? r.w - 250 : r.w - 30;
            ctx.fillStyle = color;
            ctx.font = '600 15px Rajdhani';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            this.wrap(ctx, show ? status : hmT('from {from}', { from: hmT(f.from) }), r.x + 18, r.y + 48, room, 18);
        });
        if (this.phase === 'scanning') {
            ctx.fillStyle = 'rgba(15,23,42,0.9)';
            ctx.fillRect(700, 452, 210, 16);
            ctx.fillStyle = '#2dd4bf';
            ctx.fillRect(700, 452, 210 * this.progress, 16);
            hmText(ctx, hmT('SCANNING… {p}%', { p: Math.round(this.progress * 100) }), 805, 492, 16, '#5eead4', 700, 'center');
        }
        // The owner's folder
        hmPanel(ctx, 680, 110, 250, 420, 'DIRECTOR\'S FOLDER');
        hmText(ctx, String(this.delivered), 805, 230, 64, '#2dd4bf', 800, 'center');
        hmText(ctx, 'clean files delivered', 805, 280, 16, '#94a3b8', 600, 'center');
        for (let k = 0; k < 3; k++) {
            const done = k < this.packet;
            ctx.fillStyle = done ? '#22c55e' : k === this.packet ? '#2dd4bf' : 'rgba(71,85,105,0.6)';
            ctx.fillRect(712 + k * 64, 330, 52, 10);
        }
        hmText(ctx, 'packets', 805, 360, 14, '#64748b', 600, 'center');
    }
}

// ─────────────────────────────────────────
// 2 · New passwords
// ─────────────────────────────────────────

const HM_WORDS = ['river', 'lamp', 'orbit', 'cactus', 'violet', 'thunder', 'pocket', 'falcon', 'marble', 'cobalt', 'pickle', 'glacier', 'sonic', 'velvet', 'lantern', 'meadow'];

class PasswordMission extends _MissionBaseHM {
    start() {
        this.accounts = [
            { name: hmT('E-MAIL'), old: 'sunshine1' },
            { name: hmT('BANK'), old: 'Fluffy2019' },
            { name: hmT('SOCIAL'), old: 'qwerty123' }
        ];
        this.index = 0;
        this.phase = 'old';         // old -> build -> (next) -> vault -> done
        this.words = [];
        this.bank = this._shuffle(HM_WORDS.map(w => hmT(w))).slice(0, 10);
        this.oldTested = false;
        this.task = 'Test the old e-mail password';
        this.teach(
            'EVENT · The attacker\'s leak list holds the Director\'s old passwords. Every account needs a NEW one before the handover.',
            'Let\'s see how strong the old e-mail password really was.'
        );
    }

    get account() { return this.accounts[this.index]; }

    /** Rough strength in bits: passphrase words ~12.9 bits each, dictionary passwords very little. */
    static bits(pw, words) {
        if (words) return words * 12.9;
        if (!pw) return 0;
        const common = /^(sunshine|fluffy|qwerty|password|letmein|dragon)/i.test(pw);
        return common ? 12 : pw.length * 4;
    }

    static crackTime(bits) {
        if (bits < 30) return ['INSTANTLY', '#ef4444'];
        if (bits < 42) return ['IN A FEW HOURS', '#f59e0b'];
        if (bits < 50) return ['IN A FEW YEARS', '#facc15'];
        return ['IN CENTURIES', '#22c55e'];
    }

    get phrase() { return this.words.join('-'); }

    _set() {
        if (this.words.length < 4) { this.tell('Use at least FOUR random words — every extra word makes it far harder to crack.', false); return; }
        const used = this.accounts.slice(0, this.index).find(a => a.pw === this.phrase);
        if (used) {
            this.tell(hmT('That is the {name} password! One leak would open both accounts. Build a different one.', { name: used.name }), false, 4.5);
            return;
        }
        this.account.pw = this.phrase;
        this.tell(hmT('New {name} password set: cracked {time}.', { name: this.account.name, time: hmT(PasswordMission.crackTime(PasswordMission.bits(null, this.words.length))[0].toLowerCase()) }));
        this.index++;
        this.words = [];
        this.bank = this._shuffle(HM_WORDS.map(w => hmT(w))).slice(0, 10);
        if (this.index >= this.accounts.length) {
            this.phase = 'vault';
            this.task = 'Store the new passwords safely';
            this.teach('Three long, different passwords — nobody can remember those. That is what a PASSWORD MANAGER is for: it remembers them, you remember ONE strong master password.');
            return;
        }
        this.task = hmT('Build a new {name} password', { name: this.account.name });
        if (this.index === 1) this.teach('Tempting: just use the same password for the bank? Attackers try every leaked password on every site ("credential stuffing"). One password per account.');
    }

    buttons() {
        const out = [];
        if (this.phase === 'old') {
            out.push({ id: 'test', x: 60, y: 300, w: 400, h: 56, label: 'TEST THE OLD PASSWORD', tone: 'primary', onTap: () => {
                this.oldTested = true;
                this.phase = 'build';
                this.task = 'Build a new e-mail passphrase from random words';
                this.teach('"sunshine1" falls INSTANTLY: it is a common word plus a digit, the first thing cracking tools try. LENGTH beats tricks like "P@ss!" — four random words are both strong and easy to remember.');
            } });
        }
        if (this.phase === 'build') {
            this.bank.forEach((w, i) => {
                out.push({ id: 'w' + i, x: 60 + (i % 5) * 120, y: 300 + Math.floor(i / 5) * 58, w: 110, h: 48, label: w, small: true, disabled: this.words.length >= 5,
                    onTap: () => { if (this.words.length < 5) this.words.push(w); } });
            });
            out.push({ id: 'del', x: 60, y: 430, w: 170, h: 50, label: '⌫ REMOVE', small: true, disabled: !this.words.length, onTap: () => this.words.pop() });
            if (this.index > 0) out.push({ id: 'reuse', x: 240, y: 430, w: 220, h: 50, label: hmT('USE {name}\'S', { name: this.accounts[0].name }), small: true,
                onTap: () => { this.words = this.accounts[0].pw.split('-'); } });
            out.push({ id: 'set', x: 470, y: 430, w: 170, h: 50, label: 'SET PASSWORD', tone: 'safe', small: true, onTap: () => this._set() });
        }
        if (this.phase === 'vault') {
            out.push({ id: 'vault', x: 60, y: 330, w: 580, h: 60, label: 'SAVE ALL TO THE PASSWORD MANAGER', tone: 'safe', onTap: () => {
                this.phase = 'done';
                this.finish([
                    'Length beats complexity: four or more random words make a strong passphrase.',
                    'Never reuse a password — one leak would open every account that shares it.',
                    'Let a password manager remember them, and protect it with one strong master password.'
                ]);
            } });
        }
        return out;
    }

    drawScene(ctx) {
        if (this.phase === 'done') return;
        hmPanel(ctx, 30, 110, 630, 420, this.phase === 'vault' ? 'PASSWORD MANAGER' : hmT('ACCOUNT {n}/3 · {name}', { n: Math.min(this.index + 1, 3), name: this.account ? this.account.name : '' }));
        if (this.phase === 'vault') {
            this.accounts.forEach((a, i) => hmText(ctx, `${a.name}   ${'•'.repeat(18)}   ✓`, 60, 170 + i * 40, 19, '#cbd5e1', 700));
        } else {
            const old = this.phase === 'old';
            hmText(ctx, old ? 'OLD PASSWORD (leaked)' : 'NEW PASSPHRASE', 60, 160, 14, '#94a3b8', 700);
            hmText(ctx, old ? this.account.old : (this.phrase || 'tap words below…'), 60, 196, 26, old ? '#fca5a5' : this.phrase ? '#f8fafc' : '#475569', 700);
            const bits = old ? (this.oldTested ? PasswordMission.bits(this.account.old) : 0) : PasswordMission.bits(null, this.words.length);
            const [label, color] = PasswordMission.crackTime(bits);
            // Strength meter
            ctx.fillStyle = 'rgba(15,23,42,0.9)';
            ctx.fillRect(60, 226, 580, 14);
            ctx.fillStyle = color;
            ctx.fillRect(60, 226, 580 * Math.min(1, bits / 60), 14);
            if (old && !this.oldTested) hmText(ctx, 'Crack time: ?', 60, 262, 17, '#94a3b8', 700);
            else hmText(ctx, hmT('Crack time: {time}', { time: hmT(label) }), 60, 262, 17, color, 700);
        }
        hmPanel(ctx, 680, 110, 250, 420, 'ACCOUNTS');
        this.accounts.forEach((a, i) => {
            const done = !!a.pw;
            hmText(ctx, `${done ? '✓' : i === this.index ? '▸' : '·'} ${a.name}`, 704, 160 + i * 40, 19, done ? '#22c55e' : i === this.index ? '#5eead4' : '#64748b', 700);
        });
    }
}

// ─────────────────────────────────────────
// 3 · Two-step verification
// ─────────────────────────────────────────

class TwoFactorMission extends _MissionBaseHM {
    start() {
        this.phase = 'enable';      // enable -> code -> backup -> attack -> push -> done
        this.entry = '';
        this.code = this._newCode();
        this.codeAge = 0;
        this.attackT = 0;
        this.task = 'Turn on two-step verification for the e-mail account';
        this.teach(
            'EVENT · Passwords leak — it happened once already. TWO-STEP VERIFICATION (2FA) means a login needs your password AND a code from something you have: your phone.',
            'With 2FA on, a stolen password alone is useless to the attacker.'
        );
    }

    _newCode() { let s = ''; for (let k = 0; k < 6; k++) s += this._int(10); return s; }

    tick(h) {
        if (this.phase === 'code') {
            this.codeAge += h;
            if (this.codeAge >= 20) { this.codeAge = 0; this.code = this._newCode(); }
        }
        if (this.phase === 'attack') {
            this.attackT += h;
            if (this.attackT >= 3.2) {
                this.phase = 'push';
                this.task = 'A sign-in request just appeared on the phone';
                this.teach('Blocked: the attacker had the password but not the code. Now they try a trick — they keep sending sign-in requests to the phone, hoping the Director taps APPROVE by mistake.');
            }
        }
    }

    _digit(d) {
        if (this.entry.length < 6) this.entry += d;
        if (this.entry.length === 6) {
            if (this.entry === this.code) {
                this.phase = 'backup';
                this.task = 'Store the backup codes';
                this.tell('2FA is ON. The code changes every few seconds, so an old one is worthless.');
                this.teach('BACKUP CODES let the Director in if the phone is lost. Each works once. Where should they be kept?');
            } else {
                this.tell('Wrong code — copy the six digits the phone shows right now.', false);
                this.entry = '';
            }
        }
    }

    buttons() {
        const out = [];
        if (this.phase === 'enable') out.push({ id: 'on', x: 60, y: 200, w: 300, h: 56, label: '2FA: OFF → TURN ON', tone: 'primary', onTap: () => {
            this.phase = 'code';
            this.task = 'Type the 6-digit code from the authenticator app';
            this.teach('The Director scans the QR code with an AUTHENTICATOR app. From now on the app shows a fresh 6-digit code every few seconds. App codes are safer than SMS, which can be hijacked.');
        } });
        if (this.phase === 'code') {
            for (let d = 0; d < 10; d++) {
                const k = d === 0 ? 10 : d - 1;
                out.push({ id: 'n' + d, x: 380 + (k % 3) * 82, y: 190 + Math.floor(k / 3) * 66, w: 72, h: 56, label: String(d), onTap: () => this._digit(String(d)) });
            }
            out.push({ id: 'clr', x: 380 + 2 * 82, y: 190 + 3 * 66, w: 72, h: 56, label: '⌫', onTap: () => { this.entry = this.entry.slice(0, -1); } });
        }
        if (this.phase === 'backup') {
            const opts = [
                ['note', 'STICKY NOTE ON THE SCREEN', false, 'Anyone walking past the desk can read it — and so can a camera.'],
                ['mail', 'E-MAIL THEM TO MYSELF', false, 'If the e-mail account is hacked, the attacker gets the codes too.'],
                ['vault', 'IN THE PASSWORD MANAGER', true, '']
            ];
            opts.forEach(([id, label, ok, why], i) => out.push({ id, x: 60, y: 250 + i * 66, w: 580, h: 56, label, tone: ok ? 'safe' : 'neutral', onTap: () => {
                if (!ok) { this.tell(why, false, 4); return; }
                this.phase = 'attack';
                this.attackT = 0;
                this.task = 'Watch: someone is logging in with the old password';
                this.tell('Backup codes saved in the password manager.');
                this.teach('EVENT · 03:12 at night. A login to the e-mail account from an unknown country — with the correct, stolen password…');
            } }));
        }
        if (this.phase === 'push') {
            out.push({ id: 'approve', x: 420, y: 400, w: 150, h: 54, label: 'APPROVE', tone: 'danger', onTap: () => this.tell('Never approve a sign-in you did not start. Saying yes hands the attacker the account.', false, 4.5) });
            out.push({ id: 'deny', x: 590, y: 400, w: 150, h: 54, label: 'DENY', tone: 'safe', onTap: () => {
                this.phase = 'done';
                this.finish([
                    'Turn on two-step verification everywhere — an authenticator app or security key beats SMS.',
                    'Keep backup codes somewhere safe, like your password manager — never on a sticky note.',
                    'Never approve a login request you did not start yourself.'
                ]);
            } });
        }
        return out;
    }

    drawScene(ctx) {
        if (this.phase === 'done') return;
        hmPanel(ctx, 30, 110, 640, 420, 'E-MAIL ACCOUNT · SECURITY');
        if (this.phase === 'enable') hmText(ctx, 'Two-step verification is OFF: the password alone opens the account.', 60, 160, 17, '#fca5a5', 600);
        if (this.phase === 'code') {
            // A QR-like square the owner "scans"
            for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
                if (((x * 7 + y * 13 + x * y) % 3) || (x < 3 && y < 3) || (x > 5 && y < 3) || (x < 3 && y > 5)) {
                    ctx.fillStyle = '#e2e8f0';
                    ctx.fillRect(70 + x * 26, 170 + y * 26, 24, 24);
                }
            }
            hmText(ctx, 'Scanned ✓', 70, 420, 16, '#22c55e', 700);
            hmText(ctx, hmT('CODE: {code}', { code: this.entry.padEnd(6, '·') }), 380, 160, 24, '#f8fafc', 700);
        }
        if (this.phase === 'backup') {
            hmText(ctx, 'Backup codes:  4821-9937   1176-0452   8830-6614 …', 60, 170, 18, '#cbd5e1', 700);
            hmText(ctx, 'Where will the Director keep them?', 60, 214, 17, '#94a3b8', 600);
        }
        if (this.phase === 'attack' || this.phase === 'push') {
            const t = this.attackT;
            hmText(ctx, 'LOGIN FROM: unknown device · far away', 60, 170, 17, '#fca5a5', 700);
            hmText(ctx, hmT('Password: {state}', { state: hmT(t > 0.8 ? '•••••••••  ✓ correct' : 'typing…') }), 60, 214, 18, '#cbd5e1', 600);
            if (t > 1.6) hmText(ctx, 'Code from the Director\'s phone: ??????', 60, 254, 18, '#cbd5e1', 600);
            if (t > 2.4 || this.phase === 'push') hmText(ctx, '✗ ACCESS DENIED — no code, no entry', 60, 298, 20, '#22c55e', 700);
        }
        // The owner's phone
        const px = 700, py = 120, pw = 220, ph = 400;
        UITheme.panel(ctx, px, py, pw, ph, { chamfer: 18, fill: 'rgba(15,23,42,0.95)', stroke: 'rgba(148,163,184,0.6)' });
        hmText(ctx, 'DIRECTOR\'S PHONE', px + pw / 2, py + 24, 13, '#64748b', 700, 'center');
        if (this.phase === 'code' || this.phase === 'backup' || this.phase === 'attack') {
            hmText(ctx, 'Authenticator', px + pw / 2, py + 90, 15, '#94a3b8', 700, 'center');
            hmText(ctx, this.phase === 'code' ? `${this.code.slice(0, 3)} ${this.code.slice(3)}` : '••• •••', px + pw / 2, py + 140, 34, '#2dd4bf', 800, 'center');
            if (this.phase === 'code') {
                ctx.fillStyle = 'rgba(45,212,191,0.6)';
                ctx.fillRect(px + 30, py + 172, (pw - 60) * (1 - this.codeAge / 20), 6);
            }
        }
        if (this.phase === 'push') {
            UITheme.panel(ctx, px + 14, py + 110, pw - 28, 150, { chamfer: 10, fill: 'rgba(30,41,59,0.98)', stroke: '#f59e0b' });
            hmText(ctx, 'Approve sign-in?', px + pw / 2, py + 140, 18, '#fde68a', 700, 'center');
            hmText(ctx, 'Unknown device', px + pw / 2, py + 172, 15, '#cbd5e1', 600, 'center');
            hmText(ctx, '03:12 · far away', px + pw / 2, py + 196, 15, '#cbd5e1', 600, 'center');
            hmText(ctx, 'APPROVE / DENY below', px + pw / 2, py + 232, 13, '#94a3b8', 600, 'center');
        }
    }
}

// ─────────────────────────────────────────
// 4 · Phishing
// ─────────────────────────────────────────

const HM_MAILS = [
    { name: 'PayPal', addr: 'service@paypa1-security.com', subject: 'Your account is LOCKED', body: 'Unusual activity detected. Verify your identity within 24 hours or your account will be closed.', link: ['Verify now', 'http://paypa1-verify.xyz/login'], phishing: true,
        why: 'Fake: "paypa1" uses the digit 1, the link goes to a strange site, and the 24-hour threat is pressure.' },
    { name: 'IT Support', addr: 'helpdesk@it-support-mail.ru', subject: 'Password expires TODAY', body: 'Keep your current password by logging in through the link below.', link: ['Keep my password', 'http://office-login.reset-now.ru'], phishing: true,
        why: 'Fake: real IT never asks you to log in through an e-mail link, and the sender is not your company.' },
    { name: 'Parcel Service', addr: 'delivery@parcel-redelivery.top', subject: 'Package on hold — €1.99 fee', body: 'Your parcel could not be delivered. Pay the small customs fee to release it.', link: ['Pay €1.99', 'http://parcel-redelivery.top/pay'], phishing: true,
        why: 'Fake: a tiny "fee" is bait to steal card details, and the address is not the real courier.' },
    { name: 'The Boss', addr: 'ceo.office.private@gmail.com', subject: 'Urgent — need a favour', body: 'Are you at your desk? Buy 5 gift cards for a client and send me the codes. Keep it quiet.', link: null, phishing: true,
        why: 'Fake: a private Gmail address, secrecy, urgency and gift cards — a classic boss scam. Check by phone.' },
    { name: 'Mum', addr: 'mum.home@gmail.com', subject: 'Photos from Sunday', body: 'Here are the pictures from the garden, love you!', link: null, attach: 'garden_01.jpg', phishing: false,
        why: 'Safe: a known address, an expected message and a normal photo.' },
    { name: 'Your Bank', addr: 'no-reply@yourbank.com', subject: 'Monthly statement ready', body: 'Your statement is available. Open the banking app as usual to view it.', link: null, phishing: false,
        why: 'Safe: the real domain, no link, and it tells you to use the app you already have.' },
    { name: 'Calendar', addr: 'calendar-noreply@google.com', subject: 'Reminder: dentist 10:00', body: 'This is a reminder for your event tomorrow.', link: ['Open calendar', 'https://calendar.google.com'], phishing: false,
        why: 'Safe: the real Google address and the link goes to the real calendar.' },
    { name: 'Streaming Service', addr: 'info@streamflix.com', subject: 'New season out now', body: 'Season 3 is here. Watch it tonight in the app.', link: ['Watch now', 'https://www.streamflix.com/watch'], phishing: false,
        why: 'Safe: the address and the link match the real service, and nothing is asked of you.' }
];

class PhishingMission extends _MissionBaseHM {
    start() {
        const bad = this._shuffle(HM_MAILS.filter(m => m.phishing)).slice(0, 3);
        const good = this._shuffle(HM_MAILS.filter(m => !m.phishing)).slice(0, 3);
        // Shown in the player's language; addresses and real link targets stay as they are.
        const local = (m) => Object.assign({}, m, { name: hmT(m.name), subject: hmT(m.subject), body: hmT(m.body), why: hmT(m.why),
            link: m.link ? [hmT(m.link[0]), m.link[1]] : null });
        this.mails = this._shuffle(bad.concat(good)).map(m => Object.assign({ done: null, inspected: false }, local(m)));
        this.index = 0;
        this.task = 'Check each e-mail: SAFE or PHISHING?';
        this.teach(
            'EVENT · The Director\'s inbox is filling up again. Some messages are PHISHING: fakes that try to steal passwords or money. Check each one before the Director opens it.',
            'Look at four things: the REAL sender address, where a link REALLY goes (inspect it), pressure to act NOW, and anything unexpected you are asked to do or open.'
        );
    }

    get mail() { return this.mails[this.index]; }

    _decide(phishing) {
        const m = this.mail;
        if (phishing !== m.phishing) { this.tell(hmT('Look again. {why}', { why: m.why }), false, 6); return; }
        m.done = phishing ? 'phishing' : 'safe';
        this.tell(m.why, true, 5);
        this.index++;
        if (this.index >= this.mails.length) {
            this.finish([
                'Check the real sender address — "paypa1.com" is not "paypal.com".',
                'Inspect where a link really goes before you click; when in doubt, open the site or app yourself.',
                'Urgency, threats, secrecy and odd payment requests are red flags — slow down and check another way.'
            ]);
        }
    }

    buttons() {
        if (!this.mail) return [];
        const out = [];
        if (this.mail.link && !this.mail.inspected) out.push({ id: 'inspect', x: 300, y: 380, w: 250, h: 46, label: 'INSPECT THE LINK', small: true, onTap: () => { this.mail.inspected = true; } });
        out.push({ id: 'safe', x: 300, y: 450, w: 250, h: 56, label: 'SAFE', tone: 'safe', onTap: () => this._decide(false) });
        out.push({ id: 'phish', x: 570, y: 450, w: 250, h: 56, label: 'PHISHING', tone: 'danger', onTap: () => this._decide(true) });
        return out;
    }

    drawScene(ctx) {
        hmPanel(ctx, 30, 110, 240, 420, 'INBOX');
        this.mails.forEach((m, i) => {
            const y = 168 + i * 56;
            const on = i === this.index;
            ctx.fillStyle = on ? 'rgba(45,212,191,0.15)' : 'rgba(30,41,59,0.5)';
            ctx.fillRect(42, y - 22, 216, 48);
            hmText(ctx, `${m.done === 'phishing' ? '✗' : m.done === 'safe' ? '✓' : on ? '▸' : '·'} ${m.name}`, 52, y - 6, 16, m.done === 'phishing' ? '#fca5a5' : m.done ? '#86efac' : '#e2e8f0', 700);
            hmText(ctx, m.subject, 52, y + 14, 13, '#94a3b8', 600);
        });
        const m = this.mail;
        if (!m) return;
        hmPanel(ctx, 290, 110, 640, 420, hmT('MESSAGE {n}/{total}', { n: this.index + 1, total: this.mails.length }));
        hmText(ctx, hmT('From: {name}', { name: m.name }), 310, 158, 18, '#f1f5f9', 700);
        hmText(ctx, `<${m.addr}>`, 310, 184, 17, '#fde68a', 700);
        hmText(ctx, hmT('Subject: {subject}', { subject: m.subject }), 310, 218, 18, '#e2e8f0', 700);
        ctx.fillStyle = '#cbd5e1';
        ctx.font = '600 17px Rajdhani';
        ctx.textAlign = 'left';
        this.wrap(ctx, m.body, 310, 258, 600, 22);
        if (m.attach) hmText(ctx, `📎 ${m.attach}`, 310, 330, 16, '#94a3b8', 700);
        if (m.link) {
            hmText(ctx, `[ ${m.link[0]} ]`, 310, 350, 18, '#60a5fa', 700);
            if (m.inspected) hmText(ctx, hmT('really goes to: {url}', { url: m.link[1] }), 310, 403, 17, '#fde68a', 700);
        }
    }
}

// ─────────────────────────────────────────
// 5 · Updates
// ─────────────────────────────────────────

class UpdateMission extends _MissionBaseHM {
    start() {
        this.apps = [
            { name: 'Operating system', from: 'v10.2', to: 'v10.6', risk: 'HIGH · a hole lets malware gain admin rights' },
            { name: 'Web browser', from: 'v98', to: 'v131', risk: 'CRITICAL · a web page can run code on the PC', ad: true },
            { name: 'PDF reader', from: 'v7.1', to: 'v9.0', risk: 'HIGH · a booby-trapped PDF can install malware' },
            { name: 'Chat app', from: 'v4.4', to: 'v4.4', risk: null }
        ];
        this.phase = 'list';        // list -> (updating) -> popup -> auto -> done
        this.updating = null;
        this.progress = 0;
        this.auto = false;
        this.popupShown = false;
        this.task = 'Update every program with a known security hole';
        this.teach(
            'EVENT · How did the attacker get in? Through an OLD security hole in the browser. The fix had been out for months — the update was just never installed.',
            'Most attacks use holes that are ALREADY fixed. Updating closes the door. Red programs below have known holes.'
        );
    }

    tick(h) {
        if (!this.updating) return;
        this.progress = Math.min(1, this.progress + h / 1.2);
        if (this.progress >= 1) {
            this.updating.from = this.updating.to;
            this.updating.risk = null;
            this.tell(hmT('{name} updated — that hole is closed.', { name: hmT(this.updating.name) }));
            this.updating = null;
            if (!this.popupShown) {
                this.popupShown = true;
                this.phase = 'popup';
                this.task = 'A pop-up appeared';
            } else if (this.apps.every(a => !a.risk)) {
                this.phase = 'auto';
                this.task = 'Make updates happen by themselves';
                this.teach('All patched! But new holes are found every week. Turn on AUTOMATIC UPDATES so fixes arrive without anyone remembering.');
            }
        }
    }

    _update(app, official) {
        if (!official) { this.tell('Never take updates from ads or download sites — fake updates are a favourite way to spread malware. Use the official one.', false, 5); return; }
        this.updating = app;
        this.progress = 0;
    }

    buttons() {
        const out = [];
        if (this.phase === 'list' && !this.updating) {
            this.apps.forEach((a, i) => {
                if (!a.risk) return;
                const y = 150 + i * 80;
                out.push({ id: 'up' + i, x: 520, y: y + 4, w: 170, h: 46, label: 'OFFICIAL UPDATE', sub: 'settings / app store', small: true, tone: 'safe', onTap: () => this._update(a, true) });
                if (a.ad) out.push({ id: 'ad' + i, x: 700, y: y + 4, w: 210, h: 46, label: 'FAST DOWNLOAD', sub: 'free-updates-now.net (ad)', small: true, onTap: () => this._update(a, false) });
            });
        }
        if (this.phase === 'popup') {
            out.push({ id: 'install', x: 300, y: 380, w: 170, h: 52, label: 'INSTALL', tone: 'danger', onTap: () => this.tell('That is a fake alert: real virus warnings never ask you to install a stranger\'s program. Close it.', false, 5) });
            out.push({ id: 'close', x: 490, y: 380, w: 170, h: 52, label: 'CLOSE', tone: 'safe', onTap: () => {
                this.phase = 'list';
                this.task = 'Update the remaining programs';
                this.tell('Closed. Scary pop-ups that push you to install something are scams.');
            } });
        }
        if (this.phase === 'auto') out.push({ id: 'auto', x: 160, y: 470, w: 400, h: 52, label: 'AUTOMATIC UPDATES: OFF → ON', tone: 'primary', onTap: () => {
            this.auto = true;
            this.phase = 'done';
            this.finish([
                'Install updates soon — most attacks use holes that are already fixed.',
                'Update only from official places: system settings or the app store, never an ad or a pop-up.',
                'Turn on automatic updates so fixes arrive even when you forget.'
            ]);
        } });
        return out;
    }

    drawScene(ctx) {
        if (this.phase === 'done') return;
        hmPanel(ctx, 30, 110, 900, 420, 'INSTALLED PROGRAMS');
        this.apps.forEach((a, i) => {
            const y = 150 + i * 80;
            ctx.fillStyle = 'rgba(30,41,59,0.55)';
            ctx.fillRect(50, y, 860, 56);
            ctx.fillStyle = a.risk ? '#ef4444' : '#22c55e';
            ctx.fillRect(50, y, 5, 56);
            hmText(ctx, `${hmT(a.name)}  ${a.from}${a.risk ? ` → ${a.to}` : ''}`, 68, y + 18, 18, '#f1f5f9', 700);
            hmText(ctx, a.risk || 'UP TO DATE', 68, y + 40, 14, a.risk ? '#fca5a5' : '#86efac', 600);
            if (this.updating === a) {
                ctx.fillStyle = 'rgba(15,23,42,0.9)';
                ctx.fillRect(520, y + 20, 380, 14);
                ctx.fillStyle = '#2dd4bf';
                ctx.fillRect(520, y + 20, 380 * this.progress, 14);
            }
        });
        if (this.phase === 'popup') {
            ctx.fillStyle = 'rgba(5,8,16,0.6)';
            ctx.fillRect(30, 110, 900, 420);
            UITheme.panel(ctx, 260, 200, 440, 250, { chamfer: 8, fill: 'rgba(127,29,29,0.95)', stroke: '#ef4444', lineWidth: 2 });
            hmText(ctx, '⚠ YOUR PC IS INFECTED! (3 viruses)', 480, 240, 20, '#fde68a', 800, 'center');
            hmText(ctx, 'Install CleanerPro NOW to remove them.', 480, 280, 17, '#fecaca', 600, 'center');
            hmText(ctx, 'Offer ends in 00:59', 480, 312, 15, '#fecaca', 600, 'center');
        }
        if (this.phase === 'auto') hmText(ctx, this.auto ? 'Automatic updates: ON' : 'Automatic updates: OFF', 580, 496, 18, this.auto ? '#22c55e' : '#fca5a5', 700);
    }
}

// ─────────────────────────────────────────
// 6 · Backups and the handover
// ─────────────────────────────────────────

class BackupMission extends _MissionBaseHM {
    start() {
        this.copies = ['LAPTOP (the original)', null, null];
        this.phase = 'copy2';       // copy2 -> copy3 -> run -> unplug -> ransom -> restore -> handover -> done
        this.progress = 0;
        this.task = 'Choose where backup copy 2 goes';
        this.teach(
            'EVENT · Last step before the handover: BACKUPS. If the files exist only on the laptop, one broken disk, theft or ransomware loses them all.',
            'The 3-2-1 rule: 3 copies of your data, on 2 different kinds of storage, with 1 copy somewhere else (off-site).'
        );
    }

    tick(h) {
        if (this.phase !== 'run' && this.phase !== 'restore') return;
        this.progress = Math.min(1, this.progress + h / 1.4);
        if (this.progress < 1) return;
        if (this.phase === 'run') {
            this.phase = 'unplug';
            this.task = 'Backup finished — what about the external drive?';
            this.tell('Backup complete: 3 copies, 2 kinds of storage, 1 off-site.');
        } else {
            this.phase = 'handover';
            this.task = 'Hand control back to the Director';
            this.tell('Every file restored from the offline backup. The ransomware got nothing.');
        }
    }

    _choose(slot, ok, label, why) {
        if (!ok) { this.tell(why, false, 5); return; }
        this.copies[slot] = label;
        if (slot === 1) { this.phase = 'copy3'; this.task = 'Choose where backup copy 3 goes'; }
        else { this.phase = 'ready'; this.task = 'Run the backup'; }
    }

    buttons() {
        const out = [];
        const opt = (id, y, label, tone, onTap) => out.push({ id, x: 60, y, w: 560, h: 54, label, tone, small: true, onTap });
        if (this.phase === 'copy2') {
            opt('folder', 330, 'ANOTHER FOLDER ON THE SAME LAPTOP', 'neutral', () => this._choose(1, false, '', 'Same disk: if the laptop dies or is stolen, both copies go with it. Use a different device.'));
            opt('drive', 394, 'EXTERNAL HARD DRIVE', 'safe', () => this._choose(1, true, 'EXTERNAL DRIVE'));
        }
        if (this.phase === 'copy3') {
            opt('drawer', 330, 'A USB STICK IN THE SAME DESK DRAWER', 'neutral', () => this._choose(2, false, '', 'A fire, flood or burglary takes the laptop and the stick together. One copy must live somewhere else.'));
            opt('cloud', 394, 'ENCRYPTED CLOUD BACKUP (off-site)', 'safe', () => this._choose(2, true, 'CLOUD (off-site)'));
        }
        if (this.phase === 'ready') opt('run', 394, 'BACK UP NOW', 'primary', () => { this.phase = 'run'; this.progress = 0; this.task = 'Backing up…'; });
        if (this.phase === 'unplug') {
            opt('keep', 330, 'LEAVE IT PLUGGED IN', 'neutral', () => this.tell('Ransomware encrypts every drive it can reach — a plugged-in backup gets locked too. Keep one copy disconnected.', false, 5));
            opt('unplug', 394, 'UNPLUG IT AND STORE IT AWAY', 'safe', () => {
                this.phase = 'ransom';
                this.task = 'The laptop has been hit';
                this.teach('EVENT · A week later a ransomware e-mail slipped past someone. Every file on the laptop is ENCRYPTED. A message demands 2 BTC for the key.');
            });
        }
        if (this.phase === 'ransom') {
            opt('pay', 330, 'PAY THE RANSOM', 'danger', () => this.tell('Paying is no guarantee you get the files back, marks you as a payer, and funds the next attack. You have a better option.', false, 5));
            opt('restore', 394, 'WIPE THE LAPTOP AND RESTORE FROM THE OFFLINE BACKUP', 'safe', () => { this.phase = 'restore'; this.progress = 0; this.task = 'Restoring…'; });
        }
        if (this.phase === 'handover') opt('hand', 420, 'HAND CONTROL BACK TO THE DIRECTOR', 'primary', () => {
            this.phase = 'done';
            this.teach('CONTROL RETURNED · The system is clean, scanned, protected by new passwords and 2FA, up to date and backed up. The Director knows how to keep it that way.');
            this.finish([
                '3-2-1: three copies, on two kinds of storage, one of them off-site.',
                'Keep one backup unplugged or offline, so ransomware cannot reach it — then never pay.',
                'Test your backups: a backup you have never restored is only a hope.'
            ]);
        });
        return out;
    }

    drawScene(ctx) {
        if (this.phase === 'done') return;
        if (this.phase === 'handover') {
            hmPanel(ctx, 30, 110, 900, 420, 'HANDOVER CHECKLIST');
            ['Files scanned and clean', 'New passwords in a password manager', 'Two-step verification on', 'Phishing spotted and binned', 'Everything updated, auto-updates on', '3-2-1 backups, one offline']
                .forEach((t, i) => hmText(ctx, `✓  ${hmT(t)}`, 80, 160 + i * 38, 19, '#86efac', 700));
            return;
        }
        hmPanel(ctx, 30, 110, 900, 200, '3-2-1 BACKUP PLAN');
        this.copies.forEach((c, i) => {
            const x = 60 + i * 290;
            UITheme.panel(ctx, x, 150, 260, 120, { chamfer: 8, fill: c ? 'rgba(34,197,94,0.12)' : 'rgba(30,41,59,0.6)', stroke: c ? '#22c55e' : 'rgba(100,116,139,0.6)', dashed: !c });
            hmText(ctx, hmT('COPY {n}', { n: i + 1 }), x + 130, 180, 15, '#94a3b8', 700, 'center');
            hmText(ctx, c || '?', x + 130, 220, 17, c ? '#f1f5f9' : '#475569', 700, 'center');
        });
        if (this.phase === 'run' || this.phase === 'restore') {
            ctx.fillStyle = 'rgba(15,23,42,0.9)';
            ctx.fillRect(60, 340, 560, 18);
            ctx.fillStyle = '#2dd4bf';
            ctx.fillRect(60, 340, 560 * this.progress, 18);
            hmText(ctx, this.phase === 'run' ? 'BACKING UP…' : 'RESTORING…', 340, 380, 16, '#5eead4', 700, 'center');
        }
        if (this.phase === 'ransom') {
            UITheme.panel(ctx, 640, 320, 290, 200, { chamfer: 8, fill: 'rgba(127,29,29,0.9)', stroke: '#ef4444' });
            hmText(ctx, '🔒 YOUR FILES ARE ENCRYPTED', 785, 352, 15, '#fde68a', 800, 'center');
            hmText(ctx, 'Pay 2 BTC within 48 h', 785, 390, 16, '#fecaca', 600, 'center');
            hmText(ctx, 'report_q3.pdf.locked', 785, 430, 14, '#fecaca', 600, 'center');
            hmText(ctx, 'family_photos.zip.locked', 785, 452, 14, '#fecaca', 600, 'center');
        }
    }
}

const HandoverMissions = {
    classes: { scan: VirusScanMission, password: PasswordMission, twofa: TwoFactorMission, phishing: PhishingMission, updates: UpdateMission, backup: BackupMission },
    create(params = {}) {
        const Cls = HandoverMissions.classes[params.mission] || VirusScanMission;
        return new Cls(Object.assign({}, params));
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { HandoverMissions, VirusScanMission, PasswordMission, TwoFactorMission, PhishingMission, UpdateMission, BackupMission };
}
