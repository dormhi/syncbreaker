/* =========================================
   i18n/tr.js — Turkish texts (key = the English text)

   Grows phase by phase (docs/I18N_PLAN.md). Rules: natural Turkish, not
   word for word; level names, game names and security jargon stay
   English; every text must still fit where it is drawn.
   ========================================= */

if (typeof I18n !== 'undefined') {
    // ── Phase 1 · the language selector ──
    I18n.add('tr', {
        'Language': 'Dil'
    });

    // ── Phase 2 · menu, status report, HUB, act screen, gates, pause, results ──
    I18n.add('tr', {
        // Main menu
        '▶  START MISSION': '▶  GÖREVE BAŞLA',
        '▶  ENTER': '▶  GİR',
        '⚠ CYBER DEFENSE PROTOCOL ⚠': '⚠ SİBER SAVUNMA PROTOKOLÜ ⚠',
        '✓ CYBER DEFENSE PROTOCOL COMPLETE ✓': '✓ SİBER SAVUNMA PROTOKOLÜ TAMAMLANDI ✓',
        '> STATUS REPORT': '> DURUM RAPORU',
        'v3.0 · Written by dormhi': 'v3.0 · Yazan: dormhi',
        'Press back again to leave SyncBreaker': "SyncBreaker'dan çıkmak için tekrar geri bas",
        'CLEARANCE': 'YETKİ',
        'SYSTEM INTEGRITY': 'SİSTEM BÜTÜNLÜĞÜ',
        'ENERGY': 'ENERJİ',

        // Status report: intro story
        '[WARNING] Your system is under cyber attack!': '[UYARI] Sistemin siber saldırı altında!',
        'An unknown attacker has infiltrated your network.': 'Kimliği belirsiz bir saldırgan ağına sızdı.',
        'Malicious code has been injected into critical system files.': 'Kritik sistem dosyalarına zararlı kod yerleştirildi.',
        'The attacker is still active and spreading.': 'Saldırgan hâlâ aktif ve yayılıyor.',
        '> YOUR MISSION:': '> GÖREVİN:',
        'Clear every stage of an act, then breach the gate to the next one.': "Bir act'in bütün aşamalarını temizle, sonra sıradakine giden kapıyı kır.",
        '{n} acts stand between the attacker and full control of the system.': 'Saldırganla sistemin tam kontrolü arasında {n} act var.',
        'If an operation fails, the code breaker can run the recovery protocol.': 'Bir operasyon başarısız olursa Code Breaker kurtarma protokolünü çalıştırabilir.',
        '> CAUTION: Energy resources are limited. Each operation costs charges.': '> DİKKAT: Enerji sınırlı. Her operasyon enerji harcar.',
        '  Do not stop until the system is fully cleansed!': '  Sistem tamamen temizlenene kadar durma!',

        // Status report: progress
        '[WARNING] The attacker is still inside the PERIMETER.': '[UYARI] Saldırgan hâlâ PERIMETER içinde.',
        '[ALERT] Perimeter secured. The attacker fell back into the INTERNAL network.': '[ALARM] Perimeter güvende. Saldırgan INTERNAL ağa geri çekildi.',
        '[ALERT] The attacker is cornered in the CORE.': '[ALARM] Saldırgan CORE katmanında köşeye sıkıştı.',
        '[SECURE] The system is clean. Time to hand it back to its owner.': '[GÜVENLİ] Sistem temiz. Sahibine geri verme zamanı.',
        '{done} of {n} acts cleared · ★ {got}/{max} stars earned.': 'Temizlenen act: {done}/{n} · ★ {got}/{max} yıldız kazanıldı.',
        'Secured so far: {list}.': 'Şimdiye kadar: {list}.',
        'First stages cleared in ACT {n} — keep going.': 'ACT {n} içinde ilk aşamalar temizlendi — devam et.',
        'No attacker activity detected.': 'Saldırgan etkinliği görülmüyor.',
        'The attacker is still active in the {layer} layer.': 'Saldırgan hâlâ {layer} katmanında aktif.',
        '> NEXT:': '> SIRADAKİ:',
        'ACT {n} · {key}{game} — {got}/{total} stages cleared': 'ACT {n} · {key}{game} — {got}/{total} aşama temizlendi',
        'Breach GATE {gate} to reach ACT {n}.': 'Kapıyı kır: KAPI {gate} → ACT {n}.',
        'ACT {n} · {key} is still in development — stay tuned.': 'ACT {n} · {key} hâlâ geliştiriliyor — takipte kal.',
        // What each cleared act secured (Campaign.js `done`)
        'malware purged': 'malware temizlendi',
        'firewall rebuilt': 'firewall yeniden kuruldu',
        'ports sealed': 'portlar kapatıldı',
        'credentials reset': 'kimlik bilgileri sıfırlandı',
        'attacker traced': 'saldırganın izi bulundu',
        'access cut': 'erişim kesildi',
        'payload defused': 'payload etkisizleşti',
        'core restored': 'çekirdek geri yüklendi',
        'audit passed': 'denetim geçildi',
        'control returned': 'kontrol geri verildi',

        // Main menu for Endless players
        '[SECURE] Every node is clean. The campaign is complete.': '[GÜVENLİ] Bütün düğümler temiz. Kampanya tamamlandı.',
        'The attacker keeps coming back — from now on the game is endless.': 'Saldırgan geri gelmeye devam ediyor — artık oyun sonsuz.',
        'Find the ∞ ring at the end of the operation map.': 'Operasyon haritasının sonundaki ∞ halkasını bul.',
        'BEST ENDLESS RUN  {n}': 'EN İYİ ENDLESS KOŞUSU  {n}',
        'NO ENDLESS RUN YET': 'HENÜZ ENDLESS KOŞUSU YOK',

        // HUB: act map
        'OPERATION MAP': 'OPERASYON HARİTASI',
        'Clear every stage of an act, then breach the gate': "Bir act'in bütün aşamalarını temizle, sonra kapıyı kır",
        'SECURED': 'GÜVENDE',
        'SIGNAL LOST': 'SİNYAL YOK',
        '⚙ IN DEVELOPMENT': '⚙ GELİŞTİRİLİYOR',
        'COMPLETE': 'TAMAMLANDI',
        'LOCKED': 'KİLİTLİ',
        '{done}/{n} STAGES': '{done}/{n} AŞAMA',
        'BEST {n}': 'EN İYİ {n}',
        'OPEN ▸': 'AÇ ▸',
        'AFTER THE CAMPAIGN': 'KAMPANYADAN SONRA',
        'The attack never ends. Climb the leaderboard.': "Saldırı hiç bitmiyor. Leaderboard'da yüksel.",
        'NO RUN YET': 'HENÜZ KOŞU YOK',
        '← MENU': '← MENÜ',
        '🗑 RESET': '🗑 SIFIRLA',
        'Are you sure you want to delete all data and start fresh?': 'Bütün veriler silinip oyun baştan başlasın mı?',
        'Complete ACT {n} to unlock Endless Mode': 'Endless Mode, ACT {n} bitince açılır',
        'ACT {n} is in development': 'ACT {n} geliştiriliyor',
        'Breach gate {gate} to reach ACT {n}': 'ACT {n} için önce KAPI {gate} kırılmalı',
        'Clear the previous stage first': 'Önce bir önceki aşamayı temizle',

        // Act screen
        '← ACTS': '← HARİTA',
        '{hits} HITS · {time}s': '{hits} İSABET · {time} sn',
        '{n} BLOCKS HIGH': '{n} BLOK YÜKSEKLİK',
        '{packets} PACKETS · {ports} PORTS': '{packets} PAKET · {ports} PORT',
        '{keys} KEYS · {time}s': '{keys} ANAHTAR · {time} sn',
        '{traces} TRACES · {size}×{size} · {time}s': '{traces} İZ · {size}×{size} · {time} sn',
        '{n} NETWORKS · {lives}♥': '{n} AĞ · {lives}♥',
        '{n} PAYLOADS · {time}s': '{n} PAYLOAD · {time} sn',
        '{n} DISKS · {cols}×{rows} · {time}s': '{n} DİSK · {cols}×{rows} · {time} sn',
        '{cols}×{rows} · NO TIMER': '{cols}×{rows} · SÜRE YOK',
        'MISSION': 'GÖREV',
        'SCAN FILES': 'DOSYALARI TARA',
        'NEW PASSWORDS': 'YENİ PAROLALAR',
        'TURN ON 2FA': "2FA'YI AÇ",
        'SORT THE INBOX': 'GELEN KUTUSU',
        'PATCH THE HOLES': 'AÇIKLARI KAPAT',
        'HAND OVER': 'TESLİM ET',
        'NEXT ▸': 'SIRADAKİ ▸',
        'ACT COMPLETE': 'ACT TAMAMLANDI',
        '{done}/{n} STAGES CLEARED': '{done}/{n} AŞAMA TEMİZLENDİ',
        'CLEARANCE GRANTED': 'YETKİ VERİLDİ',
        'GATE {n}': 'KAPI {n}',
        '⚡ BREACH GATE {gate} → ACT {n}': '⚡ KAPIYI KIR → ACT {n}',
        'NEXT: ACT {n} →': 'SIRADAKİ: ACT {n} →',
        'ACT {n} COMPLETE — breach gate {n} to reach ACT {next}': 'ACT {n} TAMAMLANDI — ACT {next} için KAPI {n} kırılmalı',
        'ACT {n} COMPLETE — ACT {next} is in development': 'ACT {n} TAMAMLANDI — ACT {next} geliştiriliyor',

        // Gates (Packet Purge host texts)
        'GATE {n} · PACKET PURGE': 'KAPI {n} · PACKET PURGE',
        '{n} waves — purge infected packets before they reach the core': '{n} dalga — enfekte paketleri çekirdeğe ulaşmadan temizle',
        'Tap the faster RED packets — leave the blue ones': 'Daha hızlı KIRMIZI paketlere dokun — mavilere dokunma',
        'Gate {n} is already breached': 'KAPI {n} zaten kırıldı',
        'Clear every stage of ACT {n} first': 'Önce ACT {n} içindeki bütün aşamaları temizle',
        'The lock is recalibrating ({s}s)': 'Kilit yeniden ayarlanıyor ({s} sn)',
        'ACT {n} UNLOCKED': 'ACT {n} AÇILDI',
        'Purge failed — the lock holds': 'Temizlik başarısız — kilit dayanıyor',

        // Energy recovery (hidden Dual Ring) messages
        'ENERGY RECOVERY': 'ENERJİ KURTARMA',
        'Nail 3 alignments in a row — the speed shifts every round': 'Art arda 3 hizalama yap — hız her turda değişir',
        'Press SPACE / tap when both markers line up': "İki işaret hizalanınca SPACE'e bas / dokun",
        'Recovery module recharging ({s}s)': 'Kurtarma modülü şarj oluyor ({s} sn)',
        '+{n} ENERGY': '+{n} ENERJİ',
        'Recovery failed': 'Kurtarma başarısız',

        // Pause panel
        'PAUSED': 'DURAKLATILDI',
        '▶  RESUME': '▶  DEVAM ET',
        '↻  RESTART': '↻  BAŞTAN BAŞLA',
        '←  LEAVE': '←  ÇIK',
        'STAY': 'KAL',
        'CANCEL': 'VAZGEÇ',
        'LEAVE': 'ÇIK',
        'RESTART': 'BAŞTAN BAŞLA',
        'RESTART THIS STAGE?': 'AŞAMA BAŞTAN BAŞLASIN MI?',
        'LEAVE THIS STAGE?': 'AŞAMADAN ÇIKILSIN MI?',
        'LEAVE THIS CHALLENGE?': 'DENEMEDEN ÇIKILSIN MI?',
        'Your progress in this stage will be lost.': 'Bu aşamadaki ilerlemen kaybolacak.',
        'This attempt will still count.': 'Bu deneme yine de sayılır.',
        'RECOVERY PROTOCOL': 'KURTARMA PROTOKOLÜ',
        'ABORT RECOVERY?': 'KURTARMA İPTAL EDİLSİN Mİ?',
        'The run ends here — your score still counts.': 'Koşu burada biter — skorun yine de sayılır.',
        'The energy spent on this recovery is not refunded.': 'Bu kurtarmaya harcanan enerji geri verilmez.',
        'END THIS RUN?': 'KOŞU BİTİRİLSİN Mİ?',
        'Your score so far still counts.': 'Şimdiye kadarki skorun yine de sayılır.',

        // Results: stage cleared / failed
        'NODE CLEANED!': 'DÜĞÜM TEMİZLENDİ!',
        'Score: {score} | Max Combo: x{combo}': 'Skor: {score} | En iyi COMBO: x{combo}',
        'ACCESS GRANTED': 'ERİŞİM SAĞLANDI',
        'NEW BEST': 'YENİ REKOR',
        'OPERATION FAILED': 'OPERASYON BAŞARISIZ',
        'Score: {score}': 'Skor: {score}',
        'Recovery protocol failed': 'Kurtarma protokolü başarısız',
        'No recovery charges left for this node': 'Bu aşama için kurtarma hakkı kalmadı',
        'Restart unlocks in {s}s': '{s} sn sonra yeniden deneyebilirsin',
        '🔄 TRY RECOVERY PROTOCOL (1⚡){extra} · {n} left': '🔄 KURTARMA PROTOKOLÜ (1⚡){extra} · {n} hak',
        '+20s': '+20 sn',
        '+1 LIFE': '+1 CAN',
        '↻ RETRY': '↻ TEKRAR DENE',
        '↻ RETRY ({s}s)': '↻ TEKRAR DENE ({s} sn)',
        '← ACT': '← AŞAMALAR',
        'The firewall collapsed — rebuild it from scratch': 'Firewall çöktü — baştan yeniden kur',
        'A port was breached — the attackers got in': 'Bir port aşıldı — saldırganlar içeri girdi',
        'CLEARED': 'TEMİZLENDİ',
        'READY': 'HAZIR',

        // Campaign complete
        'CONTROL RETURNED': 'KONTROL GERİ VERİLDİ',
        'ALL {n} ACTS COMPLETE  ·  CLEARANCE {level}': "{n} ACT'İN HEPSİ TAMAMLANDI  ·  YETKİ {level}",
        'Congratulations, Operator. The attacker is out.': 'Tebrikler, Operator. Saldırgan sistemden atıldı.',
        'You purged the malware, rebuilt the firewall and sealed the ports,': "Malware'i temizledin, firewall'u yeniden kurdun ve portları kapattın,",
        'traced the attacker through the logs and cut their access,': "log'lardan saldırganın izini sürüp erişimini kestin,",
        'defused the payload, restored the core and passed the final audit.': "payload'ı etkisiz hale getirdin, çekirdeği geri yükledin ve son denetimi geçtin.",
        'Then you handed the system back to its owner — and taught them to keep it safe.': 'Sonra sistemi sahibine geri verdin — ve ona sistemi güvende tutmayı öğrettin.',
        'ENDLESS MODE UNLOCKED': 'ENDLESS MODE AÇILDI',
        'The attacker never stops coming back. Find the ∞ ring at the end': 'Saldırgan geri gelmekten hiç vazgeçmiyor. Operasyon haritasının',
        'of the operation map — runs and the leaderboard live inside.': 'sonundaki ∞ halkasını bul — koşular ve leaderboard orada.',
        '★ {got}/{max}   ·   TOTAL BEST SCORE  {best}': '★ {got}/{max}   ·   TOPLAM EN İYİ SKOR  {best}',
        '▶  CONTINUE': '▶  DEVAM'
    });
}
