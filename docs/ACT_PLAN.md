# SyncBreaker: Act Yapısı Planı

> Durum: Act 1–5 oynanabilir (Faz 1–4 uygulandı). Kampanya **10 act**'e çıktı (9'a 2026-10-21'de, 10'a 2026-10-23'te).
> Act 6–10'un oyun mekanikleri sırası gelince birlikte kararlaştırılacak.

## 1. Hedef

Oyun 6 düğümlük düz bir listeden **act tabanlı bir kampanyaya** geçiyor:

- Toplam **10 act** var, her birinin hikayeye uygun bir adı var. İlk planda 6 act vardı, 2026-10-21'de 9'a, 2026-10-23'te 10'a çıkarıldı. 10. act final act'tir.
- **Her act tek bir oyundur.** Act'in aşamaları o oyunun artan zorluk kademeleridir.
- **Aşama sayısı oyuna göre 3 ile 5 arasında değişir.** Bazı oyunların doğal olarak daha fazla zorluk kademesi oluyor.
- Bir act'in bütün aşamalarını bitiren oyuncu o act'in görevini tamamlamış olur.
- **Her iki act arasında bir kapı (gate)** var. Sonraki act ancak kapı geçilince açılır.
- Her oyun **mobilde ve masaüstünde** aynı kalitede oynanmalı: dokunma ya da sürükleme, ve klavye ya da fare.
- Act'ler aşama aşama geliştirilir. Hazır olmayan act'ler HUB'da **"IN DEVELOPMENT"** olarak kilitli görünür.

## 2. Hikaye ve act'ler

Ana hikaye şu: sisteme bir saldırgan sızdı. Oyuncu önce enfeksiyonu temizliyor, sonra savunmayı yeniden kuruyor, sonra saldırganın izini sürüp bağlantısını kesiyor. Ardından saldırganın geride bıraktığı bombayı etkisiz hale getiriyor, sistemi temiz yedeklerden geri yüklüyor ve son bir denetimle sistemin temiz olduğunu kanıtlıyor. Finalde sistemin kontrolünü asıl sahibine geri veriyor ve ona sistemi güvende tutmayı öğretiyor.

