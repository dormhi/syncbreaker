# SyncBreaker — Türkçe dil desteği planı

> Durum (2026-10-25): **Faz 1 uygulandı ve commit edildi (push yok)** (dosyalar: `js/core/I18n.js`, `js/i18n/tr.js`, `docs/I18N_PLAN.md` ve `GameManager` / `UITheme` / `UIManager` / `TipBar` / `Coach` / `InputManager` / `css/style.css` / `index.html` / testlerdeki değişiklikler; 1077 test geçiyor). Sıradaki: **Faz 2**, kullanıcının onayıyla. Fazlar sırayla, her biri kullanıcı onayıyla ilerler; her fazdan sonra kullanıcı commit / yayın kararı verir.

## 1. Kurallar (kullanıcı, 2026-10-25)

- **Dil düğmesi:** ana menüde, dormhi.com'a giden yuvarlak rozetin **birebir aynısı** bir düğme. Dokununca Türkçe / English seçici açılıyor.
- **Jargon İngilizce kalır.** Türkçe konuşan bir oyuncunun zaten İngilizce bildiği terimler çevrilmez ("backend"e "arka yüz" demek gibi hatalar yapılmaz). Liste bölüm 3'te.
- **Level adları İngilizce kalır:** act adları (REMOVE_MALWARE, CUT_ACCESS…), oyun adları (Timing Bar, Network Cut…), aşama adları (EASY, NORMAL, HARD, VERY HARD, EXPERT; Act 10'da SCAN, PASSWORD…).
- **Çevrilenler:** içerikler ve anlatımlar, TIP satırları, oyun kılavuzu (field guide), dersler ve öğretici kartlar, menü ve HUB yazıları, düğmeler.
- **Yazılar sığmalı.** Türkçe metin genelde daha uzun. Sığmayan yer yeniden boyutlandırılır ya da sarılır (wrap), metin kesilmez. Her faz telefonda (844×390) ve masaüstünde kontrol edilir.
- **Doğal çeviri:** kelimesi kelimesine değil, o anlamı Türkçede doğal anlatan ifadelerle. Kısa, oyun diline uygun, "sen" diliyle.

## 2. Teknik yapı (Faz 1)

- `js/core/I18n.js`: dil durumu ve `I18n.t(metin, değişkenler)`. Sözlük **İngilizce kaynak metni anahtar** olarak kullanır: çevirisi olmayan metin İngilizce kalır, bu yüzden fazlar arasında oyun hiçbir zaman bozuk görünmez.
- Değişkenli metinler `{n}` gibi yer tutucularla: `I18n.t('Land {n} hits', { n: 8 })`.
- Sözlük: `js/i18n/tr.js` (fazlar ilerledikçe bölümlere ayrılarak büyür).
- Seçilen dil `sb_lang` anahtarında saklanır. İlk açılışta tarayıcı dili Türkçe ise Türkçe, değilse İngilizce.
- Dil düğmesi sadece ana menüde (dormhi rozetinin sağında); seçim anında uygulanır, sayfa yenilemeye gerek yok. Menü başlığında CSS büyük harf dönüşümü yok: Türkçe "Dil" → "DIL" olurdu, "DİL" değil. Büyük harf gereken Türkçe yazılar sözlükte büyük harfle yazılır.
- Standart düğmelerde uzun Türkçe etiketler sığmazsa yazı %70'e kadar küçülür (`UITheme.fitFont`).
- Ortak çizim noktaları çeviriden geçer: `Coach` baloncukları (Act 1–5, 9, 10 dersleri), `TipBar`, görev çerçevesi (`MissionMechanic`), standart düğmeler. Böylece bu yerlerdeki metinler sadece sözlüğe eklenerek çevrilir.

## 3. İngilizce kalacak terimler (sözlük)

| Tür | Terimler |
|---|---|
| Act ve aşama adları | REMOVE_MALWARE … RETURN_CONTROL, EASY / NORMAL / HARD / VERY HARD / EXPERT, SCAN / PASSWORD / TWO-STEP / PHISHING / UPDATES / BACKUPS |
| Oyun adları | Timing Bar, Stack Overflow, Orbital Shield, Signal Lock, Route Trace, Network Cut, Logic Bomb, Defrag, Checksum Grid, Packet Purge, Code Breaker, Dual Ring |
| Güvenlik jargonu | malware, firewall, port, packet, payload, core, backdoor, phishing, ransomware, 2FA, antivirus, exploit, patch |
| Oyun terimleri | PERFECT, COMBO, STRIKE, AUDIT, Endless Mode, leaderboard, operator, checksum, SYNC, CLK, SIG |
| Arayüz | ⏸, ✕, ENERGY simgeleri, sayılar ve birimler |

Doğal Türkçe karşılığı yaygın olanlar çevrilir: güncelleme (update), yedek (backup), parola (password), parola yöneticisi (password manager), oltalama yerine phishing kalır; karantina, virüs, şifreleme Türkçe.

## 4. Fazlar

| Faz | Kapsam | Durum |
|---|---|---|
| **1** | Altyapı (`I18n`), dil düğmesi + seçici, sözlük dosyası, ortak çizim noktalarının çeviriden geçmesi. Metin çevirisi yok (sadece seçicinin kendi yazıları). | ✅ Uygulandı |
| 2 | Ana menü, durum raporu, HUB (harita, kartlar, ray), act ekranı, kapılar, duraklatma paneli, oyun sonu / sonuç ekranları, enerji ve recovery mesajları, tebrik ekranı. | Bekliyor |
| 3 | TIP satırları (`TipBar.MAP`, `TipBar.ACT`, `TipBar.RULES`), oyun kılavuzu (`GUIDE_PAGES`), act hikâyeleri, kontrol ve alt ipucu satırları (`Campaign.js`). | Bekliyor |
| 4 | Act 1–5: dersler ve oyun içi yazılar (HUD, mesajlar). | Bekliyor |
| 5 | Act 6–8: Network Cut, Logic Bomb (kural kartı üretici dahil), Defrag. | Bekliyor |
| 6 | Act 9 Checksum Grid ve Act 10 görevleri (en çok içerik). | Bekliyor |
| 7 | Kalanlar: Endless, leaderboard, operatör profili formu (DOM), lockpick / Code Breaker, Dual Ring, Packet Purge. Son kontrol: bütün ekranlar iki dilde, telefon ve masaüstü. | Bekliyor |

## 5. Bir faza başlarken / devam ederken (notlar)

- Metni çevirmek için kodda değiştirilecek tek şey, metnin çizildiği yerde `I18n.t(...)` (ya da `UITheme.t`) kullanmak; çevirinin kendisi `js/i18n/tr.js`'e, o fazın başlığı altında eklenir. Anahtar İngilizce metnin **birebir** aynısı olmalı (boşluk, büyük harf, noktalama dahil); yoksa İngilizce görünür.
- Şablonlu metinler (`` `ACT ${n} COMPLETE` `` gibi) önce yer tutuculu hale getirilir: `I18n.t('ACT {n} COMPLETE', { n })`.
- Ders baloncukları (`Coach`), TIP satırları, görev ekranları (`MissionMechanic.text`) ve standart düğmeler zaten çeviriden geçiyor: bunlar için sadece sözlük yeterli.
- Türkçe büyük harf: sözlükte doğru yazılır ("İ", "I"); `toUpperCase()` ya da CSS `text-transform` kullanılmaz (`'i'.toUpperCase()` → "I" olur, "İ" değil).
- Her fazın sonunda: testler (`node tests/run.js`), sonra tarayıcıda iki dilde telefon (844×390) ve masaüstü kontrolü; sığmayan yazı küçültülür ya da sarılır.
- Tarayıcı panelinin dili Türkçe: ilk açılışta oyun Türkçe başlar. Test kaydında `sb_lang` en son `en` bırakıldı.
- Dil düğmesi: `GameManager._setLangButton` (ana menüde dormhi rozetinin sağında), stil `css/style.css` (`.sb-lang`, `.sb-lang-menu`).
