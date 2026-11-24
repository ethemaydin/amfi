# EAA token (Facebook girişli Instagram API) ile kurulum

Akış iki kapılıdır ve **takip şartı her iki kapıda da zorunludur**:

| Kapı | Ne yapar | Sonuç |
|---|---|---|
| **Yorum** | Sistem yoruma özel yanıt DM'i atar ("Takip ettim ✅" düğmeli) → kişi düğmeye basar | Takip doğrulanırsa masa atanır |
| **DM** | Kişi siteye girip DM'den `katıl` yazar (yorum yazmasına gerek yok) | Takip doğrulanırsa masa atanır |

> **Teknik sınır (Meta kuralı):** Instagram, takip durumunu (`is_user_follow_business`) yalnızca kişi hesaba **mesaj attıysa** verir ("user consent"). Bu yüzden hiç DM/düğme etkileşimi olmayan bir yorumcu listeye **alınamaz**. Yorum yazan herkese sistem otomatik DM atar; düğmeye basmayan listede görünmez.

## Dosyalar
- `sync.js` — motor (yorum/DM okur, doğrular, masa atar, çekilişi yapar, `data.json` üretir)
- `state.js` — durumu `state/private.enc` ↔ `private.json` arasında şifreler (AES-256-GCM + scrypt)
- `.github/workflows/sync.yml` — 10 dakikada bir çalışır, durumu FTP'den alır/yazar
- `test.js` + `test/mock.js` — sahte API ile uçtan uca test: `node test.js`
- `banned.txt` — satır başına bir kullanıcı adı (kara liste)

## 1. Meta tarafı
1. Instagram **Professional** hesap + bağlı bir **Facebook Sayfası**.
2. developers.facebook.com → Create App (**Business**) → ürün: **Instagram** → "Instagram API with Facebook Login".
3. İzinler: `instagram_basic`, `instagram_manage_comments`, `instagram_manage_messages`, `pages_show_list`, `pages_messaging`, `pages_read_engagement`, **`pages_manage_metadata`** (takip sorgusu için zorunlu).
4. **Graph API Explorer** → uygulama → "Get User Access Token" → izinleri işaretle → Sayfayı ve IG hesabını seç.
5. developers.facebook.com/tools/debug/accesstoken → **Extend Access Token**.
6. Önerilen: uzun ömürlü token ile `me/accounts` çağır, **Sayfa token'ını** `IG_TOKEN` olarak kullan (süresizdir; kullanıcı token'ı **60 günde ölür** ve sistem o gün tamamen durur — 24 Kasım 2026'da yaşanan buydu).
7. Rolü olmayan kişiler için **Advanced Access + App Review** (genelde Business Verification) gerekir. Onaya kadar sadece uygulamada rolü olan test hesaplarıyla çalışır.

## 2. GitHub secrets
| Secret | Zorunlu | Açıklama |
|---|---|---|
| `IG_TOKEN` | ✅ | EAA… token (boşluksuz). Sayfa token'ı önerilir. |
| `STATE_KEY` | ✅ | Durum şifreleme anahtarı, **en az 12 karakter** (`openssl rand -hex 32`). Değiştirirsen eski durum çözülemez. |
| `SALT` | ➖ | Çekiliş tuzu (değiştirirsen çekiliş sonuçları değişir). |
| `REQUIRE_COMMENT` | ➖ | **Varsayılan `0`** (yorum şartı yok). `1` yaparsan sadece yorum yazanlar girer. |
| `AUTO_DM`, `MAX_SEND`, `MAX_CALLS`, `RECHECK` | ➖ | Otomatik DM ve hız limitleri (60 / 400 / 40). |
| `COMMENT_KEYWORD` | ➖ | Boşsa her yorum sayılır. `katıl` yazarsan sadece o kelime. |
| `MSG_ASK`, `MSG_BTN`, `MSG_OK`, `MSG_NO` | ➖ | Mesaj metinleri. |
| `VERBOSE` | ➖ | `1` → ayrıntılı log. |
| `TOTAL` / `STEP` | ➖ | 50000 / 10000 (5 çekiliş). |

