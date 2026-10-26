# SyncBreaker — Türkçe dil desteği planı

> Durum (2026-10-26): **Tamamlandı ve yayında.** Yedi faz ve son tarama commit edildi, `v2` ile yayına alındı. Bundan sonra **her yeni özellik iki dili de destekler** (bölüm 0).

## 0. Yeni özellik eklerken (kural, kullanıcı 2026-10-26)

Oyun artık iki dilli: **İngilizce ve Türkçe**. Bundan sonraki bütün eklemeler (yeni oyun, ekran, ders, mesaj, düğme, Endless'ın yeni hâli, dik ekran düzeni…) **iki dili de baştan destekler**. "Önce İngilizce, Türkçesi sonra" yok: bir özellik ancak iki dilde de hazırsa bitmiş sayılır.

Kontrol listesi:
1. Oyuncunun gördüğü her metin çeviriden geçer: `UITheme.t` / `I18n.t`, ders adımları `Coach` (adımda `vars`), ipuçları `TipBar` (`{ text, vars }`), düğme etiketleri kendiliğinden. Sayılı ya da adlı metinler yer tutucuyla yazılır (`'Land {n} hits'`), parça parça birleştirilmez.
2. Türkçe girdiler **aynı değişiklikte** `js/i18n/tr.js`'e, o özelliğin başlığı altında eklenir. Bölüm 1 ve 3'teki kurallar geçerli: jargon ve level / oyun adları İngilizce, aşama adları Türkçe, "kampanya" ve "koşu" yok, doğal ve kısa "sen" dili.
3. Türkçe metin üzerinde `toUpperCase` / `toLowerCase` ve CSS `text-transform` kullanılmaz (İ / ı bozulur). Büyük harf gereken Türkçe sözlükte büyük harfle yazılır.
4. Canvas fontu `'Orbitron, OrbitronTR'` (ya da `UITheme.font(…, 'Orbitron')`): Orbitron'da Ğ yok.
5. Yazı her iki dilde de sığmalı: gerekirse `UITheme.fitFont` ile küçülür ya da sarılır; kesilmez, `fillText(…, maxWidth)` ile sıkıştırılmaz.
6. `node tests/run.js` geçmeli. I18n test grupları kaynak dosyaları tarar ve bütün aşamaları Türkçe oynatır; yeni dosyalar ilgili test listelerine eklenir. Yeni bir oyun, tarama testinin oynattığı aşamalara kendiliğinden girer.
7. Yeni ekranlar tarayıcıda iki dilde, telefonda (844×390) ve masaüstünde kontrol edilir.

## 1. Kurallar (kullanıcı, 2026-10-25)

- **Dil düğmesi:** ana menüde, dormhi.com'a giden yuvarlak rozetin **birebir aynısı** bir düğme. Dokununca Türkçe / English seçici açılıyor.
- **Jargon İngilizce kalır.** Türkçe konuşan bir oyuncunun zaten İngilizce bildiği terimler çevrilmez ("backend"e "arka yüz" demek gibi hatalar yapılmaz). Liste bölüm 3'te.
- **Level adları İngilizce kalır:** act adları (REMOVE_MALWARE, CUT_ACCESS…), oyun adları (Timing Bar, Network Cut…), Act 10'un görev adları (SCAN, PASSWORD…).
- **Aşama adları Türkçe (kullanıcı, 2026-10-26):** EASY → **KOLAY**, NORMAL → **ORTA**, HARD → **ZOR**, VERY HARD → **ÇOK ZOR**, EXPERT → **UZMAN**. Sadece çizilirken çevrilir; verideki `tier` İngilizce kalır (yıldız kuralları ve rozetler onunla çalışır). Cümle içinde de Türkçe adı kullanılır ("UZMAN aşamasında…").
- **"Kampanya" ve "koşu" kullanılmaz (kullanıcı, 2026-10-26):** campaign → **operasyon** ("Operasyon tamamlandı", "OPERASYONDAN SONRA"), Endless "run" → **oyun** / **rekor** ("OYUN BİTİRİLSİN Mİ?", "ENDLESS REKORU", "HENÜZ OYNANMADI").
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
| Act ve görev adları | REMOVE_MALWARE … RETURN_CONTROL, SCAN / PASSWORD / TWO-STEP / PHISHING / UPDATES / BACKUPS |
| Oyun adları | Timing Bar, Stack Overflow, Orbital Shield, Signal Lock, Route Trace, Network Cut, Logic Bomb, Defrag, Checksum Grid, Packet Purge, Code Breaker, Dual Ring |
| Güvenlik jargonu | malware, firewall, port, packet, payload, core, backdoor, phishing, ransomware, 2FA, antivirus, exploit, patch |
| Oyun terimleri | PERFECT, COMBO, STRIKE, AUDIT, Endless Mode, leaderboard, operator, checksum, SYNC, CLK, SIG |
| Arayüz | ⏸, ✕, ENERGY simgeleri, sayılar ve birimler |

Doğal Türkçe karşılığı yaygın olanlar çevrilir: güncelleme (update), yedek (backup), parola (password), parola yöneticisi (password manager), oltalama yerine phishing kalır; karantina, virüs, şifreleme Türkçe.

## 4. Fazlar

| Faz | Kapsam | Durum |
|---|---|---|
| **1** | Altyapı (`I18n`), dil düğmesi + seçici, sözlük dosyası, ortak çizim noktalarının çeviriden geçmesi. Metin çevirisi yok (sadece seçicinin kendi yazıları). | ✅ Uygulandı |
| **2** | Ana menü, durum raporu, HUB (harita, kartlar, ray), act ekranı, kapılar, duraklatma paneli, oyun sonu / sonuç ekranları, enerji ve recovery mesajları, tebrik ekranı. | ✅ Uygulandı |
| **3** | TIP satırları (`TipBar.MAP`, `TipBar.ACT`, `TipBar.RULES`), oyun kılavuzu (`GUIDE_PAGES`), act hikâyeleri, kontrol ve alt ipucu satırları (`Campaign.js`). | ✅ Uygulandı |
| **4** | Act 1–5: dersler ve oyun içi yazılar (HUD, mesajlar). | ✅ Uygulandı |
| **5** | Act 6–8: Network Cut, Logic Bomb (kural kartı üretici dahil), Defrag. | ✅ Uygulandı |
| **6** | Act 9 Checksum Grid ve Act 10 görevleri (en çok içerik). | ✅ Uygulandı |
| **7** | Kalanlar: Endless, leaderboard, operatör profili formu (DOM), lockpick / Code Breaker, Dual Ring, Packet Purge. Son kontrol: bütün ekranlar iki dilde, telefon ve masaüstü. | ✅ Uygulandı |

## 5. Bir faza başlarken / devam ederken (notlar)

- Metni çevirmek için kodda değiştirilecek tek şey, metnin çizildiği yerde `I18n.t(...)` (ya da `UITheme.t`) kullanmak; çevirinin kendisi `js/i18n/tr.js`'e, o fazın başlığı altında eklenir. Anahtar İngilizce metnin **birebir** aynısı olmalı (boşluk, büyük harf, noktalama dahil); yoksa İngilizce görünür.
- Şablonlu metinler (`` `ACT ${n} COMPLETE` `` gibi) önce yer tutuculu hale getirilir: `I18n.t('ACT {n} COMPLETE', { n })`.
- Ders baloncukları (`Coach`), TIP satırları, görev ekranları (`MissionMechanic.text`) ve standart düğmeler zaten çeviriden geçiyor: bunlar için sadece sözlük yeterli.
- Türkçe büyük harf: sözlükte doğru yazılır ("İ", "I"); `toUpperCase()` ya da CSS `text-transform` kullanılmaz (`'i'.toUpperCase()` → "I" olur, "İ" değil).
- Her fazın sonunda: testler (`node tests/run.js`), sonra tarayıcıda iki dilde telefon (844×390) ve masaüstü kontrolü; sığmayan yazı küçültülür ya da sarılır.
- Tarayıcı panelinin dili Türkçe: ilk açılışta oyun Türkçe başlar. Test kaydında `sb_lang` en son `en` bırakıldı.
- Dil düğmesi: `GameManager._setLangButton` (ana menüde dormhi rozetinin sağında), stil `css/style.css` (`.sb-lang`, `.sb-lang-menu`).
- **Font: Orbitron'da Ğ / ğ yok** (Google'ın Orbitron'u sadece latin alt kümesi). Ş ve İ'yi tarayıcı Orbitron'un S / I harfine işaret ekleyerek kuruyor, ama Ğ tırnaklı bir yedek fontla çiziliyordu. Çözüm: `css/style.css`'te `OrbitronTR` adlı bir yüz (Audiowide'ın latin-ext dosyası, sadece U+011E-011F); bütün canvas font dizeleri `Orbitron, OrbitronTR` (`UITheme.font` / `UITheme.family`). Yeni kodda da Orbitron her zaman böyle yazılmalı. Bu yüzü doğrudan `Orbitron` ailesine eklemek denendi: Chrome bu sefer Orbitron'u hiç yüklemedi, geri alındı.
- Durum raporu ve tebrik ekranındaki satırlar, uzun Türkçe metinde `UITheme.fitFont` ile küçülür; duraklatma panelinin başlığı ve sonuç damgası (ACCESS GRANTED) da öyle.
- Türkçe ekler sayıdan sonra değişir (ACT 2'ye, 6'ya, 10'a): sayılı metinler ek gerektirmeyecek şekilde kuruldu ("Kapıyı kır: KAPI 6 → ACT 7", "Endless Mode, ACT 10 bitince açılır").
- Faz 2 sözcük seçimleri (kullanıcı onayına açık): gate → **KAPI**, stage → **aşama**, act → **ACT** (ekranda), "← ACTS" → **← HARİTA**, "← ACT" (başarısızlık ekranı) → **← AŞAMALAR**, SECURED → **GÜVENDE**, ACCESS GRANTED → **ERİŞİM SAĞLANDI**, CLEARANCE → **YETKİ** (seviye adları L4 OPERATOR gibi İngilizce), packet → **PAKET**. Katman adları (PERIMETER, INTERNAL, CORE, HANDOVER) İngilizce kaldı.
- Test: `tests/run.js` "phase 2" grubu, Faz 2 dosyalarında `UITheme.t('…')` ile geçen her metnin Türkçesi olduğunu ve yer tutucuların (`{n}`) korunduğunu denetler. Sonraki fazlarda dosya listesine o fazın dosyaları eklenir.
- Faz 3: TIP satırı `{ text, vars }` da olabilir (yer tutuculu ipucu, ör. "Endless Mode, ACT {n} bitince açılır"); rehber maddeleri de `vars` taşıyabilir. Rehber metni Türkçede uzadığı için en fazla 8 satıra sarılır (sayfa kayar). Act kartındaki hikâye 316 px'e sığmalı: uzun Türkçe hikâyeler kısaltıldı, sığmazsa yazı küçülür. Rehberde oyun adları ve tuş adları (SPACE, Esc, H) İngilizce kalır; "line" (nonogram) **satır** diye çevrildi. Route Trace tahtasındaki YOU / ATTACKER etiketleri ipuçlarında İngilizce geçiyor; Faz 4'te tahtada çevrilirse ipuçları da güncellenmeli. Act 10 ipucundaki "TASK line" → **Görev satırı** (görev çerçevesi Faz 6'da çevrilince aynı kelime kullanılmalı).
- Test: "phase 3" grubu bütün TIP / RULES satırlarının, act hikâye / kontrol / ipucu satırlarının ve rehber metinlerinin Türkçesi olduğunu, rehberin Türkçe çizildiğini ve hiçbir satırın "…" ile kesilmediğini denetler.
- Faz 4: `Coach` adımları da `vars` taşıyabilir (`{ text: 'Land {n} hits', vars: { n } }`); sayılı ders metinleri böyle yazılır. Timing Bar'ın vuruş kelimeleri (`LevelThemes` `hitWords`: PURGED, SEALED…) çevrildi; PERFECT / GOOD / MISS İngilizce kaldı. Kelime seçimleri: STACK LIMIT → **SINIR ÇİZGİSİ**, FRAMES → **BLOK**, BLOCKED → **ENGELLENEN**, KEYS → **ANAHTAR**, TRACES → **İZ**, s → **sn**. Oyun adı olan sonuç yazısı STACK OVERFLOW, ayrıca SYNC / SYNCING, CORE ve Route Trace tahtasındaki **YOU / ATTACKER** etiketleri İngilizce kaldı (ATK / CORE gibi kısa tahta etiketleri; ders ve ipuçları da bu adlarla anlatıyor). Endless'ın oyun içi yazıları (WAVE, BEST) Faz 7'de.
- Test: "phase 4" grubu Act 1–5 dosyalarındaki çizilen metinlerin ve ders adımlarının (text / desktop / touch) Türkçesini, vuruş kelimelerini ve ders yer tutucularını denetler.
- Faz 5: **Logic Bomb kural kartları oyuncunun dilinde üretilir** (`lbT`, modül oluşurken; dil sadece ana menüde değişir). Cümleler Türkçe kalıplardan kurulur ("EĞER hiç KIRMIZI hat yoksa → ilk MAVİ hattı kes"), kural kontrolü ve çözücü metne bakmadığı için aynı tohum iki dilde aynı kartı verir. Kılavuzdaki renkli kelimeler Türkçe renk adlarını da tanır (KIRMIZI, MAVİ, SARI, BEYAZ, YEŞİL), pembe kelimeler EĞER / YOKSA / ADIM. Düğme yazıları da çevrildi (ABORT → İPTAL, HOLD → BEKLE, DETONATE → PATLAT, PRESS → BAS; Faz 3'teki TRIGGER ipucu da PATLAT'a güncellendi). İngilizce kalanlar: modül adları ve başlıkları (LINES, TRIGGER, CIPHER, SWITCH, DATA LINES, KILL SWITCH…), MANUAL, STRIKE / STRIKES, SIG ve bayraklar (NET, SYS…), PAYLOAD; Network Cut'ta ATK / CORE / OWNER tahta etiketleri; Defrag'da CLEAN SNAPSHOT ve TRASH.
- Test: "phase 5" grubu üç oyunun metinlerini (ders adımları, açıklamalar, mesajlar, kılavuz hedefleri, renk açıklamaları) ve Türkçe üretilen yüzlerce Logic Bomb kural kartında İngilizce kalıp kalmadığını denetler.
- Faz 6: Görevlerin çizim yardımcıları (`hmText`, `hmPanel`, görev çerçevesi) çeviriden geçer; sayılı ve adlı cümleler yer tutuculu anahtarlarla kurulur (`hmT('Scan packet {n}: {name}', …)`). Veriler (dosya kaynakları, notlar, e-posta adı / konu / gövde / açıklama, program adları ve riskleri, yedek yerleri) çevrilir; **e-posta adresleri, gerçek bağlantı adresleri, dosya adları, sürüm numaraları ve eski parolalar olduğu gibi kalır** (phishing dersi bunlara bakarak verilir). Parola cümlesi kelimeleri de Türkçe (nehir, lamba…). Türkçe metinde `toLowerCase` kullanılmaz: küçük harfli hâl ayrı anahtar (`documents`, `in centuries`). İngilizce kalanlar: görev / aşama adları (SCAN, PASSWORD…), PHISHING, AUDIT, PayPal. "SAFE" artık her yerde **GÜVENLİ** (Network Cut'taki CORE etiketi dahil).
- Görev geri bildirim satırı uzun metinde iki satıra bölünür (sıkıştırılmaz); Checksum Grid'in HEDEF kutusundaki satır kutuya sığacak kadar küçülür (İngilizcesi de kutuya ancak sığıyordu).
- Test: "phase 6" grubu Checksum ve görev dosyalarındaki bütün metin dizelerini (yorumlar hariç) tarar; kod kelimeleri, dosya adları, adresler ve kural gereği İngilizce kalanlar dışında hepsinin Türkçesi olmalı. Altı görevin GÖREV satırı Türkçe çizilmeli.
- Faz 7: Profil formu (DOM) her açılışta yeniden kurulduğu için yazıları, yer tutucuları ve durum mesajları çevriden geçer (`ProfileForm.t`); sunucu mesajları (`LeaderboardService.friendlyError`) gösterildikleri yerde çevrilir, durum metinleri İngilizce anahtar olarak saklanır (renk kontrolü gibi kodlar onlara bakar). Endless "run" burada da **oyun** (BAŞLA, "bir Endless oyununu bitir"). İngilizce kalanlar: Endless Mode, ENDLESS OPERATOR, LEADERBOARD, OPERATOR, CODE BREAKER.
- **Aşama adı çakışması:** profil formundaki "PASSWORD" alanı PAROLA olarak çevrilince Act 10'un PASSWORD görev adı da çevrilecekti. Aşama adları artık `UITheme.tierName` ile çizilir: sadece EASY…EXPERT çevrilir, görev adları İngilizce kalır.
- Son kontrol (2026-10-26, telefon 844×390 ve masaüstü): Endless lobisi, Endless oyunu ve sonuç ekranı, duraklatma uyarısı, profil formu Türkçe; dil düğmesiyle İngilizceye anında geçiş. Leaderboard ve profil ekranı canlı Supabase'e bağlandığı için tarayıcıda açılmadı (testle kontrol edildi); Endless sadece isabetsiz oynandı (skor gönderilmedi). Bütün düğme etiketleri testle denetleniyor; çeviriden geçmeyen tek çizimler sayılar, act / oyun adları ve kural gereği İngilizce etiketler (CORE, MANUAL, PAYLOAD, katman adları).
- Çeviriden bağımsız, sonraya kalan iki gözlem: Code Breaker ipuçları dokunmatikte de "ok tuşuna bas" diyor (dokunmatikte kaydırılıyor); Endless'tan isteyerek çıkınca da "Recovery protocol failed / Kurtarma protokolü başarısız" yazıyor.
- Test: "phase 7" grubu Faz 7 dosyalarının çizilen metinlerini, **oyundaki bütün düğme etiketlerini**, profil formunu ve sunucu mesajlarını denetler.
- **Son tarama (2026-10-26, kullanıcı oynadıktan sonra):** her act'in her aşaması Türkçe ve İngilizce, rastgele dokunuş / tuşlarla otomatik oynatıldı; ekrana çizilen her yazı toplandı (yaklaşık 2300 farklı yazı), sonra gerçek fontlarla tarayıcıda ölçüldü. Unutulmuş çeviri, doldurulmamış yer tutucu ve İngilizce oyunda Türkçe sızıntı çıkmadı. Bulunup düzeltilenler: Logic Bomb kılavuzundaki "ADIM 2 — BASILI MI TUTUYORSUN?…" satırı ekrandan taşıyordu (artık sarılıyor); virüs taraması görevindeki gönder düğmesi sıkışıyordu ("TEMİZLERİ GÖNDER"). Testlere hafif bir sürümü eklendi: "every stage played in Turkish…" grubu bütün aşamaları oynatıp Türkçesi olduğu hâlde İngilizce çizilen metni ve bozuk değerleri yakalar.
