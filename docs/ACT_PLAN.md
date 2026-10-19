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
| 3 | CLOSE_PORTS | Açık portlara gelen saldırı paketlerini engelle | **Orbital Shield** | ✅ Kesin, 4 aşama (Faz 2'de uygulandı) |
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

### Act 3: Orbital Shield, 4 aşama ✅ (mekanik kesin, 2026-10-19)

**Sahne:** ortada çekirdek, etrafında bir halka. Halkanın üzerinde eşit aralıklı portlar var. Halka üzerinde **portlara kilitlenen** bir kalkan duruyor.

**Akış:**
- Bir saldırı paketi yola çıkmadan önce hedef portu kısaca yanıp söner.
- Paket dışarıdan o porta doğru uçar.
- Kalkan o portun önündeyse paket seker ve "engellendi" sayılır.
- Kalkan orada değilse paket porta girer ve bir can gider.
- **Kazanma:** N paketi engellemek. Ekranda bir ilerleme çubuğu var.
- **Kaybetme:** canlar biterse. Can sayısı aşamaya göre değişiyor, tabloya bak.

**Kontroller:** kalkan portlar arasında atlar, serbest dönmez. Böylece klavye ve dokunmatik eşit derecede adil.
- Klavye: ← / → (ya da A / D) bir porta atlatır.
- Fare: porta tıklamak.
- Dokunmatik: porta dokunmak.

**Revive:** var (lockpick), çünkü kesintisiz oynanan bir oyun.

| | 1 · Kolay | 2 · Orta | 3 · Zor | 4 · Çok zor |
|---|---|---|---|---|
| Port | 4 | 6 | 8 | 8 |
| Paket hızı | yavaş | orta | hızlı | **Zor ile aynı** |
| Engellenecek paket | 12 | 16 | 20 | **Zor ile aynı (20)** |
| Uyarı (yanıp sönme) | uzun | kısa | kısa | kısa |
| Burst (aynı porta art arda 3) | – | – | var | var |
| Hedef değiştiren paket | – | – | – | **var, rastgele çıkar** |
| Can | **4** | **5** | **6** | **7** |

- Çok zor, Zor'un aynısıdır. Farkları: rastgele çıkan bazı paketler yolda hedef portunu değiştirir, 1 can fazladır ve paketler biraz daha yavaştır (245 px/s, Zor'da 270).
- Canlar ilk oyun testinden sonra 3'ten 4 / 5 / 6 / 7'ye çıkarıldı (2026-10-19: "3 can yetersiz"). Gerekirse oyun testlerine göre değişebilir.
- İkinci oyun testinden sonra Çok zor'un paket hızı 270'ten 245'e düşürüldü (2026-10-19: "imkansız değil ama hala sağlam zor"). Değiştirirken yeni hedef port da yanıp söner, böylece oyuncu tepki verebilir.
**Kesin sayılar** (bot denge taramasıyla belirlendi, `js/data/Campaign.js`):

| | Kolay | Orta | Zor | Çok zor |
|---|---|---|---|---|
| Paket hızı (px/s) | 150 | 210 | 270 | **245** |
| Uyarı (sn) | 0.6 | 0.35 | 0.3 | 0.3 |
| Varışlar arası boşluk (sn) | 0.8–1.2 | 0.55–0.85 | 0.42–0.68 | 0.42–0.68 |
| Kalkanın port başına geçiş payı (sn) | 0.12 | 0.1 | 0.1 | 0.1 |
| Burst ihtimali | – | – | %25 | %25 |
| Hedef değiştirme ihtimali | – | – | – | %35 |

**Adalet kuralları:**
- Paketler varış zamanına göre planlanır. Art arda iki varış arasında, kalkanın aradaki portları geçmesine yetecek pay her zaman bırakılır.
- Hedef değiştiren paket sadece komşu porta geçer. Bunu yolun %40'ında yapar ve yeni port da yanıp söner.

**Denge sonucu** (insana benzer bot, aşama başına 30 deneme):

| Bot | Kolay | Orta | Zor | Çok zor |
|---|---|---|---|---|
| Hızlı (0.2 sn tepki) | 30/30 | 30/30 | 30/30 | 30/30 |
| Ortalama (0.3 sn tepki) | 30/30 | 30/30 | 30/30 | 30/30 |
| Yavaş (0.4 sn tepki) | 30/30 | 30/30 | 30/30 | 21/30 |

Yukarıdaki sonuçlar 4 / 5 / 6 / 7 canla ve Çok zor'da 245 px/s hızla ölçüldü. 270 px/s'de Çok zor sonuçları şöyleydi: ortalama oyuncu 29/30 (ortalama 2.9 can kaybı), yavaş oyuncu 15/30. 3 canla sonuçlar şöyleydi: ortalama oyuncu Zor'da 29/30, Çok zor'da 12/30; yavaş oyuncu Zor'da 20/30, Çok zor'da 1/30.

### Act 4–6: Geliştiriliyor 🛠

Mekanikler birlikte kararlaştırılacak. Aşağıdakiler şimdilik sadece fikir:

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
  - Revive sadece kesintisiz oynanan oyunlarda var: Timing Bar, Orbital Shield ve Endless. Aşama başına 2 hak, her biri 1 enerji. Orbital Shield'da başarılı bir kurtarmadan sonra oyun aynı yerden 1 canla devam eder.
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
| 2 | Act 3 Orbital Shield (4 aşama, bölüm 3). Kapı 2 (Act 2 → 3). Kalkan portlara kilitlendiği için InputManager'a sürükleme gerekmiyor, dokunma ve tıklama yeterli. | ✅ Uygulandı |
| 3 | Act 4 ve Kapı 3 | Bekliyor |
| 4 | Act 5 ve Kapı 4 | Bekliyor |
| 5 | Act 6, Kapı 5 ve final ekranı. Endless yeni oyuncular için açılır. | Bekliyor |

## 8b. Endless Mode değişecek (henüz planlanmadı)

Endless Mode bugünkü haliyle sadece Timing Bar üzerine kurulu. **Değişecek:** hedef, kampanyadaki **bütün oyunları destekleyen** bir sonsuz mod. Detaylar daha sonra ayrıca planlanacak.

Şimdilik kesin olan:
- Endless'ın açılma koşulu (Act 6) ve leaderboard sistemi (isim + şifre) aynı kalıyor.
- Yeni oyunlar tasarlanırken sonsuz bir modda da çalışabilecekleri göz önünde tutulmalı. Yani zorluğun sürekli artırılabilir olması ve skor üretebilmeleri gerekiyor.

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
10. **Endless Mode değişecek:** bütün oyunları destekleyen bir sonsuz mod olacak. Henüz planlanmadı, sonra ayrıca planlanacak (bölüm 8b).
9. **Act 3 (Faz 2):** Orbital Shield, portlara kilitlenen kalkan. Kazanma koşulu N paket engellemek. 4 aşama: port sayısı 4 / 6 / 8 / 8, engellenecek paket 12 / 16 / 20 / 20. Zor ve Çok zor aynı ayarlarda oynanıyor, Çok zor'a rastgele çıkan ve yolda hedef değiştiren paketler ekleniyor.