> **Not:** Durum artık **FTP'de değil**, şifreli olarak `data` branch'inde tutulur (`private.enc` + `data.json`). Sebep: hosting, GitHub runner'larından 21 portuna bağlantıyı engelliyor (test edildi: timeout). Eski `FTP_*` secret'ları artık kullanılmıyor, silinebilir.

## 3. Site dosyaları ve yayın (otomatik)
- Docroot (FTP hesabının gördüğü site klasörü): **`/domains/amfi.englishbase.com.tr/public_html`** → `FTP_WEB_DIR` secret'ına bu değeri gir (boşsa varsayılan bu).
- `site/` klasörü repoda durur. `site/**` içinde bir değişiklik push edildiğinde **`deploy-site`** workflow'u dosyaları FTP ile yükler (6 kez tekrar dener). Elle yükleme gerekmez.
- Site verisi: `https://raw.githubusercontent.com/ethemaydin/amfi/data/data.json` (ana kaynak) + aynı klasördeki `data.json` (yedek). Sayfa 30 sn'de bir yeni veri var mı diye bakar ve değiştiyse kendini yeniler.

### Gecikme beklentisi
`sync` 5 dakikada bir çalışır (GitHub'ın izin verdiği en sık aralık). Kullanıcı DM/yorum attığında masası sitede **ortalama 2-5 dakikada**, en kötü ~7 dakikada görünür. Gerçek "anlık" istenirse Meta webhook'u + küçük bir sunucu (Cloudflare Worker) gerekir; mevcut kurulum buna da uygundur.

### Mesaj kuralları (Meta)
- **Yoruma özel yanıt:** yorumdan sonra 7 gün, yorum başına 1 mesaj.
- **DM (takipli sohbet):** kişinin son mesajından sonra 24 saat. Pencere kapalıysa sistem DM göndermez; uygun olduğunda **yoruma özel yanıt** ile bilgilendirir. İkisi de yoksa kişi bilgilendirilemez (masası sitede görünür, tekrar yazdığında DM alır).

## 4. Test
```bash
cd automation
node test.js            # sahte API ile 23 kontrol (DM/API'ye çıkmaz)
```
GitHub'da elle çalıştırırken **dry** kutusunu işaretlersen hiçbir DM gönderilmez, sadece log basılır.

## 5. Sorun giderme
| Belirti | Sebep / çözüm |
|---|---|
| Site 0 masa gösteriyor | Sitedeki `index.html` henüz güncellenmemiş olabilir (yeni sürüm raw URL'i okur) ya da raw CDN ~5 dk gecikmiştir. |
| `IG_TOKEN geçersiz` | Token'ı yeniden üret; boşluk/tırnak olmadan yapıştır. |
| `Session has expired` | Token'ın süresi dolmuş. developers.facebook.com/tools/debug/accesstoken ile kontrol et; **Sayfa token'ı** kullan (süresiz). Kullanıcı token'ı 60 günde ölür. |
| Kimse masaya oturmuyor | Token'da `instagram_manage_messages` + `pages_manage_metadata` var mı; DM'lerde kişi gerçekten mesaj atmış mı? |
| Kazanan boş görünüyor | Çekiliş, kişinin takibini canlı doğrular; doğrulanamazsa yeniden çeker (kayıt silinmez, sonraki turda tekrar denenir). |

## 6. Güvenlik
- `private.json` (kullanıcı adı + IGSID + durum) sunucuda **düz metin durmaz**; `data` branch'inde AES-256-GCM ile şifreli (`private.enc`) tutulur. Anahtar yalnızca `STATE_KEY` secret'ındadır.
- Repo public olduğu için `private.enc` indirilebilir; `STATE_KEY` güçlü olduğu sürece açılamaz. İstersen repo'yu private yapıp `data.json`'ı başka bir yolla yayınlayabilirsin.
- FTP şifresi gibi paylaşılan sırları **değiştir**; yeni değerleri yalnızca GitHub secret'ına gir.
- `banned.txt`'e eklenen kişi listeden düşer; kazananlar çıkarılamaz.