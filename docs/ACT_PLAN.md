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
| 6 | CUT_ACCESS | Saldırganın kablolarını kesip bağlantıyı kopar | **Network Cut** (can + mantık, süre yok) | ✅ Yayında, 4 aşama (Faz 5) |
| 7 | **DEFUSE_PAYLOAD** | Saldırganın bıraktığı mantık bombasını etkisiz hale getir | **Logic Bomb** (modüler bomba: süre + arıza) | 📝 Taslak kademelerle geliştiriliyor, 4 aşama (Faz 6) |
| 8 | **RESTORE_CORE** | Çekirdek sistemleri temiz yedeklerden geri yükle | **Defrag** (yerleştirme bulmacası + süre) | 📝 Taslak kademelerle geliştiriliyor, 4 aşama (Faz 7) |
| 9 | **FINAL_AUDIT** | Sistemin temiz olduğunu kanıtla: sadece bilgi ve mantık | **Checksum Grid** (nonogram: süre yok, can yok) | 🛠 Geliştiriliyor, 5 aşama (Faz 8) |
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

### Act 6: Network Cut, 4 aşama 📝 (plan, 2026-10-23)

**Fikir:** Act 5'te saldırganın rotası bulundu, Act 6'da o rota **kesiliyor**. Bir can ve mantık oyunu: süre yok, baskıyı canlar ve sınırlı sayıda makas sağlıyor.

**Sahne:** Bir ağ haritası.
- Solda saldırganın düğümü (**ATK**, kırmızı), sağda sistemin çekirdeği (**CORE**, turkuaz). Aradaki röle düğümleri kablolarla birbirine bağlı.
- Saldırganın şu an ulaşabildiği kablolar **kırmızı** yanıyor. Bu, Act 5'teki yeşil yayılmanın tersi: oyuncu saldırganın erişimini her an görüyor.
- Üst kademelerde ağda sahibin terminali (**OWNER**) ve onun **mavi** hatları da var.

**Akış:**
- **Önce seç, sonra kes (karar 2026-10-23):** İlk dokunuş (ya da tıklama) kabloyu seçer: kablo parlar ve üzerinde bir makas belirir. Aynı kabloya ikinci dokunuş onu keser ve bir **makas** harcar. Başka bir kabloya dokunmak seçimi oraya taşır, boş bir yere dokunmak seçimi kaldırır. Böylece yanlışlıkla bir dokunuş can götürmez.
- Her kesimden sonra saldırganın erişimi yeniden hesaplanır, kırmızı yayılım güncellenir.
- Saldırgan çekirdeğe ulaşamaz hale gelince ağ çözülmüş olur. Kısa bir duraklamadan sonra yeni bir ağ gelir.
- **Kazanma:** aşamanın ağ sayısını çözmek.
- **Kaybetme:** canların bitmesi.

**Can kaybı:**
- **Sahibin hattını (mavi) kesmek:** "OWNER LINE CUT". 1 can gider, kablo hemen onarılır. Harcanan makas geri gelmez.
- **Makasların bitmesi:** makas bittiği halde saldırgan hâlâ çekirdeğe ulaşabiliyorsa 1 can gider ve aynı ağ baştan kurulur.
- Mavi kabloların hiçbirine dokunmadan bir çözüm **her zaman** vardır.

**Kademelerle gelen yenilikler:**
- **Sahibin hattı (Orta ve üstü):** Mavi kablolar sahibin terminalini çekirdeğe bağlar. Bunları kesmek can götürür. Saldırganın yolları bazen bu hatların yanından geçtiği için oyuncu nereden keseceğini düşünmek zorunda kalır.
- **Zırhlı kablo (Zor ve üstü):** Kalın çizilmiş kablolar. Kesmek için **iki makas** gerekir: ilk kesimde çatlar, ikincide kopar. Ucuz bir yol yerine bazen zırhlıyı kesmek gerekir.
- **Yedek hat / failover (Çok zor):** Uykuda duran, soluk ve kesik çizgili kablolar. Belirli bir kablo kesilince saldırgan trafiği yedeğe aktarır ve yedek uyanır. Her yedeğin ucundaki küçük bir işaret, onu hangi kablonun uyandıracağını gösterir. Bu yüzden kesme **sırası** önemlidir: oyuncu "bunu kesersem hangi yedek açılır?" diye plan yapar.

**Kolay yollara karşı (2026-10-24, ilk oyun testinden sonra):** İlk sürümde CORE'un ya da ATK'nın yanındaki kabloları kesmek ağa hiç bakmadan her seferinde işe yarıyordu, çünkü uçlarda en fazla 3 kablo vardı ve makas hep buna yetiyordu. Düzeltme:
- **Çelik ana hatlar:** ATK'ya ve CORE'a bağlanan kablolar çelik kılıflı, kesilemez. Kesim her zaman ağın içinde yapılır. Eğitim ve ilk karşılaşma açıklamaları bunu anlatır.
- **Gizli darboğaz:** Ağ 3 satır ve 5–6 sütundan oluşur ve her yerde sık örülüdür. Tek dar yer, satır satır farklı sütunlarda kıvrılan zikzak bir sınırdır. En ucuz kesim buradadır, bulmak için ağa bakmak gerekir.
- **Kolay yol kontrolü:** Üretici her ağda bakmadan uygulanabilecek yolları dener: ucun yanındaki sırayı ya da uç geçitleri tamamen kesmek hiçbir zaman makasa sığmaz; ortadan düz bir sütunu tamamen kesmek her zaman en iyi çözümden pahalıdır. Sağlamayan ağ atılıp yenisi üretilir.
- **Her ağ farklı:** darboğazın yeri ve şekli, köşegen yönleri, iç sütunlardan rastgele eksilen düğümler, ATK/CORE'un yüksekliği ve ağların yarısında ayna çevirme (ATK sağda, CORE solda).
- Kademe sayıları sütun sayısıyla tanımlandı: Kolay ve Orta 5 sütun, Zor ve Çok zor 6 sütun.

