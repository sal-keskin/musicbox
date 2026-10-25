# Bilye Makinesi — ABC notasyonlu müzik motoru

Notaların üstten düşen bilyelere dönüştüğü, 3B bir müzik makinesi. Her nota bir
bilye olarak nozuldan çıkar, tam çalınacağı anda ksilofon çubuğuna ya da davula
çarpar, sıçrayıp oluğa düşer ve toplama kutusuna yuvarlanır.

Proje iki katmandan oluşur:

1. **Müzik motoru**: [ABC notasyonu](https://abcnotation.com) ile yazılmış
   eserleri ayrıştırır ve çalmaya hazır, zamanlanmış nota olaylarına çevirir.
2. **Bilye makinesi**: Three.js ile çizilen 3B sahne ve Web Audio ile
   sentezlenen sesler. Motorun ürettiği olayları görüntüye ve sese döker.

## Çalıştırma

```bash
npm install
npm run dev          # geliştirme sunucusu (http://localhost:5173)
npm test             # motor, kütüphane, zamanlama ve yörünge testleri
npm run build        # dist/ klasörüne üretim derlemesi
npm run build:single # her şeyi tek bir HTML dosyasına gömer (dist-single/)
```

Tarayıcıda **Çal** düğmesine bas (sesin başlaması için bir tıklama gerekir).
Sahnede sürükleyerek kamerayı döndürebilir, tekerlekle yakınlaşabilir,
çubuklara ve davullara tıklayarak kendin bilye düşürebilirsin.

Kısayollar: `Boşluk` çal/duraklat, `R` başa dön, editörde `Ctrl+Enter` uygula.

## Neden ABC notasyonu?

ABC, düz metinle nota yazmak için yaygın ve olgun bir standarttır: okunması
kolaydır, elle yazılabilir ve internette on binlerce eser bu biçimde bulunur
(halk ezgileri, klasik eserler). Bu yüzden motorun giriş biçimi olarak ABC'yi
seçtik; ayrıştırıcıyı ise bu proje için sıfırdan yazdık, böylece makinenin
ihtiyaç duyduğu bilgilere (kaynak konumu, perküsyon eşlemesi, ölçü denetimi)
tam hâkimiz.

```abc
X:1
T:Benim Eserim
M:4/4
L:1/8
Q:1/4=120
K:C
V:1 name="Melodi"
V:2 name="Davul" clef=perc
[V:1] c2 e2 g2 c'2 | b2 g2 d'4 | c'2 a2 f2 a2 | g8 |]
[V:2] [Fa]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g [Fg]g [cg]g | [Fg]g [cg]g [Fg]g [cg]g | c/c/e/e/ d/d/A/A/ [Fa]4 |]
```

### Desteklenen ABC özellikleri

| Özellik | Örnek |
| --- | --- |
| Başlık alanları | `X: T: C: M: L: Q: K: V:` |
| Tonalite ve modlar | `K:Am`, `K:Bb`, `K:D mix`, `K:G dor`, `K:C ^f` |
| Notalar, oktavlar | `C D E`, `c` (bir oktav tiz), `c'`, `C,` |
| Değiştiriciler (ölçü boyunca geçerli) | `^F _B =B ^^C __E` |
| Süreler | `A2 A/2 A/ A// A3/2` |
| Akor, sus, çok ölçülük sus | `[CEG]2`, `z`, `Z4` |
| Bağ, noktalı ritim | `C2-C2`, `A>B`, `A<<B` |
| Üçleme ve n'lemeler | `(3abc`, `(5CDEFG`, `(3:2:2C2D` |
| Süsleme notaları | `{g}A` |
| Tekrarlar ve dönüşler | `\|: … :\|`, `::`, `\|1 … :\|2 …`, `[1,3` |
| Satır içi alanlar | `[K:G]`, `[M:3/4]`, `[L:1/16]`, `[Q:1/4=140]`, `[V:2]` |
| Dinamik ve vurgu | `!p! !mf! !ff!`, `!>!`, `L`, `.` (staccato) |
| Çok sesli yazım | `V:1`, `V:2 clef=perc`, `V:Davul instrument=drums` |
| Perküsyon eşlemesi | `%%percmap D pedal-hi-hat`, `%%MIDI channel 10` |

Akor sembolleri (`"Am"`), legato bağları ve şarkı sözleri okunur ama çalmayı
etkilemez. Anlaşılmayan yerler atlanır ve editörde satır/sütun bilgisiyle
uyarı olarak gösterilir. Süresi ölçü birimine (`M:`) uymayan ölçüler de ayrıca
bildirilir; yazım hatalarını bulmak için çok işe yarar.

### Davul partisi

`clef=perc` (ya da `instrument=drums`) ile işaretlenen partilerde notalar
davul setine eşlenir. Varsayılan eşleme, yaygın davul yazımındaki porte
konumlarını izler:

| Nota | Parça | Nota | Parça |
| --- | --- | --- | --- |
| `F` | bas davul (kick) | `a` | crash zili |
| `c` | trampet | `f` | ride zili |
| `g` | kapalı hi-hat | `e` | tiz tom |
| `^g` | açık hi-hat | `d` | orta tom |
| `A` | yer tomu | `D` | pedal hi-hat |

Aynı anda vurulan parçalar akor gibi yazılır: `[Fg]` = kick + hi-hat.

### Ksilofon aralığı

Ksilofon C3–C7 aralığında 49 kromatik çubuktan oluşur (doğal sesler önde,
diyezler arkada ve biraz yukarıda). Aralık dışında kalan partiler önce bütün
olarak en uygun oktava kaydırılır, kalan taşan notalar tek tek katlanır.

## Mimari

```
src/
  engine/            Müzik motoru (DOM'dan bağımsız, Node'da test edilir)
    abc/parser.ts    ABC → Score: notalar, tekrar açma, çok ses, perküsyon, tempo
    abc/keys.ts      Tonalite ve donanım hesabı
    percussion.ts    GM perküsyon numaraları ↔ davul parçaları
    timeline.ts      Tempo haritası, vuruş ↔ saniye, aralığa sığdırma
    transport.ts     Çal/duraklat/sar/hız: gerçek zaman ↔ eser zamanı
  audio/
    synth.ts         Web Audio sentezi: modal ksilofon, davullar, yankı
    scheduler.ts     İleriye bakan zamanlayıcı (ses saatiyle hassas planlama)
  sim/
    layout.ts        Çubuk/davul/nozul/oluk yerleşimi (saf geometri)
    paths.ts         Bilye yörüngeleri (analitik, durum tutmaz)
    build.ts         3B modeller ve malzemeler: ksilofon, davul seti, güverte, sahne
    scene.ts         Sahne, kamera, ışıklar, vuruş tepkileri, seçme (raycast)
    post.ts          Son işleme: seçici bloom, GTAO, alan derinliği, kalite kademeleri
    effects.ts       Bilye izleri ve yükselen nota simgeleri
    reflector.ts     Yumuşak zemin yansıması
    contactShadow.ts Bir kez pişirilen temas gölgeleri
    merge.ts         Hareketsiz parçaları birleştirip çizim çağrısını azaltma
  library/tunes.ts   Eser kütüphanesi (ABC)
  app.ts             Hepsini bağlayan uygulama ve arayüz
```

### Ses ile görüntü nasıl senkron kalıyor?

Motor geleceği bilir: her notanın ne zaman çalınacağı baştan bellidir. Bu
yüzden bilyeler bir fizik motoruyla değil, **analitik yörüngelerle** hareket
eder. Bir bilyenin konumu yalnızca "vuruşa ne kadar kaldı / ne kadar geçti"
bilgisinden hesaplanır: vuruştan 0,78 sn önce nozuldan serbest düşüşe başlar,
`dt = 0` anında tam hedefe değer, sonra balistik bir yayla oluğa sıçrar.
Ses aynı notayı Web Audio saatine göre aynı ana planlar; görüntü de ses
kartının çıkış gecikmesini hesaba katan zaman damgasıyla çizilir. Duraklatma,
sarma ve hız değişimi kendiliğinden doğru çalışır çünkü hiçbir bilyenin
saklanan bir durumu yoktur.

### Görsel katman

Hedef, teknik bir 3B demodan çok, sihirli bir kinetik heykel ya da özenli bir
müzik oyuncağı hissi:

- **Kamera:** 35 mm eşdeğeri (dikey görüş açısı ≈ 37,8°), hafif yüksekten ve
  soldan bakan üç çeyrek açı. Uzaklık, makinenin sınır kutusu ekrandaki boş
  alana sığacak şekilde her ekran oranı için ayrıca hesaplanır.
- **Işık:** sıcak tepe ışığı (önden-sağdan, yumuşak gölgeli), soğuk mor kontur
  ışığı, makine altında temas gölgeleri ve vuruşlarla nabız gibi atan renkli
  vurgu ışıkları (kick/yer tomu pembe, trampet/tomlar mavi, ziller kehribar).
- **Malzemeler:** satin ceviz, fırçalanmış (anizotropik) pirinç, pahlı kenarlı
  cilalı tuşlar, saten zil metali, metalik pul boyalı davul gövdeleri ve iç
  ışımalı cam bilyeler (Yüksek kalitede gerçek ışık geçirgenliğiyle).
- **Efektler:** seçici bloom (yalnızca bilyeler, vuruş halkaları, notalar,
  parlayan tuşlar ve sahne kenarı ışık saçar), ortam gölgelemesi (GTAO), arka
  plandaki ışık dizilerini bokeh'e çeviren hafif alan derinliği, yumuşak zemin
  yansıması, hızlı bilyelerin arkasında sönen izler ve vuruş noktasından
  yükselen nota simgeleri.

Ses panelindeki **Görüntü kalitesi** ayarı üç kademe sunar: *Yüksek* (hepsi),
*Orta* (yansıma ve parlama) ve *Hafif* (efektsiz). *Otomatik* kipte uygulama
kare süresini izler ve akıcılık düşerse kendiliğinden bir kademe iner.

## Kütüphanedeki eserler

Tümü kamu malıdır; düzenlemeler (eşlik ve davul partileri) bu proje için yazıldı.

- Bilye Yağmuru (bu proje için özgün beste)
- Korobeyniki (Rus halk şarkısı, Tetris teması)
- Neşeye Övgü (Beethoven, 9. Senfoni)
- Für Elise (Beethoven)
- Dağ Kralının Salonunda (Grieg, Peer Gynt; tempo giderek hızlanır)
- Jingle Bells (J. L. Pierpont)
- Kanon (Pachelbel)
- Greensleeves (İngiliz halk ezgisi)
- Minuet (Sol majör, Petzold)
- Frère Jacques (üç sesli kanon)
- Twinkle Twinkle Little Star (Fransız halk ezgisi)
- İyi ki Doğdun (Hill kardeşler)

Yeni bir eser eklemek için `src/library/tunes.ts` dosyasına ABC metnini koyup
`LIBRARY` listesine eklemek yeterli. `npm test` her eserin uyarısız
ayrıştırıldığını, ölçü sürelerinin tuttuğunu ve partilerin eşit uzunlukta
olduğunu otomatik denetler.