| Act | Ad | Hikaye | Oyun | Durum |
|---|---|---|---|---|
| 1 | REMOVE_MALWARE | Enfekte düğümleri temizle | **Timing Bar** | ✅ Kesin, 4 aşama |
| 2 | REBUILD_FIREWALL | Firewall'u blok blok yeniden ör | **Stack Overflow** | ✅ Kesin, 3 aşama |
| 3 | CLOSE_PORTS | Açık portlara gelen saldırı paketlerini engelle | **Orbital Shield** | ✅ Kesin, 4 aşama (Faz 2'de uygulandı) |
| 4 | RESET_CREDS | Ele geçirilen kimlik anahtarlarını yeniden senkronla | **Signal Lock** | ✅ Kesin, 5 aşama (Faz 3'te uygulandı) |
| 5 | TRACE_LOGS | Log akışını takip edip saldırganın kaynağını bul | **Route Trace** (süre oyunu) | ✅ Kesin, 3 aşama (Faz 4'te uygulandı) |
| 6 | CUT_ACCESS | Saldırganın kablolarını kesip bağlantıyı kopar | Öneri: Cable Cut | 🛠 Geliştiriliyor |
| 7 | **DEFUSE_PAYLOAD** | Saldırganın bıraktığı mantık bombasını etkisiz hale getir | Henüz yok | 🛠 Geliştiriliyor |
| 8 | **RESTORE_CORE** | Çekirdek sistemleri temiz yedeklerden geri yükle | Henüz yok | 🛠 Geliştiriliyor |
| 9 | **FINAL_AUDIT** | Sistemin temiz olduğunu kanıtla: sadece bilgi ve mantık | **Bilgi ve zihin oyunu** (süre yok, can yok) | 🛠 Geliştiriliyor |
| 10 | **RETURN_CONTROL** | Sistemi asıl sahibine geri ver ve onu güvende tutmayı öğret | **Eğitici final** (bölüm 3) | 🛠 Geliştiriliyor |

- Act 10, PERIMETER / INTERNAL / CORE katmanlarından **bağımsız** bir statüde: **HANDOVER**. Haritada kendi rengi (turkuaz) ve kendi etiketi var.
- **Endless Mode** rayın en sonunda, Act 10'dan sonra kendi düğümünde duruyor (bölüm 6).

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

### Act 4: Signal Lock, 5 aşama ✅ (mekanik kesin, 2026-10-19)

**Sahne:** bir osiloskop ekranı. Üzerinde iki dalga var: hedef dalga (amber, kesikli) ve oyuncunun dalgası (mavi).

**Kontrol:** tek tuş, basılı tut / bırak.
- Basılı tutunca dalganın **frekansı yükselir**, bırakınca **düşer**. Hafif bir eylemsizlik var, bir şeyi dengede tutmak gibi hissettiriyor.
- Masaüstü: Space ya da fareyle canvas'a basılı tutmak.
- Telefon: ekranın herhangi bir yerine basılı tutmak.
- İki platformda birebir aynı his.

**Akış:**
- Senin frekansın hedefe tolerans kadar yakınsa **SYNC** göstergesi dolar. Uzaklaşınca boşalır (Kolay'da boşalmaz).
- Gösterge dolunca bir **anahtar kilitlenir**, ardından yeni bir hedef frekansla sonraki anahtar başlar.
- **Kazanma:** aşamanın anahtar sayısını kilitlemek.
- **Kaybetme:** süre biterse. Can yok.

**Revive: +20 saniye** (2026-10-19 kararı). Süre bitince lockpick teklif edilir. Başarılı olursa süreye 20 saniye eklenir ve oyun aynı yerden devam eder, kilitlenen anahtarlar korunur. Aşama başına 2 hak, her biri 1 enerji.

**Aşamalar (ilk taslak).** Kesin sayılar aşağıda.

| | 1 · Kolay | 2 · Orta | 3 · Zor | 4 · Çok zor | 5 · Uzman |
|---|---|---|---|---|---|
| Anahtar | 3 | 3 | 4 | 4 | 5 |
| Süre | 45 sn | 40 sn | 45 sn | 45 sn | 50 sn |
| Tolerans | geniş | orta | dar | dar | çok dar |
| SYNC uzaklaşınca | boşalmaz | yavaş boşalır | boşalır | boşalır | hızlı boşalır |
| Hedef kayması | yok | yavaş | orta | orta | hızlı |
| Sinyal sıçraması | – | – | – | var | var |

**Kesin sayılar** (`js/data/Campaign.js`, bot denge taramasıyla belirlendi):

| | Kolay | Orta | Zor | Çok zor | Uzman |
|---|---|---|---|---|---|
| Anahtar / süre | 3 / 45 sn | 3 / 40 sn | 4 / 45 sn | 4 / 45 sn | 5 / 50 sn |
| Tolerans | 0.32 | 0.26 | 0.23 | 0.23 | 0.22 |
| SYNC için gereken süre | 1.2 sn | 1.2 sn | 1.4 sn | 1.4 sn | 1.4 sn |
| Boşalma (dolma hızına göre) | 0 | 0.6× | 1.0× | 1.0× | 1.0× |
| Hedef kayması (genlik / hız) | – | 0.35 / 0.75 | 0.5 / 1.0 | 0.5 / 1.0 | 0.55 / 1.05 |
| Sıçrama aralığı | – | – | – | 5–8 sn | 5–8 sn |

**Fizik:** frekans 1 ile 5 arasında. Basılı tutma ve bırakma 4.0 birim/s² ivme veriyor, sönümleme 3.0/s. Bütün aşamalarda aynı.

**Denge sonucu** (insana benzer bot: tepki gecikmesi, kusurlu momentum tahmini; aşama başına 30 deneme):

| Bot | Kolay | Orta | Zor | Çok zor | Uzman |
|---|---|---|---|---|---|
| İyi | 30/30 | 30/30 | 30/30 | 30/30 | 27/30 |
| Ortalama | 30/30 | 30/30 | 30/30 | 30/30 | 20/30 |
| Yavaş | 30/30 | 30/30 | 30/30 | 25/30 | 10/30 |

- Uzman zor ama oynanabilir.
- Tarama sırasında görülen keskin eşik: hedef kayma hızı yaklaşık 1.15'i geçince oyun bir anda oynanamaz hale geliyor (iyi bot bile ~%10). Bu yüzden Uzman 1.05'te tutuldu.
- Fizik oyun testine göre değişebilir (2026-10-19: "çok içime sinmezse fiziği değiştiririz").

- **Sinyal sıçraması:** hedef frekans aniden başka bir değere atlar. Atlamadan kısa bir süre önce hedef dalga titrer, böylece oyuncu uyarılır.
- **Skor:** kilitlenen her anahtar için puan, artı kalan süre bonusu.
- **Sonsuz mod uyumu:** anahtarlar art arda sonsuza kadar gelebilir. Kayma ve sıçramalar giderek artırılabilir (bölüm 8b).
- **İlk aşamadaki silik ipucu:**
  - Masaüstü: "Hold SPACE to raise your signal, release to lower it"
  - Telefon: "Hold anywhere to raise your signal, let go to lower it"

**Teknik gereksinim:** `InputManager` şu an sadece "basma" olayını iletiyor. Signal Lock için "bırakma" olayı da gerekiyor:
- Space için keyup.
- Dokunmatik ve fare için pointerup / pointercancel.
- Pencere odağını kaybedince (blur) basılı durum sıfırlanmalı, yoksa tuş takılı kalır.
- "← LEAVE" butonuna basmak basılı tutma sayılmamalı.

### Act 5: Route Trace, 3 aşama ✅ (2026-10-21)

**Sahne:** bir ızgarada boru ve kablo parçaları (düz, köşe, T) var. Solda oyuncunun düğümü (YOU), sağda saldırganın düğümü (ATTACKER) duruyor.

**Akış:**
- Karoları döndürerek iki düğüm arasında kesintisiz bir hat kuruluyor.
- Oyuncunun düğümüne bağlı her karo yeşil yanıyor, böylece hattın nereye kadar ulaştığı her an görülüyor.
- Hat saldırgana ulaşınca bir iz bulunmuş oluyor. 0.7 saniyelik kısa bir duraklamadan sonra (süre de durur) yeni bir ızgara geliyor.
- **Kazanma:** aşamanın iz sayısını tamamlamak.
- **Kaybetme:** süre biterse. Can yok.

**Kontrol:**
- Telefon ve fare: karoya dokunmak ya da tıklamak, saat yönünde 90° döndürüyor.
- Klavye: ok tuşları ya da WASD ile imleç gezdiriliyor, Space ya da Enter ile döndürülüyor.

**Revive:** +20 saniye, Signal Lock gibi. Aynı ızgara kaldığı yerden devam ediyor.

**Bulmaca garantisi:**
- Önce rastgele, kendini kesmeyen bir yol açılıyor. Yolun karolarına doğru parçalar konuyor, geri kalan yerleri şaşırtmaca parçalar dolduruyor, sonra kilitli olmayan her karo rastgele döndürülüyor.
- Böylece her ızgara çözülebilir. Hiçbir ızgara çözülmüş halde gelmiyor.
- Yol üzerindeki kilitli karolar zaten doğru yönde duruyor, yani oyuncuya dayanak oluyorlar.

| | Kolay | Orta | Zor |
|---|---|---|---|
| Izgara | 4×4 | 5×5 | 6×6 |
| İz | 2 | 3 | 3 |
| Süre | 45 sn | 70 sn | 85 sn |
| Yol uzunluğu | 4–7 | 6–11 | 9–16 |
| Şaşırtmaca yoğunluğu | %45 | %60 | %70 |
| Kilitli karo | – | – | %12 |

- İlk oyun testinden sonra 4. aşama (7×7, Çok zor) kaldırıldı (2026-10-21: "oyun sağlam beyin istiyor, 3 aşama yeterli").
- Kendiliğinden dönen karo özelliği (`scrambleMin` / `scrambleMax`) kodda duruyor, ama kampanyada kullanılmıyor. Sonsuz mod için saklandı.

**Süreler nasıl belirlendi:** her aşamada 300 bulmaca üretildi ve çözüm için gereken döndürme sayısı ölçüldü. Basit bir çözme süresi modelinin (bakma süresi, karo başına süre, döndürme başına süre) yaklaşık 2–3 katı süre verildi. Gerçek oyuncunun hangi karonun yola ait olduğunu da düşünmesi gerektiği için bu pay bırakıldı. Oyun testine göre ayarlanacak.

### Act 6–8: Geliştiriliyor 🛠

Mekanikler birlikte kararlaştırılacak. Aşağıdakiler şimdilik sadece fikir:

- **Cable Cut (Act 6):** Matter.js ile kablo kesme bulmacası. Fare, parmakla kaydırma ya da 1–3 tuşları.
- Act 7 (DEFUSE_PAYLOAD) ve Act 8 (RESTORE_CORE) için henüz fikir yok.

### Act 9: FINAL_AUDIT 🛠

**Kesin olan (2026-10-21):** Act 9 **süre ya da can üzerine değil, tamamen bilgi ve zihin becerisi** üzerine kurulu olacak. (Bu karar verildiğinde Act 9 son act'ti. 2026-10-23'te final act olarak Act 10 eklendi, karar Act 9 için geçerli kalıyor.)
- Refleks, zamanlama ya da el becerisi istemez. Oyuncunun bilgisini ve akıl yürütmesini sınar: mantık, çıkarım, örüntü ya da bilgi soruları gibi.
- Süre sınırı yok, can yok. Kesin format birlikte belirlenecek.

### Act 10: RETURN_CONTROL, final act 🛠 (plan, 2026-10-23)

**Tema:** Saldırgan temizlendi ve sistem doğrulandı. Şimdi erişim **asıl sahibine geri veriliyor**. Oyuncu artık savunan kişi değil, sistemi sahibine teslim eden ve ona sistemi güvende tutmayı öğreten kişi.

**Kesin olanlar:**
- **Final act** budur. `CAMPAIGN.finalAct = 10`. Endless Mode bu act bitince açılır (önceden açmış olanlarda açık kalır).
- **Eğitici içerik ağırlıklı.** Oyuncu oynarken gerçek hayatta işine yarayacak güvenlik alışkanlıklarını öğrenmeli.
- **Bağımsız statü: HANDOVER.** PERIMETER / INTERNAL / CORE katmanlarının dışında. Haritadaki üst rayda kendi parantezi ve etiketi var, rengi turkuaz (`#2dd4bf`). Arka plan atmosferi sakin: sistem artık temiz.
- Kodda şimdilik "IN DEVELOPMENT" olarak duruyor (`available: false`): tema ve ikon (açık kilit) hazır, oyun yok.
- Yetki seviyesi: Act 10 bitince oyuncu **L10 GUARDIAN** olur.
- **Kapı 9** (Act 9 → 10) Packet Purge ayarı Act 10 ile birlikte belirlenecek.

**Birlikte karar verilecekler (sırası gelince):**
- Oyunun formatı ve mekaniği. Act 9 zaten bilgi ve mantık sınavı olduğu için Act 10'un ondan farkı net olmalı: Act 9 **sınar**, Act 10 **öğretir**.
- Öğretilecek konular. Örnek fikirler: güçlü parola ve parola yöneticisi, iki aşamalı doğrulama, oltalama (phishing) e-postasını tanıma, güncellemeler, yedekleme, şüpheli bağlantı ve dosyalar.
- Süre ve can olup olmayacağı. Aşama sayısı (3–5).
- Yıldız kuralları (UI-5'teki gibi bot taramasıyla ya da eğitici içeriğe uygun başka bir ölçüyle).
- Sonsuz moda nasıl uyacağı (bölüm 8b).

## 4. İlerleme kuralları

- Act içindeki aşamalar sıralı açılır.
- Bütün aşamalar bitince **act tamamlanmış** olur ve sonraki kapı oynanabilir hale gelir.
- Bir act'e girilebilmesi için **önceki kapının açık olması** yeterlidir. Kapı bir kez açıldıysa açık kalır.
- **Kapılar:** 9 act arasında 8 kapı var.
  - Kapı 1 (Act 1→2): Packet Purge, bugünkü haliyle.
  - Kapı 2–5: Packet Purge'ün giderek zorlaşan ayarları (daha çok dalga, daha hızlı paket).
  - Deneme sınırı: her kapı için 3 dakikada 2 deneme (`ChallengeGate`).
  - Sonraki act geliştiriliyorsa kapı oynanamaz.
- **Lockpick (Code Breaker): sadece revive için.** Aşama atlama kaldırıldı.
  - Revive sadece kesintisiz oynanan oyunlarda var: Timing Bar, Orbital Shield, Signal Lock ve Endless. Aşama başına 2 hak, her biri 1 enerji.
  - Orbital Shield'da başarılı bir kurtarmadan sonra oyun aynı yerden 1 canla devam eder. Signal Lock'ta +20 saniye ile devam eder.
  - Lockpick'in zorluğu act numarasına göre seçilir ve biraz kolaylaştırıldı:

    | Zorluk | 1 | 2 | 3 | 4 | 5 | 6 |
    |---|---|---|---|---|---|---|
    | Düğüm | 4→3 | 5→4 | 5→4 | 6→5 | 6→5 | 7→6 |
    | İmleç hızı (°/s) | 70→60 | 90→75 | 110→90 | 130→105 | 160→125 | 200→150 |
    | Tolerans (°) | 28→30 | 24→27 | 20→24 | 16→21 | 13→18 | 10→16 |
- **Endless Mode:** son act bitince açılır. Kampanya 9 act'e çıktığı için bu artık **Act 9**. Bugün Endless'ı açmış olan oyuncularda açık kalır, Leaderboard da onlar için görünür kalır.
- **Final ekranı:** "SYSTEM SECURED" ve "Endless unlocked" ekranı son act (Act 9) bitince gösterilir. Diğer act'ler bitince kısa bir "ACT COMPLETE" bildirimi çıkar.

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

1. **Act haritası: kayan kampanya şeridi** (2026-10-21; 9 act tek ekrana sığmayınca 3×3 ızgaradan buna geçildi).
   - **Üstte ilerleme rayı:** her act için bir nokta. Biten act yeşil dolu, oynanan act parlıyor, kilitli act gri, geliştirilen act kesik çizgili. Açık kapılar rayda yeşil çizgi oluyor. Bir noktaya dokununca o act'e kayılıyor. Altında "x/9 ACTS · N STAGES CLEARED" yazıyor.
   - **Ortada büyük kart:** seçili act. İkon, oyun adı, act adı, hikaye, aşama noktaları, durum, en iyi toplam skor ve "OPEN ▸".
   - **Yanlarda komşular:** komşu act'ler küçük ve soluk görünüyor, aradaki kapı düğümleri yolun üstünde. Komşu karta dokununca ona kayılıyor.
   - **Gezinme:** ‹ › okları, klavyede ← / → (ya da A / D), fare tekerleği. Enter seçili act'i açar, ↑ / ↓ alttaki butonlara geçer.
   - **Parmak kaydırma yok:** kartlara dokununca anında açılıyor, kaydırmaya başlarken yanlışlıkla act açılabilirdi.
   - Haritanın altında Endless ve Leaderboard butonları var. Endless kilitliyse "Complete ACT 9" yazar.
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
| 3 | Act 4 Signal Lock (5 aşama, bölüm 3), Kapı 3 (Act 3 → 4) ve InputManager'a "bırakma" olayının eklenmesi. | ✅ Uygulandı |
| 3b | Kampanyanın 9 act'e genişletilmesi: Act 7–9 düğümleri ("IN DEVELOPMENT"), Kapı 6–8 ve 3×3 harita. | ✅ Uygulandı |
| 4 | Act 5 Route Trace (süre oyunu) ve Kapı 4. Act haritası kayan şeride geçti. | ✅ Uygulandı |
| 5 | Act 6 ve Kapı 5 | Bekliyor |
| 6–7 | Act 7, Act 8 ve kapıları | Bekliyor |
| 8 | Act 9 (bilgi ve zihin oyunu) ve Kapı 8 | Bekliyor |
| 9 | Act 10 RETURN_CONTROL (eğitici final), Kapı 9 ve final ekranı. Endless yeni oyuncular için açılır. | Bekliyor |

## 7b. Duraklatma ve geri gitme (2026-10-21)

- **⏸ butonu:** her oyun ekranının sol alt köşesinde. Basınca oyun durur ve PAUSED paneli açılır:
  - **RESUME**
  - **RESTART:** sadece kampanya aşamalarında. Kapılarda ve Dual Ring'de olmaz, çünkü her deneme bir hak harcar. Endless'ta da olmaz, çünkü koşu skoru sayılır.
  - **LEAVE**
- RESTART ve LEAVE önce uyarı gösterir, varsayılan seçim her zaman güvenli olandır.
- **Esc ve tarayıcı / telefon "geri" hareketi** aynı paneli adım adım yönetir: önce paneli açar, uyarıdaysa panele döner, paneldeyse oyunu devam ettirir. Bu kapsamda Android geri tuşu, iOS kenardan kaydırma, masaüstü geri butonu ve Safari'de iki parmakla kaydırma var.
- **Menülerde geri** bir ekran geri götürür: act ekranından haritaya, haritadan girişe, kılavuzdan kapanış, kaybetme ekranından act ekranına.
- **Giriş ekranında** ilk geri basış "Press back again to leave SyncBreaker" uyarısı gösterir. Siteden sadece ikinci basışta çıkılır.

## 8a. Dik (portre) ekran tasarımı (henüz planlanmadı)

Oyun şu an **yatay** bir canvas'ta çalışıyor (960×640, 3:2). Telefon dik tutulunca canvas genişliğe sığdırılıyor ve ekranın ortasında küçük bir şerit olarak kalıyordu.

- **Şimdilik (2026-10-21):** dokunmatik bir cihaz dik tutulunca temaya uygun bir **"ROTATE YOUR DEVICE"** ekranı çıkıyor ve oyun duraklıyor. Yatay çevrilince oyun kaldığı yerden devam ediyor.
  - Ekran `index.html` ve CSS'te tanımlı (`.sb-rotate`).
  - Duraklatma `main.js` ve `GameLoop.setPaused` ile yapılıyor. Basılı tutulan girdiler de bırakılıyor.
  - Masaüstünde dar ya da dik bir pencere bu ekranı tetiklemiyor, çünkü koşul hem dik yön hem dokunmatik işaretçi istiyor (`pointer: coarse`).
- **Sonra:** gerçek bir dik tasarım. Canvas dik ekranda dik oranda çalışacak ve her ekranın ikinci bir yerleşimi olacak. Sıra:
  1. Menü, harita, act ekranı ve kılavuz
  2. Oyunlar (her biri ayrı ayrı)
  3. Detaylar ayrıca planlanacak.

## 8b. Endless Mode değişecek (henüz planlanmadı)

Endless Mode bugünkü haliyle sadece Timing Bar üzerine kurulu. **Değişecek:** hedef, kampanyadaki **bütün oyunları destekleyen** bir sonsuz mod. Detaylar daha sonra ayrıca planlanacak.

Şimdilik kesin olan:
- Endless son act bitince açılır (şu an Act 10). Leaderboard sistemi (isim + şifre) aynı kalıyor.
- **HUB'da Endless düğümü (2026-10-23):** Üst rayın en sonunda, Act 10'dan sonra kendi düğümü var. Numarası yok, altında "ENDLESS" yazıyor. Tasarımı: dönen kesikli altın halka, içinde altından maviye renk geçişli ∞ işareti ve ∞ üzerinde dolaşan bir ışık. Kilitliyken gri ve küçük bir kilit simgesi var. Act 10'dan ona noktalı altın bir çizgi gidiyor. Kilitliyken dokununca nasıl açılacağı yazıyor.
- **Endless sadece son act'i bitirenlere (2026-10-23):** Endless Mode ve leaderboard HUB'da başka hiçbir yerde görünmüyor, sadece raydaki Endless halkası var. Kartların altındaki ENDLESS MODE ve LEADERBOARD butonları kaldırıldı. Daha önce Endless'ı açmış oyuncular için açık kalıyor.
  - Kilidi açanlar için carousel'in sonunda bir **Endless kartı** var. Halkaya dokununca carousel bu karta kayıyor.
  - Bu oyuncular siteyi açınca HUB **Endless kartında** açılıyor. Bir act'e girip dönünce o act'te, Endless'tan dönünce yine Endless'ta açılıyor.
  - Kart **Endless lobisini** açıyor (`ENDLESS_HUB`): büyük ∞ amblemi, en iyi skor, **START RUN** ve **LEADERBOARD**. Leaderboard artık Endless'ın içinde. Koşu bitince ya da leaderboard'dan geri dönünce yine lobiye gelinir.
  - Lobi, çok oyunlu yeni sonsuz mod için hazırlandı: oyun seçimi ileride buraya gelecek.
- **Endless açanlara özel giriş ekranı (2026-10-23):** Hikaye yazısı yok. Ortada büyük, altın ışıltılı SYNCBREAKER, altında "∞ ENDLESS OPERATOR". Altın çerçeveli kısa bir STATUS REPORT var: bütün düğümler temiz, oyun artık sonsuz, ∞ halkası haritanın sonunda. En iyi Endless skoru da gösteriliyor. Buton: altın renkli "▶ ENTER". Bozulma efekti bu ekranda yok.
- **Tebrik penceresi (kampanya bitince bir kez):** Başlık "CONTROL RETURNED". 10 act'in hikayesi kısaca anlatılıyor ve PERIMETER / INTERNAL / CORE / HANDOVER statülerinin hepsi ✓ olarak gösteriliyor. Altında yetki seviyesi (L10 GUARDIAN), altın bir "ENDLESS MODE UNLOCKED" bandı (∞ halkasına ve içindeki leaderboard'a yönlendiriyor) ve toplam yıldız / en iyi skor var.
- Yeni oyunlar tasarlanırken sonsuz bir modda da çalışabilecekleri göz önünde tutulmalı. Yani zorluğun sürekli artırılabilir olması ve skor üretebilmeleri gerekiyor.

## 9. Kararlar

**2026-10-19**
1. Act isimleri Bölüm 2'deki tablodaki gibi.
2. Act'ler 3–5 aşamalı olabilir.
3. Act 1: Timing Bar, 4 aşama. Vuruşlar 8 / 10 / 14 / 18.
4. Act 2: Stack Overflow, 3 aşama. Zorluk kule yüksekliği ve mikro artan vinç hızıyla belirleniyor.
5. Kapı 2–5: giderek zorlaşan Packet Purge.
6. Lockpick sadece revive için ve biraz kolaylaştırıldı.
7. Endless son act bitince açılır, zaten açmış olanlarda açık kalır. (Son act o zaman 6'ydı, 2026-10-21'den itibaren 9.)
8. Act 3–6 "IN DEVELOPMENT" olarak gösterilir. Mekanikleri birlikte kararlaştırılacak.
10. **Endless Mode değişecek:** bütün oyunları destekleyen bir sonsuz mod olacak. Henüz planlanmadı, sonra ayrıca planlanacak (bölüm 8b).
11. **Act 4 (Faz 3):** Signal Lock. Basılı tut / bırak ile frekans ayarlanıyor. Kaybetme koşulu süre sınırı, can yok. 5 aşama: Kolay, Orta, Zor, Çok zor, Uzman. **Revive +20 saniye** veriyor ve oyun aynı yerden devam ediyor. Uzman zor ama oynanabilir olmalı.
9. **Act 3 (Faz 2):** Orbital Shield, portlara kilitlenen kalkan. Kazanma koşulu N paket engellemek. 4 aşama: port sayısı 4 / 6 / 8 / 8, engellenecek paket 12 / 16 / 20 / 20. Zor ve Çok zor aynı ayarlarda oynanıyor, Çok zor'a rastgele çıkan ve yolda hedef değiştiren paketler ekleniyor.
12. **Kampanya 9 act** (2026-10-21). Act 7–9: DEFUSE_PAYLOAD, RESTORE_CORE, FINAL_AUDIT. Düğümleri haritada "IN DEVELOPMENT" olarak duruyor. 9 act arasında 8 kapı var.
13. **Son act (Act 9)** süre ya da can değil, tamamen bilgi ve zihin becerisi üzerine kurulu olacak.
14. **Act 5** bir süre oyunu olacak (can yok) ve yeni bir minigame olarak yapılacak.
15. **Act 5:** Route Trace (2026-10-21). Karoları döndürerek YOU ile ATTACKER düğümlerini bağlamak. Süre oyunu, can yok, revive +20 saniye. İlk planda 4 aşamaydı, oyun testinden sonra 3 aşamaya indi: 4×4, 5×5, 6×6.
16. **Act haritası** kayan bir kampanya şeridine geçti: üstte ilerleme rayı, ortada büyük kart. Amaç ilerlemeyi görünür kılmak.
17. **Dik ekran** (2026-10-21): önce "telefonu çevir" ekranı eklendi (oyun duraklar), dik tasarım sonra ayrı bir faz olarak yapılacak (bölüm 8a).