**Oyun kendini öğretiyor (2026-10-24, ilk denemede "kimse anlamıyor" geri bildiriminden sonra):**
- **Etkileşimli eğitim:** Act 6'nın ilk aşamasına ilk girişte ilk ağ elle kurulmuş basit bir eğitim ağıdır: iki ayrı yol, her biri tek kesimle kapanır. Baloncuklar sırayla anlatır: saldırgan ve çekirdek → kırmızı kablolar saldırganın yolları → "bu kabloya dokun" → "tekrar dokun, kes" → "diğer yolu da kes" → "erişim kesildi". Bilgi baloncukları oyunu durdurur ve dokununca geçer. Eylem adımları oyuncu yaptıkça ilerler.
- **İlk karşılaşma açıklamaları:** Sahibin hattı, zırhlı kablo ve yedek hat ilk kez görüldüğünde oyun durur ve ne olduklarını tek cümleyle anlatır. Her biri bir kez gösterilir.
- **Ekranda kalıcı:** tahtanın üstünde "GOAL: cut cables until no red line reaches the CORE", CORE'un altında "UNDER ATTACK" ya da "SAFE", tahtanın altında o ağda bulunan kablo türlerinin renk açıklaması. Yedek hat ile onu uyandıran kablonun harfleri soluk noktalı bir çizgiyle birbirine bağlıdır.
- Görülenler tarayıcıda `sb_coach_cut` anahtarında tutulur (oyun başına `sb_coach_<oyun>`). Bu yapı ileride diğer oyunlar için de kullanılabilir.

**Kontrol:**
- Telefon ve fare: kabloya dokunmak ya da tıklamak seçer, seçili kabloya tekrar dokunmak keser. Dokunma alanı en az 44 nokta. Parmak iki kablonun arasına gelirse en yakın kablo seçilir.
- Masaüstünde fareyle üzerine gelinen kablo hafifçe vurgulanır.
- Klavye: ok tuşları seçimi kablolar arasında gezdirir (seçmek bu), Space ya da Enter seçili kabloyu keser.

**Bulmaca garantisi:**
- Düğümler kesişmeyen kablolarla yerleştirilir, böylece ağ okunur kalır.
- Çözülebilirlik maksimum akış / minimum kesim ile kontrol edilir: sahibin hatları kesilemez (sonsuz kapasite), zırhlı kablo 2, normal kablo 1 makas sayılır.
- Yedek hatlı ağlarda küçük ağ boyutu sayesinde bütün kesme sıraları denenir. Makas payı içinde bir çözüm olduğu doğrulanır.
- Ağ hiçbir zaman çözülmüş halde gelmez: başta saldırgan her zaman çekirdeğe ulaşabilir.

**Aşamalar (kesin, 2026-10-24: bot taraması + L2 ayarı onaylandı):**

