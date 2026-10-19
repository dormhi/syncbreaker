# SyncBreaker: Act Yapısı Planı

> Durum: **Faz 1 uygulandı** (2026-10-19), henüz commit edilmedi.
> Act 3–6'nın oyun mekanikleri henüz kesin değil, sırası gelince birlikte karar verilecek.

## 1. Hedef

Oyun 6 düğümlük düz bir listeden **act tabanlı bir kampanyaya** geçiyor:

- Toplam **6 act** var, her birinin hikayeye uygun bir adı var.
- **Her act tek bir oyundur.** Act'in aşamaları o oyunun artan zorluk kademeleridir.
- **Aşama sayısı oyuna göre 3 ile 5 arasında değişir.** Bazı oyunların doğal olarak daha fazla zorluk kademesi oluyor.
- Bir act'in bütün aşamalarını bitiren oyuncu o act'in görevini tamamlamış olur.
- **Her iki act arasında bir kapı (gate)** var. Sonraki act ancak kapı geçilince açılır.
- Her oyun **mobilde ve masaüstünde** aynı kalitede oynanmalı: dokunma ya da sürükleme, ve klavye ya da fare.
- Act'ler aşama aşama geliştirilir. Hazır olmayan act'ler HUB'da **"IN DEVELOPMENT"** olarak kilitli görünür.

## 2. Hikaye ve act'ler

Ana hikaye şu: sisteme bir saldırgan sızdı. Oyuncu önce enfeksiyonu temizliyor, sonra savunmayı yeniden kuruyor, sonra saldırganın izini sürüp bağlantısını kesiyor.

| Act | Ad | Hikaye | Oyun | Durum |
|---|---|---|---|---|
| 1 | REMOVE_MALWARE | Enfekte düğümleri temizle | **Timing Bar** | ✅ Kesin, 4 aşama |
| 2 | REBUILD_FIREWALL | Firewall'u blok blok yeniden ör | **Stack Overflow** | ✅ Kesin, 3 aşama |
| 3 | CLOSE_PORTS | Açık portlara gelen saldırı paketlerini engelle | Öneri: Orbital Shield | 🛠 Geliştiriliyor |
| 4 | RESET_CREDS | Ele geçirilen kimlik anahtarlarını yeniden senkronla | Öneri: Signal Lock | 🛠 Geliştiriliyor |
| 5 | TRACE_LOGS | Log akışını takip edip saldırganın kaynağını bul | Öneri: Log Router / Patch Launcher | 🛠 Geliştiriliyor |
| 6 | CUT_ACCESS | Saldırganın kablolarını kesip bağlantıyı kopar | Öneri: Cable Cut | 🛠 Geliştiriliyor |

Notlar:
- Ad değişiklikleri: CLEAR_LOGS → TRACE_LOGS ve FIREWALL → REBUILD_FIREWALL. Diğer isimler aynı kaldı.
- Her act eski ikonunu ve renk temasını (`LevelIcons.js`, `LevelThemes.js`) taşır. Bunun için `themeId` kullanılır: REMOVE_MALWARE için 3, REBUILD_FIREWALL için 5, CLOSE_PORTS için 2, RESET_CREDS için 4, TRACE_LOGS için 1, CUT_ACCESS için 6.

## 3. Oyunlar ve zorluk kademeleri

### Act 1: Timing Bar, 4 aşama ✅

| | 1 · Kolay | 2 · Orta | 3 · Zor | 4 · Çok zor |
|---|---|---|---|---|
| **Vuruş** | **8** | **10** | **14** | **18** |
| Bar hızı | 0.7 | 0.9 | 1.1 | 1.25 |
| Hedef alanı | 0.22 | 0.18 | 0.15 | 0.12 |
| Süre | 25 sn | 28 sn | 34 sn | 45 sn |
| Can | 3 | 3 | 3 | 4 |

- Vuruş sayıları kesin. Diğer değerler eski 1–4. seviyelerden türetildi: vuruş başına süre eski seviyelerdeki gibi yaklaşık 2.5 sn.
- Kontrol: Space ya da ekrana dokunma.
- Revive (lockpick) var.

### Act 2: Stack Overflow, 3 aşama ✅

Zorluğu iki şey belirler: **gereken kule yüksekliği** ve **vinç hızı**. Vinç hızı sadece mikro adımlarla artıyor. Diğer her şey (momentum payı %30, blok genişliği 82–116, 3 can) üç aşamada da aynı.

