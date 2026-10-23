# SyncBreaker: Arayüz Planı (kademe teması + harita)

Durum: **kararlar verildi, uygulama UI-1 ile başlayacak** (2026-10-21). Oyun mekaniklerine ve zorluk sayılarına dokunmaz. Sadece menü, harita, act ekranı ve ortak arayüz parçalarını kapsar.

## 1. Amaç

- Arayüz bir yönetim paneli gibi değil, bir **oyun** gibi hissettirsin.
- İlerleme gözle görülsün: oyuncu sistemin derinine indikçe arayüz de değişsin (**kademe teması**).
- Masaüstünde (fare + klavye) ve yatay tutulan telefonda (~844×390, dokunma) aynı kalitede çalışsın.
- Mevcut yapı korunur: canvas, `UIManager` butonları, `StateManager` durumları, klavye ile gezinme ve geri tuşu davranışı.

## 2. Bugünkü durum: gözlemler

Ekranlar 960×640 canvas'ta ve 844×390 telefon görünümünde incelendi.

| # | Gözlem | Sonuç |
|---|---|---|
| 1 | Telefonda canvas 585×390 boyutunda gösteriliyor, yani **ölçek 0.61**. | 13 px'lik bir yazı telefonda ~8 px oluyor. `BEST`, `TIP`, raydaki numaralar zor okunuyor. |
| 2 | Raydaki düğümler 32 px, kapılar 44 px. | Telefonda bunlar ~20 ve ~27 nokta. Önerilen en küçük dokunma alanı 44 nokta. |
| 3 | Canvas'ın arka tamponu her zaman 960×640, `devicePixelRatio` hesaba katılmıyor. | 2× ve 3× ekranlarda yazılar ve çizgiler bulanık. Oyun hissini en ucuza artıracak düzeltme bu. |
| 4 | Telefonda ekranın yanlarında 2 × ~130 px boş alan kalıyor (genişliğin %31'i). | Sadece yıldızlı arka plan görünüyor. Şimdilik sorun değil ama oraya bir şey konabilir. |
| 5 | Harita bir carousel: aynı anda tek act görünüyor, 9 act'in bütünü sadece küçük rayda görülüyor. | Yolculuk ve "derine iniyorum" hissi zayıf. |
| 6 | Bütün kartlar aynı çerçeveyi kullanıyor, act'leri sadece renkleri ayırıyor. Zorluk kademeleri (EASY…EXPERT) sadece yazı. | Kademe kimliği yok. |
| 7 | Glow efekti her karede `shadowBlur` ile çiziliyor. | Telefonda pahalı. Yeni efektler eklenirse önbelleğe alınmalı. |

## 3. Konsept: "Sisteme iniş"

Saldırgan ağın derinine sızmış. Oyuncu dış katmandan çekirdeğe doğru ilerleyerek sistemi temizliyor. Kademe teması üç katmanda işliyor:

### 3a. Ağ katmanları (act'lerin kademeleri)

9 act, üç güvenlik katmanına ayrılıyor. Her katmanın kendi atmosferi var: arka plan, ızgara, partiküller, ses tonu.

| Katman | Act'ler | Görsel dil |
|---|---|---|
| **PERIMETER** (dış hat) | 1 · 2 · 3 | Soğuk mavi ve camgöbeği, geniş ızgara, sakin veri yağmuru |
| **INTERNAL** (iç ağ) | 4 · 5 · 6 | Kehribar, devre izleri, daha yoğun ve hızlı veri akışı |
| **CORE** (çekirdek) | 7 · 8 · 9 | Kırmızı ve mor, titreşen çekirdek ışığı, glitch ve tarama çizgileri |

- Act renkleri (`themeId`) aynı kalıyor. Katman rengi sadece zemin ve çerçeve için kullanılıyor.
- Katmanlar arasındaki kapılar (Kapı 3 ve Kapı 6) carousel'de daha büyük bir "katman duvarı" olarak çiziliyor. Bu sadece görsel bir fark, oynanış değişmiyor.

### 3b. Zorluk kademeleri (aşama kimliği)

Her aşama kademesine sabit bir renk ve **şekil** veriliyor. Bilgi sadece renkle verilmiyor, çünkü renk körlüğü olan oyuncular da ayırt edebilmeli.

| Kademe | Renk | Rozet |
|---|---|---|
| EASY | yeşil | I · tek şerit |
| NORMAL | mavi | II · iki şerit |
| HARD | kehribar | III · üç şerit |
| VERY HARD | kırmızı | IV · dört şerit |
| EXPERT | mor | V · taç ya da elmas |

Bu rozetler act ekranında, sonuç ekranında, haritadaki panelde ve oyun içi HUD'da aynı görünüyor.

### 3c. Operatör yetkisi ve sistem bütünlüğü (oyuncunun kademesi)

- **Yetki seviyesi (clearance):** Her tamamlanan act oyuncuyu bir seviye yükseltiyor. Bu seviye başlıkta bir rozet olarak duruyor. İsimler taslak, değişebilir:

  | L0 | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 |
  |---|---|---|---|---|---|---|---|---|---|
  | GUEST | USER | TECH | ANALYST | OPERATOR | ENGINEER | ADMIN | SECOPS | SYSADMIN | ROOT |

- **Yükselme anı:** Bir act tamamlanınca act ekranına dönüşte kısa bir "CLEARANCE GRANTED · L4 OPERATOR" bildirimi gösteriliyor. Bu sadece bir kez oynuyor.
- **Sistem bütünlüğü:** %0'dan %100'e giden tek bir gösterge. Temizlenen her aşama bir pay ekliyor. Değer düşükken menü ve harita bozuk görünüyor (kırmızı uyarı, glitch, parazit). Arttıkça arayüz sakinleşiyor ve temizleniyor.
- Her ikisi de mevcut kayıttan (`sb_campaign_v1`) hesaplanıyor, **yeni kayıt alanı gerekmiyor**.

### 3d. Aşama derecesi: 1–3 yıldız (ayrı faz, UI-5)

- Her aşama 1–3 yıldızla bitiyor. Bu, aşamaları tekrar oynamak için sebep veriyor. Kartlarda yıldızların yeri UI-2'den itibaren ayrılıyor.
- Derece ham skordan değil, her mekaniğin vereceği 0–1 arası bir **performans oranından** hesaplanıyor (kalan can, kalan süre, isabet gibi). Ham skorlar oyundan oyuna çok farklı.
- Eşikler oynanışı değiştirmez, ama kullanıcının onayı ve bir bot taramasıyla belirlenmeli. Ayrıca kayda yeni bir alan (`stars`) eklenmeli. Eski kayıtlarda bu alan 0 sayılıyor.

## 4. HUB: gelişmiş carousel (karar: 2026-10-21)

Carousel yapısı kalıyor (`_mapIndex` / `_mapScroll`, yan kartlar, oklar, üstteki ilerleme rayı). Değişen kısım görünüm ve dokunma rahatlığı.

- **Act kartı bir oyun kartına dönüşüyor:**
  - Üst yarıda act ikonu büyük bir "sahne" içinde duruyor. Zemin act'in temasıyla çiziliyor (`themeId` rengi ve arka plan türü: binary, scanlines, virus…).
  - Altta act adı, oyun adı ve hikaye satırı var.
  - Aşama noktaları yerine kademe rozetleri (I–V, bölüm 3b) kullanılıyor. Bitenler dolu, sıradaki nabız gibi atıyor.
  - Duruma göre şerit:
    - Tamamlanan act: "SECURED" damgası.
    - Kilitli act: parazit efekti ve kilit.
    - Geliştirilen act: "SIGNAL LOST".
- **Derinlik hissi:** Yan kartlar küçülüyor ve kararıyor (bugünkü gibi). Ayrıca arka plan kaydırma sırasında paralaks ile hafif kayıyor. Katmanlar onaylanırsa, kart hangi katmandaysa arka plan o katmanın atmosferine geçiyor.
- **Kapılar:** Kartların arasında bir "güvenlik duvarı" çizgisi var: açık kapı yeşil ve geçilebilir, oynanabilir kapı turuncu ve nabız gibi atıyor, kilitli kapı gri. Kapının dokunma alanı en az 72 px.
- **Üst ray:** Düğümler büyüyor (dokunma alanı 72 px, çizim 12–14 px yarıçap). Katmanlar onaylanırsa ray 3 renkli bölüme ayrılıyor. Rayın altındaki sayaç yerine yetki seviyesi ve sistem bütünlüğü (bölüm 3c) gösteriliyor.
- **Mobil:** Kartı parmakla sürükleyince carousel parmağı takip ediyor, bırakınca en yakın karta oturuyor (hızlı kaydırma ile bir kart ileri ya da geri gidiyor). Masaüstünde oklar, tekerlek ve klavye eskisi gibi çalışıyor.
- **Endless / Leaderboard:** Yerleri aynı kalıyor, yeni buton stiline geçiyorlar.

Değerlendirilip seçilmeyen yol: 9 act'i tek ekranda gösteren ağ haritası.

## 5. Act ekranı: başlık aynı, aşama seçici ilerleme gösteriyor (karar: 2026-10-21)

**Aynı kalanlar:** `ACT n · OYUN ADI` satırı, act adı (`RESET_CREDS` gibi), hikaye ve kontrol satırı, enerji, `?` butonu, `← ACTS` butonu.

**Değişen kısım: aşama seçici.** Amaç, masaüstünde ve telefonda oyuncunun "nereden geldim, neredeyim, sırada ne var" sorularını tek bakışta görmesi. Seçilen: **taslak A**.

- **A · Yükselen merdiven ve dolan hat (seçildi):**
  - Kartlar soldan sağa basamak basamak yükseliyor. Her basamak bir önceki karttan ~18 px yukarıda.
  - Kartların içinden bir devre hattı geçiyor. Hat bitirilen aşamalara kadar act renginde dolu, sonrası kesik çizgili.
  - Hattın sonunda kapı düğümü var. Bütün aşamalar bitince kapı yanıyor ve BREACH GATE butonu ona bağlanıyor.
- **B · Kademe hattı ve kart sırası (seçilmedi):**
  - Kartlar düz bir sırada kalıyor. Üstlerinde I–V düğümlü bir ilerleme hattı ve `3/5 · %60` sayacı var.
  - Daha sade ve bugünkü görünüme daha yakın, ama ilerleme hissi daha zayıf.

**Ayrıntılar:**
- **Sıradaki aşama** biraz daha büyük ve çerçevesi parlak, üstünde `NEXT ▸` yazıyor. Seçili aşamaya klavyeyle gelinmiş olsa da aynı vurgu kullanılıyor.
- **Kart içeriği:** kademe rozeti, kademe adı, özet (`4 KEYS · 45s` gibi), durum ve en iyi skor. Onaylanırsa derece de gösteriliyor.
- **Kilitli kartlar:** kesik çerçeveli, parazitli ve üstlerinde kilit var.
- **Yeni açılma animasyonu:** Bir aşama bitip act ekranına dönülünce hat bir sonraki karta kadar dolarak ilerliyor (~0.6 s). Kilit kırılıyor ve kart "açılıyor". Bu animasyon sadece yeni açılan aşamada bir kez oynuyor.
- **Boyutlar:** 3, 4 ve 5 aşamalı act'lerin hepsi 960 px genişliğe sığıyor. Kartlar en az 150×130 px, yani telefonda ~92×80 nokta. Yazılar en az 16 px.
- **Gezinme:** Masaüstünde oklar ve Enter, telefonda dokunma. Esc ve geri hareketi eskisi gibi çalışıyor.

## 6. Ortak görsel dil

Yeni bir `js/UITheme.js` dosyası (global nesne) bütün ekranların ortak değerlerini tutuyor:

- **Renk değişkenleri:** zemin, panel, çerçeve, metin (birincil, ikincil, sönük), durum renkleri, kademe renkleri, katman renkleri.
- **Yazı boyutları:** canvas pikseliyle en küçük boyutlar şunlar:
  - Birincil metin 20 px (telefonda ~12 nokta).
  - İkincil metin 16 px.
  - Küçük etiketler en az 14 px. 13 px ve altı kullanılmıyor (menü, HUB, act ekranı, kılavuz, ⏸ paneli; oyunların kendi HUD'ları hariç).
- **Parçalar:**
  - Köşesi kesik (chamfer) paneller.
  - Kesik köşeli butonlar: üstüne gelince tarama çizgisi geçiyor, basınca içe çöküyor.
  - Rozet, ilerleme halkası ve gösterge çubuğu.
- **Hareket:** Ekran geçişleri 200–300 ms ve kısa bir glitch efektiyle yapılıyor. Aşama bitince bir "ACCESS GRANTED" damgası çıkıyor. Sistemde "hareketi azalt" ayarı açıksa (`prefers-reduced-motion`) efektler sadeleşiyor.
- **Performans:** Glow ve parazit dokuları bir kez ekran dışı bir canvas'a çiziliyor, sonra kopyalanıyor. Her karede `shadowBlur` kullanılmıyor. Partikül sayısı telefonda yarıya iniyor.

## 7. Mobil ve masaüstü

- **Keskin görüntü:** Canvas'ın arka tamponu `960·dpr × 640·dpr` olacak, çizim `ctx.setTransform(dpr, …)` ile ölçeklenecek. Oyun mantığındaki koordinatlar 960×640 kalıyor. `dpr` en fazla 2 ile sınırlanıyor ki performans korunsun.
- **Dokunma alanları:** canvas pikseliyle en az 72 px, telefonda ~44 nokta. Küçük butonlar çizildiği gibi kalıyor ama ıskalanan bir dokunuş 72 px içindeki en yakın butona gidiyor (`UIManager.handleClick`). Tam isabet her zaman önce geliyor. Oyun içi ⏸ butonu `exact: true` ile bunun dışında tutuluyor, böylece yakınına yapılan dokunuşlar oyuna gidiyor.
- **Hover** sadece fareyle oynarken çiziliyor. Dokunmatik ekranda seçili durum (focus) kullanılıyor.
- **Yan boşluklar:** Katman arka planı canvas dışına, CSS ile yanlara taşınıyor (UI-4). Canvas'ın değişken genişlikte olması bu planın dışında.
- **Kontrol:** Her ekran hem 960×640'ta hem 844×390'da, 2× DPR ile kontrol edilecek.

## 8. Fazlar

| Faz | İçerik | Bitti sayılması için |
|---|---|---|
| **UI-1 Temel** ✅ 2026-10-22 | Keskin görüntü (DPR), `UITheme.js`, ortak parçalar (panel, buton, rozet), en küçük yazı ve dokunma boyutları | Bütün ekranlar telefonda okunur ve keskin. Testler geçiyor. |
| **UI-2 Act ekranı** ✅ 2026-10-23 | Yükselen merdiven ve dolan hat (taslak A), kademe rozetleri, yeni aşama açılma animasyonu. Başlık aynı kalıyor. | 3, 4 ve 5 aşamalı act'ler 960×640'ta ve 844×390'da düzgün sığıyor. |
| **UI-3 HUB carousel** | Oyun kartları, kapı duvarları, büyük ray düğümleri, sürükleyerek kaydırma, paralaks | Geri tuşu, Esc, oklar ve tekerlek eskisi gibi çalışıyor. Sürükleme telefonda akıcı. |
| **UI-4 Kademe atmosferi** | Katman arka planları, yan boşlukların doldurulması, yetki seviyesi rozeti ve yükselme anı, sistem bütünlüğü göstergesi, giriş menüsünün bütünlüğe göre yenilenmesi | Kayıttan doğru hesaplanıyor ve testleri var. |
| **UI-5 Yıldızlar** | Mekanik başına performans oranı, 1–3 yıldız eşikleri, sonuç ekranında ve kartlarda yıldızlar | Eşikler bot taramasıyla doğrulanmış. |
| **UI-6 Cila** | Ekran geçişleri, damga animasyonları, sesler, hareketi azaltma desteği | Telefonda 60 fps'e yakın çalışıyor. |

- Her faz ayrı bir commit ve sürüm. Her sürümde `?v=` önbellek etiketi artırılıyor.
- Oyunların kendi ekranları (Act 1–5 mekanikleri) bu planın dışında. Sadece ortak HUD parçaları (can, süre, skor) UI-1'de ortaklaştırılabilir.

## 9. Kararlar

**2026-10-21**
1. HUB: carousel kalıyor ve geliştiriliyor (bölüm 4). Ağ haritası seçilmedi.
2. Act ekranının başlığı (act adı ve oyun adı) aynı kalıyor. Sadece aşama seçici değişiyor ve masaüstünde de telefonda da ilerleme hissettirmeli (bölüm 5).
3. Act ekranı ayrı bir ekran olarak kalıyor. Haritada ayrı bir detay paneli yok.
4. Aşama seçici: **taslak A**, yani yükselen merdiven ve dolan hat (bölüm 5). Taslak B seçilmedi.
5. Katmanlar: PERIMETER (1–3) / INTERNAL (4–6) / CORE (7–9), bölüm 3a'daki renklerle.
6. Oyuncunun kademesi: act başına L0–L9 yetki seviyesi ve sistem bütünlüğü göstergesi (bölüm 3c).
7. Derece: 1–3 yıldız, ayrı bir faz (UI-5). Eşikler bot taramasıyla belirlenip kullanıcıya onaylatılacak.
8. Giriş menüsü UI-4'te bütünlük göstergesiyle yenileniyor. UI-1'de sadece okunurluk düzeltiliyor.
9. Telefonda yan boşluklar CSS ile katman arka planıyla dolduruluyor.

## 10. Hâlâ açık olanlar

- Yetki seviyelerinin isimleri (bölüm 3c'deki liste taslak).
- Yıldız eşikleri (UI-5'te bot taramasıyla).