| | Kolay | Orta | Zor | Çok zor |
|---|---|---|---|---|
| Ağ sayısı | 3 | 3 | 4 | 4 |
| Sütun (3 satır, ilk taslakta düğüm sayısı 6/8/10/12'ydi) | 5 | 5 | 6 | 6 |
| En az gereken kesim | 2 | 2–3 | 3 | 3–4 |
| Makas payı (en az kesimin üstüne) | +2 | +1 | +1 | **+1** |
| Sahibin hatları | – | 2–3 | 3–4 | 3–4 |
| Zırhlı kablo | – | – | 1–2 | 2 |
| Yedek hat | – | – | – | 1–2 |
| Can | 3 | **4** | **5** | **5** |

**Denge sonucu** (yeni üretici, insana benzer botlar, aşama başına 40 deneme; "ortalama" bot hamlelerin %60'ında en iyi kesimi planlıyor, kalanında tahmin ediyor):

| Bot | Kolay | Orta | Zor | Çok zor |
|---|---|---|---|---|
| İyi | 40/40 | 40/40 | 40/40 | 40/40 |
| Ortalama | 40/40 | 30/40 | 16/40 | 12/40 |
| Yavaş | 8/40 | 1/40 | 0/40 | 0/40 |

- Makas payını artırmak yerine can verildi: Zor'da +2 makas, uçtaki 5 kablonun bakmadan kesilmesine yetiyordu.
- Tahminle oynayan botlar bilerek zorlanıyor: oyun bakmadan kesmeyi cezalandırıyor. Oyun testine göre ayarlanabilir.

**Revive:** Lockpick ile, diğer can oyunları gibi. Başarılı olursa **+1 can** verilir ve aynı ağ baştan kurulur. Aşama başına 2 hak, her biri 1 enerji.

**Skor:** çözülen ağ başına 300, aşama sonunda kalan her makas için 50, kalan her can için 250.

**Yıldızlar (onaylandı, 2026-10-24):** 3 yıldız = hiç can kaybı yok ve aşama boyunca en fazla 1 boşa makas; 2 yıldız = en fazla 1 can kaybı (Zor ve Çok zor'da en fazla 2). Revive kullanılırsa en fazla 1 yıldız. Bot taraması `UI_PLAN.md` bölüm 3e'de.

**Sonsuz mod uyumu:** Ağlar art arda sonsuza kadar gelebilir. Düğüm sayısı, sahibin hatları, zırhlı kablolar ve yedek hatlar giderek artırılabilir.

**İlk aşamadaki silik ipucu:**
- Masaüstü: "Click a cable to cut it · cut every red path to the CORE"
- Telefon: "Tap a cable to cut it · cut every red path to the CORE"

**Aynı sürümde:**
- **Kapı 5** (Act 5 → 6): Packet Purge ayarı `Campaign.js`'te zaten var (3 dalga, hız 1.25).
- **Herkesin ilerlemesinin sıfırlanması** bu sürümle yayına girer (bölüm 5b).

**Uygularken birlikte karar verilecekler:**
- Kesim animasyonu ve sesi: kıvılcım, kopan kablonun sarkması.
- Ağ sayısı ve makas payı bot taramasından sonra.

### Act 7: Logic Bomb, 4 aşama 📝 (plan, 2026-10-24)

**Fikir:** Act 6'da saldırganın bağlantısı kesildi, ama geride bir **mantık bombası (payload)** bıraktı. Ekranda bir payload kasası var. Kasanın üstünde ortak bir geri sayım ve birkaç **modül** duruyor. Bütün modüller etkisizleşince payload da etkisizleşir. Bomba imha oyunlarının klasik kurgusu bu (2026-10-24'te dört öneri arasından seçildi: A "Payload Kasası").

- **Süre + arıza oyunu.** Act 6'da süre yok, Act 9'da da süre ve can olmayacak. Bomba temasında geri sayım baskıyı sağlıyor.
- **Fizik yok.** Matter.js kullanılmıyor.

**Ekran (telefon uyumu için):**
- Solda **kasa**: üstte modül sekmeleri, altında seçili modül büyük çiziliyor. Her sekmede modülün durum ışığı var (yeşil = etkisiz).
- Sağda **kontrol paneli**: geri sayım ve arıza ışıkları, payload imzası (SIG) ile durum bayrakları ve seçili modülün **MANUAL**'ı (kullanım kılavuzu).
- Bir anda yalnızca bir modül ve onun kılavuzu görünüyor. Bir modül etkisizleşince sıradaki kendiliğinden açılıyor.

**MANUAL (ilk oyun testinden sonra, 2026-10-24):** Kullanıcı ilk denemede ne yapacağını anlamadı. Kılavuz yeniden düzenlendi:
- En üstte sarı bir **hedef cümlesi** var, örneğin "Check the rules from the top. Do ONLY the first one that is true."
- Kurallar numaralı ayrı kutularda, iki satır halinde: "IF …" ve altında "→ …". Renk adları kendi renginde yazılıyor.
- Yazı sığmazsa boyutu küçülüyor (16 → 13 px).
- İleride oyunun Türkçesi gelince anlaşılması daha da kolaylaşacak.

**Modüller:**
1. **DATA LINES (veri hatları):** 3–6 renkli hat. Her hattın yanında rengi yazıyor. Kılavuzdaki kurallar yukarıdan aşağı okunuyor ve **ilk doğru kural** uygulanıyor. Son satır "OTHERWISE". Her satır bu modülde uygulanabilir. İlk dokunuş hattı seçiyor, ikincisi kesiyor. Yanlış hat bir arıza yazıyor, hat hemen onarılıyor.
2. **TRIGGER (tetik devresi):** giriş anahtarları mantık kapılarından (AND / OR / NOT, sonra XOR) geçip **DETONATE lambasına** bağlanıyor. Teller **canlı**: 1 taşıyan tel yanıyor. Amaç lambayı söndürmek. Lamba sönünce modül hemen etkisizleşiyor. Anahtar hakkı sınırlı: en az gereken + `flipSlack`. Haklar bitince bir arıza yazılıyor ve anahtarlar başa dönüyor. Çok zor'da kendi kendine değişen bir **CLK** girişi var; lamba CLK'nin iki değerinde de sönük kalmalı.
3. **CIPHER PAD (sembol tuş takımı):** 4 sembollü tuşlar. Kılavuzda birkaç sembol sütunu var. Dördünü de içeren tek sütun bulunuyor, tuşlara o sütunun yukarıdan aşağı sırasıyla basılıyor.
4. **KILL SWITCH (basılı tut düğmesi):** kılavuz önce (STEP 1) dokun mu basılı tut mu dediğini söylüyor. Basılı tutunca bir şerit yanıyor. STEP 2: şeridin rengine göre sayaçta belli bir rakam görünürken bırakılıyor.

**Kurallar:**
- Yanlış hamle bir **arıza (strike)** demek. Her arıza geri sayımı %25 hızlandırıyor. 3 arızada ya da süre bitince payload patlıyor ve aşama kaybediliyor.
- Bir aşamada birden fazla payload var. Her payload kendi süresi ve sıfır arızayla başlıyor.

**Kontroller:**
- Telefon / fare: sekmeye dokun, hattı iki kez dokunarak kes, anahtara dokun, tuşa bas, düğmeyi basılı tut.
- Klavye: 1–4 ya da Tab ile modül seç, oklarla modülün içinde gez, Space / Enter ile kullan (düğme için Space basılı tutulur).

**Aşamalar (taslak, onay bekliyor).** Her aşama tek bir yeni şey getiriyor. Uzman aşaması kullanıcı isteğiyle kaldırıldı (2026-10-24: "4 level gayet iyi").

| | Kolay | Orta | Zor | Çok zor |
|---|---|---|---|---|
| Yeni | hatlar | + devre | + tuş takımı, XOR | + düğme, CLK, SIG/bayrak kuralları |
| Payload | 2 | 2 | 2 | 3 |
| Modül (payload başına) | 2 | 2 | 3 | 4 |
| Hat sayısı / kural | 3–4 / 3 | 3–4 / 3 | 4–5 / 4 | 5–6 / 4 |
| Devre | – | 3 giriş, 3 kapı | 3 giriş, 3 kapı, XOR | 3 giriş + CLK, 3 kapı |
| Fazladan anahtar hakkı | – | 1 | 1 | 1 |
| Arıza sınırı | 3 | 3 | 3 | 3 |
| Süre (payload başına) | 60 sn | 75 sn | 90 sn | 120 sn |

**Denge sonucu (taslak, 2026-10-24):** gerçek üreticiyle, aşama başına 200 deneme. Botlar basit bir çözme süresi modeliyle oynuyor (kural okuma, kapı başına düşünme ve anahtar çevirme, sütun tarama, rakam bekleme). "İyi" bot hamlelerin %4'ünde, "ortalama" %12'sinde, "yavaş" %22'sinde hata yapıyor ve sırasıyla 0.75×, 1×, 1.4× hızda oynuyor. Süreler modelin yaklaşık 1.8–2.8 katı. Yeni bir şey öğreten aşamalarda (Kolay, Orta) pay bilerek geniş bırakıldı.

| Bot | Kolay | Orta | Zor | Çok zor |
|---|---|---|---|---|
| İyi | 200/200 | 200/200 | 199/200 | 200/200 |
| Ortalama | 198/200 | 197/200 | 195/200 | 186/200 |
| Yavaş | 189/200 | 187/200 | 162/200 | 73/200 |

- Oyun testine göre ayarlanacak.

**Revive:** Lockpick ile, Signal Lock gibi **+20 saniye**. Arıza sınırındaysa bir arıza da siliniyor. Payload kaldığı yerden devam ediyor. Aşama başına 2 hak, her biri 1 enerji.

**Skor:** etkisizleşen modül başına 150, payload başına 300, kalan her saniye için 10, her arıza için −100.

**Yıldızlar (taslak, onay bekliyor):** 3 yıldız = hiç arıza yok ve sürenin en az %35'i kalmış (payload'ların ortalaması). 2 yıldız = en fazla 1 arıza. Revive kullanılırsa en fazla 1 yıldız.

**Eğitim (coach):**
- İlk aşamanın ilk modülü **adım adım ders**: sayaç → kılavuz → kurallar tek tek ("Rule 1: … NOT true here, skip it" … "Rule 3: … IS true! So: cut the last BLUE line — line 2") → "Tap line 2" → "Tap again to cut".
- Ders sırasında sadece gösterilen hat tepki veriyor. Konuşulan yer dışında ekran karartılıyor ve süre duruyor.
- Ders bitince sekmeler, arızalar ve "kurallar her seferinde değişir" bir baloncukla anlatılıyor.
- Devre, tuş takımı, düğme, CLK ve SIG/bayrak kuralları ilk açıldıklarında bir kez açıklanıyor (`sb_coach_bomb`).

**Sonsuz mod uyumu:** payload'lar art arda sonsuza kadar gelebilir. Modül sayısı, kural sayısı ve kapı sayısı artırılıp süre kısaltılabilir. Skor zaten var.

**Act 1–5 öğreticileri (istek 2026-10-24, yapıldı 2026-10-25):** her oyunun ilk aşaması kısa bir dersle açılıyor (ortak `js/core/Coach.js`). Ders boyunca süre durur ve hatalar sayılmaz: Timing Bar'da ıska can götürmez, Stack Overflow'da düşen blok geri verilir, Orbital Shield'da kaçan paket can götürmez. Dersler: Timing Bar (çubuk → bölge → bir isabet), Stack Overflow (çizgi → vinç → bir blok bırak ve otursun), Orbital Shield (portlar → kalkanı yanıp sönen porta götür → bir paket engelle), Signal Lock (iki dalga → basılı tut / bırak → bir anahtar kilitle), Route Trace (iki düğüm → bir karo çevir → yeşil hat → ilk rotayı tamamla). Her ders bir kez gösterilir (`sb_coach_<oyun>`).

### Act 8: Defrag, 4 aşama 📝 (plan ve ilk uygulama, 2026-10-25)

**Fikir:** Act 7'de bomba etkisiz hale getirildi, şimdi çekirdek temiz yedeklerden **yeniden yazılıyor**. Çekirdek diski bir ızgara. Yedekten gelen veri blokları Tetris benzeri parçalar halinde yan tarafta bekliyor. Oyuncu hepsini boş sektörlere sürükleyip diski **eksiksiz dolduruyor**. Bu, defragmentation'ın görsel bir metaforu.

- 2026-10-25'te dört öneri arasından seçildi: A "Defrag", B "Clean Snapshot" (farkı bul), C "Boot Sequence" (hafıza), D "Service Restart" (bağımlılık sırası).
- **Karar:** ilk üç aşama sadece A. **Uzman** aşaması A + B karışımı: bazı yedek parçalar bozuk, temiz görüntüyle karşılaştırılıp ayıklanıyor.
- **Act 7'den alınan ders:** oyun ilk bakışta anlaşılmalı. Hedef tek cümle: "Fill every empty sector". Öğretici okutarak değil, oynatarak öğretecek.
- **Fizik yok.** Izgaraya oturan parçalar, analitik çizim.

**Ekran (telefon uyumu için):**
- Solda **disk**: ızgara (en fazla 7×7, telefonda bir hücre en az ~32 px). Boş sektörler koyu, bozuk sektörler kırmızı çizgili ve kullanılamaz.
- Sağda **tepsi**: bekleyen parçalar küçültülmüş halde. Sürüklenen parça disk boyutuna büyüyor.
- Telefonda parça parmağın biraz **üstünde** taşınıyor, böylece parmak parçayı kapatmıyor. Bırakılacağı yer bir **gölge** ile gösteriliyor: yeşil = sığar, kırmızı = sığmaz.
- Üstte süre ve "DISK 1/3", altta tek satırlık hedef cümlesi.

**Oynanış:**
- Parçayı tepsiden diske sürükle. Izgaraya oturur. Sığmazsa tepsiye geri döner (ceza yok).
- Diske konmuş bir parça tekrar alınıp taşınabilir ya da tepsiye geri bırakılabilir.
- **Döndürme:** parçaya kısa dokunuş (tepside ya da elde) 90° döndürür. Masaüstünde sağ tık ya da R tuşu da döndürür.
- Klavye: Tab / 1–9 ile parça seç, oklarla taşı, R ile döndür, Space ile bırak.
- Disk tamamen dolunca "DISK RESTORED" görünüyor, kısa bir duraklamadan sonra yeni disk geliyor. Aşamanın bütün diskleri bitince aşama tamamlanıyor.
- **Kaybetme:** süre biterse. Can yok (ilk üç aşamada yanlış hamle cezası da yok, baskıyı süre sağlıyor).

**Bulmaca garantisi:** önce disk kuruluyor (bozuk sektörler dahil), sonra boş hücreler rastgele büyütülen bağlantılı parçalara (2–5 hücre) bölünüyor. Böylece her disk çözülebilir. Parçalar rastgele döndürülüp karıştırılarak tepsiye konuyor. Çok küçük parça sayısı (1 hücrelik "dolgu" parçaları) sınırlanıyor ki bulmaca kolaylaşmasın.

**Uzman (A + B):**
- Tepsinin altında çekirdeğin **temiz görüntüsü** (CLEAN SNAPSHOT) duruyor: hücre çizgileri ve bozuk sektörleriyle, büyük boyutta. Her parça kendi görüntü parçasını taşıyor, yani artık **kendi yerine** gitmesi gerekiyor (yapboz gibi).
- **Disk boş** (2026-10-25, kullanıcı isteği): ilk sürümde temiz görüntü diskin üstünde soluk olarak da duruyordu, bu da her parçanın yerini veriyordu. Kaldırıldı; oyuncu yeri yandaki görüntüye bakarak buluyor. Sürüklerken çıkan gölge de sadece şeklin sığıp sığmadığını gösteriyor, görüntünün eşleşip eşleşmediğini değil (yoksa gezdirerek yer bulunurdu). Eşleşmeyen yere bırakılan temiz blok cezasız tepsiye döner.
- Tepside bazı parçaların **bozuk ikizi** var: şekil aynı, ama görüntüde 1–2 piksel farklı. Oyuncu temiz görüntüyle karşılaştırıp bozuk olanı **TRASH** kutusuna sürüklüyor.
- Bozuk parçayı diske koymak: "CORRUPTED BACKUP", parça çöpe gider, **−10 saniye**. Temiz parçayı çöpe atmak: "CLEAN DATA LOST", parça tepsiye geri döner, **−10 saniye**.
- Farklar sadece renkle değil parlaklık ya da desenle de görülecek (renk körlüğü).

**Aşamalar (taslak, bot taramasıyla ayarlanacak, onay bekliyor):**

| | Kolay | Orta | Zor | Uzman (A + B) |
|---|---|---|---|---|
| Disk | 2 | 3 | 3 | 2 |
| Izgara | 5×5 | 6×6 | 7×6 | 6×6 |
| Parça (hücre) | 5–6 (3–4) | 7–8 (3–5) | 9–10 (3–5) | 7–8 + 2–3 bozuk ikiz |
| Parçalar dönük gelir | – | ✓ | ✓ | ✓ |
| Bozuk sektör | – | 2–3 | 4–5 | 2 |
| Disk haritası (yer çizgileri) | hepsi | hepsi | yarısı | yok (görüntü yeri gösterir) |
| Yerleşim | serbest | serbest | serbest | görüntüye göre sabit |
| Süre (aşamanın tamamı) | 120 sn | 250 sn | 290 sn | 250 sn |

**Denge sonucu (taslak, 2026-10-25):** gerçek üreticiyle, aşama başına 200 deneme. Botlar basit bir çözme süresi modeliyle oynuyor: parça başına bakma süresi, parça büyüklüğü, tepside kalan parça sayısı (seçenek çokken düşünmek uzun sürer), dönük parça ve bozuk sektör payı. Uzman'da her parça için resimde yerini bulma ve her bozuk ikiz için karşılaştırma eklendi. "İyi" bot 0.75×, "ortalama" 1×, "yavaş" 1.45× hızda; yanlış bırakma ve geri alma olasılıkları %5 / %12 / %20. Süreler modelin yaklaşık 1.6–2 katı.

| Bot | Kolay | Orta | Zor | Uzman |
|---|---|---|---|---|
| İyi | 200/200 | 200/200 | 200/200 | 200/200 |
| Ortalama | 200/200 | 200/200 | 200/200 | 200/200 |
| Yavaş | 120/200 | 27/200 | 22/200 | 60/200 |

- İlk taslakta (90 / 150 / 180 / 150 sn) ortalama bot Orta'dan sonrasını neredeyse hiç geçemiyordu, süreler bu yüzden uzatıldı.
- Yavaş oyuncu için revive (+20 sn) var. Oyun testine göre ayarlanacak.

**Revive:** Lockpick ile **+20 saniye**, aynı disk kaldığı yerden devam ediyor. Aşama başına 2 hak, her biri 1 enerji.

**Skor:** disk başına 300, kalan her saniye için 10. Uzman'da her ceza −100.

**Yıldızlar (taslak, onay bekliyor):** kalan süreye göre, Signal Lock ve Route Trace gibi. 3 / 2 yıldız için kalan saniye: Kolay 50 / 25, Orta 90 / 40, Zor 100 / 45, Uzman 90 / 40. Uzman'da ceza alınırsa en fazla 2 yıldız. Revive kullanılırsa en fazla 1 yıldız.

**Eğitim (coach, `sb_coach_defrag`):**
- Kolay'ın ilk diski elle kurulmuş küçük bir disk: önce "bu bloğu parlayan yuvaya sürükle", sonra "döndürmek için dokun", sonra "kalan boşlukları doldur".
- Döndürme (Orta), bozuk sektörler (Orta) ve bozuk yedekler ile TRASH (Uzman) ilk göründüklerinde bir kez anlatılıyor. Baloncuk açıkken süre duruyor.

**Teknik iş:**
- `InputManager`'daki sürükleme şu an sadece dokunmatik ve sadece HUB için. **Fareyle sürükleme** eklenecek ve MINIGAME barındırıcısı sürüklemeyi oyuna iletecek (`wantsDrag`: `handlePointer(x, y, 'down' | 'move' | 'up')`).
- Sağ tık (döndürme) tarayıcı menüsünü açmamalı.

**Sonsuz mod uyumu:** diskler art arda sonsuza kadar gelebilir. Izgara, parça sayısı ve bozuk sektörler büyür, süre kısalır. Skor zaten var.

**Disk haritası (ilk oyun testinden sonra, 2026-10-25):** Kullanıcı oyunu zor buldu. Neden süre değil bulmacanın kendisiydi: serbest yerleştirmeli parça bulmacasında her parça birçok yere ve dört yöne konabiliyor, oyuncu sürekli deneme yanılma yapıyor. Bot modeli bu geri dönüşleri ölçmüyordu. Çözüm olarak diskte parçaların kesildiği yerler ince çizgilerle gösteriliyor (`map`). Oyun "kombinasyon aramak" yerine "şekli boşluğa eşleştirmek" oluyor. Kolay ve Orta'da bütün boşluklar, Zor'da yarısı çizili, Uzman'da harita yok (görüntü zaten yeri gösteriyor). Haritaya uymayan ama sığan bir yerleşim de geçerli. Süreler şimdilik aynı bırakıldı, oyun testine göre ayarlanacak. Gerekirse sonraki adım: takılınca bir bloğun yerini gösteren ipucu düğmesi (−10 sn).

**Uygularken verilen kararlar (2026-10-25):**
- Uzman'daki çekirdek görüntüsü her disk için **üretiliyor**: ortası parlak, kenarı koyu bir amblem, üstüne piksel piksel hafif gürültü. Bu gürültü sayesinde hiçbir hücre başka bir hücreyle aynı değil, yani bir parça sadece kendi yerinde eşleşiyor. Üretici bunu her diskte kontrol ediyor; aynı görüntü başka bir yerde de tutarsa disk yeniden üretiliyor.
- Bozuk ikizde 2 piksel, renk paletinde en az iki adım uzak bir renge çevriliyor (parlaklık farkı da olsun diye).
- Ders diski (4×4, dört parça) aşamanın ilk diski sayılıyor. Ders boyunca süre duruyor.
- Fareyle sürükleme ve sağ tık altyapısı eklendi (`InputManager` + `GameManager._dragGame`). Sürükleme oyunları `wantsDrag` ile işaretleniyor.

### Act 9: FINAL_AUDIT 🛠

**Kesin olan (2026-10-21):** Act 9 **süre ya da can üzerine değil, tamamen bilgi ve zihin becerisi** üzerine kurulu olacak. (Bu karar verildiğinde Act 9 son act'ti. 2026-10-23'te final act olarak Act 10 eklendi, karar Act 9 için geçerli kalıyor.)
- Refleks, zamanlama ya da el becerisi istemez. Oyuncunun bilgisini ve akıl yürütmesini sınar: mantık, çıkarım, örüntü ya da bilgi soruları gibi.
- Süre sınırı yok, can yok. Kesin format birlikte belirlenecek.

**Eklenen kararlar (2026-10-25, kullanıcı):**
- **5 aşama.**
- Final act havasında: **baştan sona zor**.
- Süre sınırı ve can sınırı yok. Oyuncu bitirene kadar istediği kadar deneyebilir; oyun hiçbir zaman "kaybettin" demez.
- **Oyun: Checksum Grid** (2026-10-25'te dört öneri arasından seçildi: A Checksum Grid / nonogram, B Infection Sweep / tahminsiz mayın tarlası, C Root Cause / mantık ızgarası, D Integrity Lights / Lights Out).

**Checksum Grid:**
- Çekirdeğin bellek haritası bir ızgara. Her satırın solunda ve her sütunun üstünde bir **sağlama toplamı (checksum)** var: "3 1 2", o satırda sırayla 3, 1 ve 2 dolu hücreden oluşan bloklar olduğunu söyler (aralarında en az bir boşluk). Oyuncu bu toplamlardan temiz haritayı yeniden kuruyor. Bitince bir amblem ortaya çıkıyor.
- **Her bulmaca tek çözümlü ve tahminsiz:** üretici, satır satır mantıkla (line solver) baştan sona çözülebildiğini kontrol ediyor. Zorluk, çözücünün kaç tur gerektirdiğiyle ölçülüyor (uzun mantık zincirleri = daha çok tur).
- **Kontrol:** FILL ya da ✕ (MARK) modu seçiliyor, hücreye dokunmak o modu uyguluyor; dolu hücreye tekrar dokunmak temizliyor. Parmakla ya da fareyle sürükleyince aynı işlem bir satır ya da sütun boyunca uygulanıyor (ilk hareket yönüne kilitlenir). Masaüstünde sağ tık her zaman ✕. Klavye: oklar, Space = doldur, X = ✕, Z / Backspace = geri al, Enter = AUDIT.
- **UNDO** son hamleyi (bir sürükleme dahil) geri alıyor.
- Satırı sağlama toplamına uyan sayılar griye dönüyor (doğru çözüm olup olmadığını söylemez, sadece o satırın sayıya uyduğunu).
- **Bitirme kuralı her an ekranda (2026-10-25, kullanıcı oyunu anlamadı):** sağ panelde sarı bir GOAL kutusu: "Turn EVERY number grey" ve bir ilerleme çubuğu (kaç satır + sütun uyuyor). Aynı kural dersin ayrı bir adımında ("HOW TO WIN"), RULES kutusunun ilk maddesinde, alt ipucunda ve rehberde de yazıyor.
- **RULES kutusu:** sağ panelde dönen kural hatırlatmaları (`TipBar.RULES.checksum`), dokununca sıradakine geçer.
- **AUDIT:** yanlış doldurulmuş ve yanlış ✕'lenmiş hücreleri kırmızı yakar. Hata bulan her AUDIT bir **denetim hatası** sayılır; hata bulmazsa ücretsizdir.
- Bütün satır ve sütunlar toplamlara uyunca aşama biter (tek çözüm olduğu için bu kesin doğrudur).
- Süre yok, can yok, kaybetme yok. Revive yok.

**Aşamalar (taslak):**

| | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Izgara | 8×8 | 10×10 | 10×10 | 12×12 | 12×12 |
| Çözücü turu (en az) | 3 | 4 | 6 | 6 | 9 |
| Desen | yumuşatılmış | yumuşatılmış | ham | yumuşatılmış | ham |

**Yıldızlar (taslak):** 3 yıldız = hiç denetim hatası yok; 2 yıldız = en fazla 2; 1 yıldız = bitirmek.
**Skor:** 1000 − her denetim hatası için 150 (en az 250).
**Ders (Coach):** ilk aşamada sağlama toplamlarının anlamı, bir hücre doldurma, bir ✕ koyma, gri sayılar ve AUDIT anlatılıyor. Bir kez gösteriliyor (`sb_coach_checksum`).
**Sonsuz mod uyumu:** ızgaralar büyüyüp çözücü turu artırılabilir.
**Not:** aşamadan çıkınca yarım kalan ızgara kaybolur. Uzun bulmacalar için ileride kaydetme düşünülebilir.

### Act 10: RETURN_CONTROL, final act 🛠 (plan, 2026-10-23)

**Tema:** Saldırgan temizlendi ve sistem doğrulandı. Şimdi erişim **asıl sahibine geri veriliyor**. Oyuncu artık savunan kişi değil, sistemi sahibine teslim eden ve ona sistemi güvende tutmayı öğreten kişi.

**Kesin olanlar:**
- **Final act** budur. `CAMPAIGN.finalAct = 10`. Endless Mode bu act bitince açılır (önceden açmış olanlarda açık kalır).
- **Eğitici içerik ağırlıklı.** Oyuncu oynarken gerçek hayatta işine yarayacak güvenlik alışkanlıklarını öğrenmeli.
- **Bağımsız statü: HANDOVER.** PERIMETER / INTERNAL / CORE katmanlarının dışında. Haritadaki üst rayda kendi parantezi ve etiketi var, rengi turkuaz (`#2dd4bf`). Arka plan atmosferi sakin: sistem artık temiz.
- Kodda şimdilik "IN DEVELOPMENT" olarak duruyor (`available: false`): tema ve ikon (açık kilit) hazır, oyun yok.
- **6 aşama** (2026-10-25, kullanıcı).
- **Format (2026-10-25, kullanıcı):** her aşama, bu tür bir saldırıdan sonra **gerçek hayatta yaşanan bir durumu** canlandıran eğitici bir simülasyon. Örnek, ilk aşama: **virüs taraması simülasyonu**. Sahip sistemi geri alırken yeni dosyalar geliyor; oyuncu dosyaları virüs taramasından geçiriyor, virüslü olanları önden ayıklayıp atıyor ve sahibe sadece temiz dosyaları ulaştırıyor.
- Yetki seviyesi: Act 10 bitince oyuncu **L10 GUARDIAN** olur.
- **Kapı 9** (Act 9 → 10) Packet Purge ayarı Act 10 ile birlikte belirlenecek.

**Birlikte karar verilecekler (sırası gelince):**
- Oyunun formatı ve mekaniği. Act 9 zaten bilgi ve mantık sınavı olduğu için Act 10'un ondan farkı net olmalı: Act 9 **sınar**, Act 10 **öğretir**.
- Öğretilecek konular. Örnek fikirler: güçlü parola ve parola yöneticisi, iki aşamalı doğrulama, oltalama (phishing) e-postasını tanıma, güncellemeler, yedekleme, şüpheli bağlantı ve dosyalar.
- Süre ve can olup olmayacağı.
- Kalan 5 aşamanın konuları (ilk aşama: virüs taraması).
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

### 5b. Herkesin verileri tamamen silinecek (karar 2026-10-23, güncellendi 2026-10-24, henüz uygulanmadı)

**Karar:** Oyun **her şey bittiğinde** (Act 7–10 ve yeni sonsuz mod tamamlanıp son sürüm yayına girerken) bütün oyuncuların verileri **tamamen** silinecek. Herkes oyuna sıfırdan başlayacak. Yukarıdaki göç (eski ilerlemenin taşınması) ve "Endless'ı zaten açmış olanlarda açık kalır" kuralı bu silmeyle geçerliliğini yitirir.

**Zaman:** İlk karar sıfırlamanın Act 6 ile gelmesiydi (2026-10-23). 2026-10-24'te değişti: sıfırlama son sürümle birlikte, her şey bittiğinde yapılacak. O zamana kadar oyuncuların ilerlemesi korunur.

**Kapsam: tamamen silme.**
- **Tarayıcıda:** oyunun bütün `sb_` anahtarları silinir. Kampanya ilerlemesi, yıldızlar, kapılar, Endless kilidi ve en iyi skoru, enerji, kapı deneme sayaçları, eski kayıt kalıntıları, eğitim işaretleri (`sb_coach_*`), kılavuz bilgisi ve ses tercihi de dahil. Tercih olarak hiçbir şey korunmaz.
- **Sunucuda:** bütün Endless leaderboard skorları ve operatör profilleri (isim + şifre) silinir. Herkes Endless'ı yeniden açınca yeni bir operatör adı alır.
- **Bildirim yok:** oyun sessizce baştan başlar.

**Önerilen uygulama:** Bir kayıt dönemi (`sb_save_epoch`). Oyun açılınca kayıttaki dönem eski ya da yoksa bütün `sb_` anahtarları bir kez silinir ve yeni dönem yazılır. Böylece her oyuncu tam bir kez sıfırlanır, sonrasında ilerlemesi normal şekilde birikir.

**Yayın adımları (son sürümde):**
1. İstemci: kayıt dönemi ile bütün `sb_` anahtarlarını bir kez silmek. Testleriyle birlikte.
2. Sunucu: skorları ve operatör profillerini silen bir SQL dosyası (`supabase/` altında). Önce yerel bir Postgres'te denenir, canlı projede **kullanıcı** çalıştırır.
3. İkisi aynı anda yayına girer: önce SQL, hemen ardından `v2` push'u.

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
| 5 | Act 6 Network Cut (can + mantık, 4 aşama, bölüm 3) ve Kapı 5 | ✅ Yayında (2026-10-24) |
| 6 | Act 7 Logic Bomb (süre + arıza, 4 aşama, bölüm 3) ve Kapı 6 | ✅ Yayında, taslak kademelerle (2026-10-24) |
| 7 | Act 8 Defrag (yerleştirme bulmacası, 4 aşama, bölüm 3) ve Kapı 7 | 🛠 Geliştiriliyor |
| 8 | Act 9 Checksum Grid (nonogram, 5 aşama, bölüm 3) ve Kapı 8 | 🛠 Geliştiriliyor |
| 9 | Act 10 RETURN_CONTROL (eğitici final), Kapı 9 ve final ekranı. Endless yeni oyuncular için açılır. | Bekliyor |
| Son | Yeni çok oyunlu sonsuz mod tamamlanınca: **herkesin verileri tamamen silinir** (bölüm 5b). | Bekliyor |

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
- **Giriş ekranındaki STATUS REPORT ilerlemeye göre (2026-10-23):** Hiç aşama bitirmemiş oyuncu giriş hikayesini okur. İlk aşamadan sonra rapor oyuncunun durumunu anlatır:
  - Saldırganın bulunduğu katmana göre uyarı: PERIMETER'da `[WARNING]`, INTERNAL ve CORE'da `[ALERT]`, HANDOVER'da `[SECURE]`.
  - Kaç act bitti ve kaç yıldız toplandı.
  - Şimdiye kadar güvenceye alınanlar ("malware purged, firewall rebuilt…"; en fazla son dördü).
  - **NEXT:** sıradaki aşama (oyun adı ve kaç aşama kaldığıyla), girilecek kapı ya da geliştirilen act.
  - Her act'in rapordaki adı `Campaign.js`'teki `done` alanında.
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
7. Endless son act bitince açılır, zaten açmış olanlarda açık kalır. (Son act o zaman 6'ydı, 2026-10-21'den itibaren 9, 2026-10-23'ten itibaren 10. "Açık kalır" kuralı planlanan sıfırlamayla sona erer, bkz. 5b.)
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

**2026-10-23**
18. **Kampanya 10 act.** Act 10 RETURN_CONTROL final act: erişim asıl sahibine geri veriliyor, içerik eğitici. Kendi statüsü HANDOVER (bölüm 3). Endless bu act'ten sonra açılıyor.
19. **Endless sadece halkadan:** Endless ve leaderboard HUB'da sadece raydaki ∞ halkasının arkasında. Kilidi açanlar için HUB Endless kartında açılıyor, ayrıca kendilerine özel bir giriş ekranı var (bölüm 8b).
20. **Herkesin verileri silinecek**, herkes sıfırdan başlayacak. 2026-10-24 güncellemesi: Act 6 ile değil, **her şey bittiğinde** (son sürümde) ve **tamamen** (tarayıcıdaki bütün `sb_` verileri, leaderboard skorları, operatör profilleri). Oyunculara bildirim gösterilmez (bölüm 5b).
21. **Act 6:** Network Cut. Saldırganı çekirdeğe bağlayan bütün yollar sınırlı makasla kesilir. Can + mantık oyunu, süre yok. Kademelerle sahibin hattı, zırhlı kablo ve yedek hat (failover) eklenir. Kural kartlı kablo fikri Act 7'ye ayrıldı (bölüm 3).
22. **Act 6 kademeleri (2026-10-24):** L2 ayarı onaylandı: can 3/4/5/5, makas payı +2/+1/+1/+1, sütun 5/5/6/6. Çelik ana hatlar ve kolay yol kontrolü eklendi.
23. **Act 7:** Logic Bomb (2026-10-24). Modüler bir payload kasası: veri hatları (kural kartı), tetik devresi (mantık kapıları), sembol tuş takımı ve basılı tut düğmesi. Ortak geri sayım ve arıza sınırı var, fizik yok. Telefon için bir anda tek modül ve onun kartı gösteriliyor. Kademeler ve yıldızlar taslak, onay bekliyor. İlk oyun testinden sonra (aynı gün) Uzman kaldırıldı (4 aşama), her aşama tek yeni şey getiriyor, devre canlı oldu, kılavuz yeniden düzenlendi ve ilk modül adım adım ders oldu.
24. **Act 8:** Defrag (2026-10-25). Çekirdek diski bir ızgara, yedekten gelen Tetris benzeri bloklar sürüklenip boş sektörlere yerleştiriliyor, disk tamamen doldurulunca geri yükleniyor. Süre baskısı, can yok. Uzman aşaması A + B karışımı: bazı parçaların bozuk ikizi var, temiz görüntüyle karşılaştırılıp çöpe atılıyor.
25. **Act 1–5 dersleri (2026-10-25):** ilk aşamalar kısa, oynatarak öğreten bir dersle açılıyor. Ders boyunca süre durur, hata sayılmaz. Ortak altyapı `Coach`.
26. **Act 9 ve Act 10 (2026-10-25):** Act 9 5 aşamalı, baştan sona zor, süre ve can sınırı yok (oyuncu bitirene kadar dener). Act 10 6 aşamalı; her aşama gerçek hayattaki bir durumu canlandıran eğitici bir simülasyon, ilki virüs taraması (gelen dosyaları tarayıp virüslüleri ayıklamak, sahibe temiz dosyaları ulaştırmak).
27. **Act 9:** Checksum Grid (2026-10-25). Nonogram: satır ve sütun sağlama toplamlarından temiz bellek haritası yeniden kuruluyor. Tek çözümlü, tahminsiz bulmacalar. Süre, can ve kaybetme yok; yıldızlar denetim (AUDIT) hatalarına göre.