| | 1 · Kolay | 2 · Orta | 3 · Zor |
|---|---|---|---|
| **Hedef yükseklik** | **5 blok** | **7 blok** | **9 blok** |
| **Vinç hızı (ω)** | **1.30** | **1.36** | **1.42** |
| Blok hakkı | 10 | 12 | 14 |
| Can | 3 | 3 | 3 |

- Blok hakkı her aşamada hedefin 5 fazlası.
- Kontrol: Space, tıklama ya da dokunma.
- Revive yok, RETRY var.
- Kabul şartı: bot denge taraması. ±10 px nişanla üç aşama da yüksek oranda kazanılmalı, Zor gözle görülür şekilde daha zor olmalı.

### Act 3–6: Geliştiriliyor 🛠

Mekanikler birlikte kararlaştırılacak. Aşağıdakiler şimdilik sadece fikir:

- **Orbital Shield (Act 3):** çekirdeğin etrafındaki kalkanı döndürüp gelen paketleri sektirmek. ←/→, fare ya da parmakla sürükleme.
- **Signal Lock (Act 4):** basılı tutup bırakarak iki dalgayı çakıştırmak. Space ya da parmakla basılı tutma.
- **Log Router / Patch Launcher (Act 5):** akışı yönlendirmek ya da çek-bırak fırlatma.
- **Cable Cut (Act 6):** Matter.js ile kablo kesme bulmacası. Fare, parmakla kaydırma ya da 1–3 tuşları.

## 4. İlerleme kuralları

- Act içindeki aşamalar sıralı açılır.
- Bütün aşamalar bitince **act tamamlanmış** olur ve sonraki kapı oynanabilir hale gelir.
- Bir act'e girilebilmesi için **önceki kapının açık olması** yeterlidir. Kapı bir kez açıldıysa açık kalır.
- **Kapılar:** 6 act arasında 5 kapı var.
  - Kapı 1 (Act 1→2): Packet Purge, bugünkü haliyle.
  - Kapı 2–5: Packet Purge'ün giderek zorlaşan ayarları (daha çok dalga, daha hızlı paket).
  - Deneme sınırı: her kapı için 3 dakikada 2 deneme (`ChallengeGate`).
  - Sonraki act geliştiriliyorsa kapı oynanamaz.
- **Lockpick (Code Breaker): sadece revive için.** Aşama atlama kaldırıldı.
  - Revive sadece kesintisiz oynanan oyunlarda var (Timing Bar ve Endless). Aşama başına 2 hak, her biri 1 enerji.
  - Lockpick'in zorluğu act numarasına göre seçilir ve biraz kolaylaştırıldı:

    | Zorluk | 1 | 2 | 3 | 4 | 5 | 6 |
    |---|---|---|---|---|---|---|
    | Düğüm | 4→3 | 5→4 | 5→4 | 6→5 | 6→5 | 7→6 |
    | İmleç hızı (°/s) | 70→60 | 90→75 | 110→90 | 130→105 | 160→125 | 200→150 |
    | Tolerans (°) | 28→30 | 24→27 | 20→24 | 16→21 | 13→18 | 10→16 |
- **Endless Mode:** Act 6 bitince açılır. Bugün Endless'ı açmış olan oyuncularda açık kalır, Leaderboard da onlar için görünür kalır.
- **Final ekranı:** "SYSTEM SECURED" ve "Endless unlocked" ekranı Act 6 bitince gösterilir. Diğer act'ler bitince kısa bir "ACT COMPLETE" bildirimi çıkar.

## 5. Kayıt göçü

Mevcut oyuncular ilerlemelerini kaybetmemeli. Yeni kayıt anahtarı `sb_campaign_v1`. Eski anahtarlar (`sb_progress`, `sb_group2_unlocked`, `sb_congrats_seen`) sadece ilk açılışta bir kez okunur.

| Eski kayıt | Yeni kayıt |
|---|---|
| Seviye 1 / 2 / 3 tamamlandı | Act 1 aşama 1 / 2 / 3 tamamlandı, en iyi skorlar taşınır. Aşama 4 yeni olduğu için açık bekler. |
| `sb_group2_unlocked` | Kapı 1 açık, yani Act 2'ye girilebilir |
| Seviye 4 / 5 / 6 tamamlandı | Act 2 aşama 1 / 2 / 3 tamamlandı |
| 6 düğümün hepsi tamamlandı | Endless açık kalır (`endlessUnlocked: true`) |
| `sb_congrats_seen` | Korunur |

Göç tekrar çalıştırılsa sonuç değişmez. Reset butonu yeni anahtarı da siler.

## 6. HUB tasarımı

HUB iki ekrandan oluşur:

1. **Act haritası:** 6 act kartı 3×2 dizilir, "yılan" düzeninde: üst satır 1→2→3, alt satır 4←5←6.
   - Kapı düğümleri kartların arasında durur. Kapı 3, Act 3 ile Act 4 arasında dikey olarak yer alır.
   - Her kartta ikon, ACT numarası, ad, aşama göstergesi (●●○○) ve durum yazar: COMPLETE, IN PROGRESS, LOCKED ya da IN DEVELOPMENT.
   - Haritanın altında Endless ve Leaderboard butonları var. Endless kilitliyse "Complete ACT 6" yazar.
2. **Act ekranı:**
   - Act başlığı ve hikaye metni, oyunun kontrol ipucu.
   - 3–5 aşama kartı: durumları ve en iyi skorlarıyla.
   - Act tamamlanmış ve kapı henüz geçilmemişse bir "BREACH GATE → ACT N" butonu.
   - "← ACTS" butonu. Escape de geri götürür.

Mobil ve masaüstü kuralları:
- Dokunma hedefleri en az 44 px (ölçeklenmiş canvas'ta).
- HUB klavyeyle de gezilebilir: ok tuşlarıyla seçim, Enter ile giriş, Escape ile geri.

## 7. Teknik mimari

| Parça | Görevi |
|---|---|
| `js/data/Campaign.js` | Act, aşama ve kapı tanımları. Tek doğru kaynak bu dosya. |
| `js/CampaignProgress.js` | İlerleme, kilit kuralları, kayıt ve göç. |
| `js/core/GameRegistry.js` | Oyun anahtarını çalıştırma şekline bağlar: Timing Bar `LEVEL` durumunda, diğer oyunlar `MINIGAME` durumunda çalışır. Hangi oyunun revive desteklediği de burada tanımlı. |
| `LevelManager` | Sadece Timing Bar ve Endless oynanışını yürütür. `startStage(cfg)` ile çalışır. |
| `UIManager` | Butonlar ve klavye odağı. |
| `InputManager` | Faz 2'de iki yetenek eklenecek: bırakma (basılı tutma için) ve fareyle sürükleme. |

Her oyun `Mechanic` sözleşmesine uyar: `init / update(fixedDt) / render(ctx, W, H, gameTime, alpha) / handleKey / handlePointer / result / score`. Render her zaman interpolasyonlu, girdi her zaman alt-kare hassasiyetli.

## 8. Fazlar

Her fazın kabul şartları:
- Testler yeşil (`node tests/run.js`).
- Yeni oyun için bot denge taraması yapılmış.
- Mobilde (844×390) ve masaüstünde elle kontrol edilmiş.

| Faz | Kapsam | Durum |
|---|---|---|
| **1** | Kampanya altyapısı ve kayıt göçü. Act haritası ve act ekranı. Act 1 Timing Bar (4 aşama), Act 2 Stack Overflow (3 aşama), Kapı 1. Act 3–6 "IN DEVELOPMENT". Lockpick sadece revive. Klavye ile HUB. | ✅ Uygulandı |
| 2 | Act 3: mekanik birlikte kararlaştırılacak. `InputManager` genişletmesi. Kapı 2. | Bekliyor |
| 3 | Act 4 ve Kapı 3 | Bekliyor |
| 4 | Act 5 ve Kapı 4 | Bekliyor |
| 5 | Act 6, Kapı 5 ve final ekranı. Endless yeni oyuncular için açılır. | Bekliyor |

## 9. Kararlar

**2026-10-19**
1. Act isimleri Bölüm 2'deki tablodaki gibi.
2. Act'ler 3–5 aşamalı olabilir.
3. Act 1: Timing Bar, 4 aşama. Vuruşlar 8 / 10 / 14 / 18.
4. Act 2: Stack Overflow, 3 aşama. Zorluk kule yüksekliği ve mikro artan vinç hızıyla belirleniyor.
5. Kapı 2–5: giderek zorlaşan Packet Purge.
6. Lockpick sadece revive için ve biraz kolaylaştırıldı.
7. Endless Act 6 bitince açılır, zaten açmış olanlarda açık kalır.
8. Act 3–6 "IN DEVELOPMENT" olarak gösterilir. Mekanikleri birlikte kararlaştırılacak.
