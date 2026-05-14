# Báo Cáo Đồ Án — SocialShield

**Môn**: NT208.Q21.ANTN — Lập trình web
**Trường**: Trường Đại học Công nghệ Thông tin — ĐHQG-HCM (UIT)
**Đề tài**: Chrome Extension giám sát bảo mật & quyền riêng tư trên mạng xã hội
**Phiên bản**: v1.1

---

## Mục lục

1. [Tóm tắt (Executive Summary)](#1-tóm-tắt)
2. [Bối cảnh & Vấn đề](#2-bối-cảnh--vấn-đề)
3. [Đối tượng người dùng đích](#3-đối-tượng-người-dùng-đích)
4. [Mục tiêu đồ án](#4-mục-tiêu-đồ-án)
5. [Kiến trúc kỹ thuật](#5-kiến-trúc-kỹ-thuật)
6. [Tính năng phân theo persona](#6-tính-năng-phân-theo-persona)
7. [Threat model & Privacy posture](#7-threat-model--privacy-posture)
8. [Triển khai chi tiết](#8-triển-khai-chi-tiết)
9. [Đánh giá kết quả](#9-đánh-giá-kết-quả)
10. [Hạn chế & vấn đề đã gặp](#10-hạn-chế--vấn-đề-đã-gặp)
11. [Hướng phát triển tương lai](#11-hướng-phát-triển-tương-lai)
12. [Kết luận](#12-kết-luận)

---

## 1. Tóm tắt

**SocialShield** là Chrome Extension (Manifest V3) phục vụ 3 nhóm người dùng có nhu cầu khác nhau xoay quanh **bảo mật & quyền riêng tư trên mạng xã hội**:

| Persona | Use case chính | Output mong muốn |
|---|---|---|
| **Threat Intel Analyst** *(superset of Red Team — cần đầy đủ recon technique để track attacker)* | Theo dõi brand impersonation, footprint username 15+ platform, cross-platform linkage, **+ recon technique** (PII extract, EXIF, doxxing report ngược lên attacker) | Alert tự động + intel dossier tổng hợp |
| **Red Team Recon** | OSINT cơ bản trên target hợp đồng pen-test: bóc PII, footprint enum, EXIF GPS, geo heatmap, doxxing report attacker-perspective | Báo cáo "attacker biết gì → làm được gì → est. time" |
| **End User phổ thông** | Self-audit: liệu bio mình có lộ SĐT/CCCD không, ảnh có EXIF GPS không, settings có private không, mật khẩu có trong breach database không | Risk score 0-100 + actionable recommendation |

> **Lưu ý về persona overlap**: Threat Intel Analyst trong thực tế **bao gồm** toàn bộ skill set của Red Team Recon — vì để phát hiện và phản ứng với 1 vụ impersonation, analyst phải tự làm OSINT lên attacker (ngược chiều). Vì vậy mọi tính năng red team (mục 6.2) đều available cho threat intel persona. Phân chia trong report chỉ để phân định **góc nhìn use case** (defensive vs. offensive), không phải phân định feature gate.

Toàn bộ logic chạy **100% client-side** (trừ optional AI server local). Không server trung gian thu thập data. Tích hợp 6 threat intel API miễn phí: **Google Safe Browsing, VirusTotal, URLhaus, HIBP Pwned Passwords, XposedOrNot, HackCheck**.

Codebase: ~12,000 dòng JavaScript + HTML/CSS, structure modular MV3, hỗ trợ Instagram + X/Twitter làm primary target, generic mode cho mọi trang khác.

---

## 2. Bối cảnh & Vấn đề

### 2.1 Hiện trạng bảo mật mạng xã hội tại Việt Nam

- **Vấn đề 1 — Lộ PII tự nguyện**: User VN có thói quen để SĐT, email, MSSV, biển số xe, mã ZaloPay/MoMo, địa chỉ chi tiết ngay trong IG/X bio. Đây là quan sát từ trải nghiệm dùng MXH cá nhân + xem qua một số profile public, không phải số liệu khảo sát chính thức.

- **Vấn đề 2 — EXIF GPS leak**: Ảnh chụp bằng smartphone mặc định lưu GPS coords trong EXIF. User upload trực tiếp lên mạng (Discord, Zalo, Telegram) hoặc messenger groups → lộ vị trí nhà / nơi làm.

- **Vấn đề 3 — VietQR scam**: Chuyển khoản QR đang phổ biến → kẻ xấu giả mạo QR thanh toán cộng đồng (quyên góp, mua hàng) → user scan không verify được STK thực sự thuộc về ai.

- **Vấn đề 4 — Impersonation accounts**: Brand/influencer bị clone với username đổi 1 ký tự (`@nike` → `@nlke`), profile pic giống hệt → DM scam followers.

- **Vấn đề 5 — Cross-platform doxxing**: Username duy nhất trên 15 site → 1 attacker chỉ cần tìm username từ IG là enumerate được toàn bộ digital footprint (GitHub, Reddit, dev.to, ...).

### 2.2 Các giải pháp hiện có và khoảng trống

| Tool | Điểm mạnh | Điểm thiếu |
|---|---|---|
| **Sherlock** (Python CLI) | Footprint enum tốt | CLI-only, không phù hợp end-user |
| **Have I Been Pwned** (web) | Breach check chuẩn | Chỉ 1 chiều, không tích hợp scan profile |
| **VirusTotal Browser Ext** | URL safety | Chỉ check URL, không scan PII trong text |
| **Trình duyệt incognito + DevTools** | Linh hoạt | Đòi hỏi kỹ năng kỹ thuật cao |

**Khoảng trống**: Chưa có 1 tool **tích hợp đa nguồn** + **chạy trực tiếp trên trang IG/X** + **UI tiếng Việt** + **VN-specific patterns** (CCCD, MSSV, biển số xe, VietQR).

SocialShield điền vào khoảng trống này.

---

## 3. Đối tượng người dùng đích

### 3.1 Persona A — Threat Intel Analyst (B2B)

**Tình huống thực tế**: Nhân viên SOC của 1 ngân hàng VN cần theo dõi các tài khoản giả mạo brand bank (`@vietcombank_official_vip`, `@vcb_support_24h`, ...) đăng quảng cáo lừa đảo trên IG/X.

**Nhu cầu kỹ thuật**:

| Yêu cầu | Tính năng đáp ứng |
|---|---|
| Theo dõi nhiều username song song | Username Footprint Monitor (background alarm 6h-7d) |
| Cảnh báo khi có account mới đăng ký username gần giống | Footprint Enum 15 site CORS-friendly |
| Phân tích bot/spam follower | Bot Detection 8 signals (mass follow, no posts, default avatar, low engagement, ...) |
| Cross-platform identity linkage (cùng 1 attacker chạy nhiều account?) | Linkage Detector 6 signals (username, bio, URL, pHash profile pic) |
| Export báo cáo HTML/CSV cho team | Dashboard → Export báo cáo (HTML/CSV) |

**Output ví dụ**:
```
ALERT — Possible impersonation
@vcb_support_official ↔ @vietcombank.vn
pHash distance: 4/64 (very similar profile pic)
Bio overlap: 73% (cả 2 nhắc tới "Hotline 1900...")
Footprint match: cả 2 đăng GitHub + dev.to cùng username
Severity: HIGH
```

### 3.2 Persona B — Red Team Recon (Offensive)

**Tình huống thực tế**: Pen-tester thực hiện social engineering assessment cho 1 công ty. Target: nhân viên cấp C-suite. Cần build profile chi tiết để phục vụ phishing follow-up.

**Nhu cầu kỹ thuật**:

| Yêu cầu | Tính năng đáp ứng |
|---|---|
| Bóc PII (email/SĐT/family member tag) từ bio + 12 caption recent | scanFullProfile() + 25+ regex VN-specific |
| Footprint enum username sang 15 platform khác | enumerateFootprint() |
| Geo-pattern từ recent posts | Geo Heatmap (cluster lat/lng + radius warning) |
| EXIF GPS từ ảnh public | extractEXIF() (no deps, ~150 dòng) |
| Reverse image search profile pic | Tools card: Google Lens/Yandex/TinEye/Bing one-click |
| Doxxing narrative attacker-perspective | generateDoxxingReport() — output prose có cấu trúc: attacker_knows[], attacker_can_do[], estimated_time |

**Output ví dụ** (Doxxing Report):
```
Target: @target_username (Instagram)

WHAT ATTACKER KNOWS (5 datapoints):
- Real name: "Nguyễn Văn A" (display name)
- Workplace: "Tech Company X" (bio explicit)
- Email: a.nguyen@techx.com (bio leak)
- Phone: 0901234567 (caption Post #3)
- Home area: ~Quận 1 HCM (5/12 posts tagged location cluster radius 2.3km)

ATTACKER CAN DO:
- Targeted spear phishing tới email cá nhân
- SIM swap attack với SĐT đã có
- Physical recon nhà/cơ quan (geo cluster)
- Pivot sang LinkedIn → impersonate đồng nghiệp

ESTIMATED TIME để dox được home address chính xác:
< 4 giờ (Geo cluster + cross-platform Google Maps reverse)
```

### 3.3 Persona C — End User phổ thông (Self-Audit)

**Tình huống thực tế**: Sinh viên năm 2 muốn kiểm tra account IG cá nhân có rò rỉ gì không trước khi apply intern.

**Nhu cầu kỹ thuật**:

| Yêu cầu | Tính năng đáp ứng |
|---|---|
| 1-click quick scan | FAB → Privacy Scan |
| Hiểu rủi ro (không dùng jargon) | Risk Score 0-100, color-coded (green/yellow/orange/red) |
| Actionable recommendations | generateSecurityRecommendations() — bullet list cụ thể |
| Check password có bị leak chưa | HIBP k-anonymity (chỉ gửi 5 ký tự đầu SHA-1) |
| Check email đã từng bị breach chưa | XposedOrNot + HackCheck miễn phí |
| Generate "safe version" ảnh trước khi đăng | generateSafeImage() — strip EXIF + cover QR + optional auto-blur text |

**Output ví dụ**:
```
Privacy Score: 42/100 — MEDIUM RISK

Found:
🟠 Email lộ trong bio (a.nguyen@gmail.com)
🟠 SĐT lộ trong caption Post #3
🟡 Profile public + có 5 posts tagged location
🟢 2FA đang bật
🟢 Không có password lộ trong bio

Recommendations:
1. Xóa email khỏi bio — dùng Linktree thay
2. Edit caption Post #3 để bỏ SĐT
3. Cân nhắc set account private nếu không phải brand
4. Tắt tag location cho posts cá nhân
```

---

## 4. Mục tiêu đồ án

### 4.1 Mục tiêu chính

1. **Đa persona một codebase**: cùng 1 extension phục vụ cả 3 nhóm trên thông qua **role-aware UI** (FAB cho casual user, Tools page cho power user, background monitor cho analyst).
2. **VN-specific patterns**: nhận diện CCCD/CMND format VN, biển số xe, MSSV, VietQR EMV, family member tags tiếng Việt.
3. **Privacy-respecting**: 0 server thu thập, 0 telemetry, tất cả analysis client-side trừ optional AI server localhost.
4. **MV3-native**: tuân thủ chuẩn mới nhất của Chrome, không legacy background page, content scripts khai báo tường minh.
5. **Tích hợp đa threat intel**: 6 API miễn phí, fallback graceful khi API down hoặc rate-limit.

### 4.2 Phạm vi & ràng buộc

| Trong phạm vi | Ngoài phạm vi |
|---|---|
| Instagram, X/Twitter (primary) | Facebook, TikTok, Threads (chưa) |
| English + Vietnamese patterns | Other languages |
| Manifest V3 Chrome/Edge | Firefox, Safari (cần port) |
| Free-tier APIs | Paid Enterprise threat feeds (CrowdStrike, etc.) |
| Static analysis (no ML model bundle) | Real-time ML inference (chỉ optional AI server) |

---

## 5. Kiến trúc kỹ thuật

### 5.1 Sơ đồ tổng thể

```
┌─────────────────────────────────────────────────────────────────┐
│                       CHROME BROWSER                             │
│                                                                  │
│  ┌────────────────┐    ┌────────────────┐   ┌────────────────┐ │
│  │ Content Script │    │ Content Script │   │   Popup UI     │ │
│  │  (instagram)   │    │   (twitter)    │   │  (any tab)     │ │
│  └───────┬────────┘    └───────┬────────┘   └────────┬───────┘ │
│          │                     │                      │         │
│          │  chrome.runtime.sendMessage()              │         │
│          └─────────────────────┼──────────────────────┘         │
│                                ▼                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │            Service Worker (background)                      │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐   │ │
│  │  │ InstagramAPI │ │  TwitterAPI  │ │ Threat Intel     │   │ │
│  │  │  - profile   │ │  - users     │ │  - GSB           │   │ │
│  │  │  - posts     │ │  - tweets    │ │  - VirusTotal    │   │ │
│  │  │  - media     │ │              │ │  - URLhaus       │   │ │
│  │  └──────────────┘ └──────────────┘ │  - HIBP          │   │ │
│  │  ┌──────────────┐ ┌──────────────┐ │  - XposedOrNot   │   │ │
│  │  │   Alarms     │ │ Notifications│ │  - HackCheck     │   │ │
│  │  │  - capture   │ │              │ └──────────────────┘   │ │
│  │  │  - footprint │ └──────────────┘                         │ │
│  │  └──────────────┘                                          │ │
│  └─────────────────────────┬──────────────────────────────────┘ │
│                            ▼                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              chrome.storage.local (5MB)                     │ │
│  │  snapshots_*  privacy_*  profile_*  doxxing_*  alerts      │ │
│  │  recent_posts_*  connected_apps_*  _cache_ig_*             │ │
│  └────────────────────────────────────────────────────────────┘ │
│                            │                                     │
│                            ▼                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                     Dashboard UI                            │ │
│  │  Overview | Snapshots | Compare | Privacy | Security |     │ │
│  │  Tools | Doxxing | Alerts | Settings | About               │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼ (optional, localhost only)
              ┌──────────────────────────┐
              │  AI Server (Node.js)     │
              │  Express + OpenAI proxy  │
              │  - /analyze-text         │
              └──────────────────────────┘
```

### 5.2 Cấu trúc thư mục

```
socialshield/
├── manifest.json                # MV3 config — 25+ host_permissions
├── background/
│   └── service-worker.js        # 1100+ dòng, alarms + APIs + threat intel
├── content/
│   ├── instagram.js             # Capture, deep scan, FAB, DOM scrape
│   ├── twitter.js               # Tương tự cho X
│   ├── instagram.css / twitter.css
├── lib/                         # Engine modules, shared by content + dashboard
│   ├── storage.js               # Chrome Storage wrapper + history
│   ├── scanner.js               # Privacy/Link/Footprint/Linkage/Doxxing
│   ├── diff.js                  # Snapshot diff + bot detection
│   ├── text-analyzer.js         # 20+ rule-based scam patterns + AI
│   ├── image-analyzer.js        # EXIF + QR + CCCD + aHash + pHash + text-blur
│   ├── privacy-auditor.js       # IG/X settings auditor + Apps page parser
│   ├── heatmap.js               # Canvas heatmap + OSM Nominatim
│   ├── jsQR.min.js              # Bundled (130KB) cho VietQR decode
│   └── chart.min.js             # Bundled cho Dashboard charts
├── dashboard/
│   ├── dashboard.html           # 10 pages SPA
│   ├── dashboard.js             # 1900+ dòng
│   └── dashboard.css
├── popup/
│   ├── popup.html               # Quick actions + generic mode
│   └── popup.js
├── server/                      # Optional Node.js + OpenAI proxy
├── icons/
└── docs/                        # Seminar slides + report
```

### 5.3 Lựa chọn kỹ thuật quan trọng

| Quyết định | Lý do |
|---|---|
| **Manifest V3** | Tương lai duy nhất được Chrome support; bắt buộc service worker thay vì background page |
| **No external framework** | Vanilla JS + native APIs để giảm bundle size (extension chỉ ~250KB unpacked) và minimize attack surface |
| **chrome.storage.local thay vì IndexedDB** | Đủ dùng cho ~5MB data, API đơn giản hơn, đồng bộ giữa popup/dashboard/content tự động |
| **Bundle jsQR.min.js local** | MV3 CSP cấm script-src remote → phải bundle binary 130KB vào extension |
| **Optional AI server localhost** | Tách lớp AI khỏi extension core → user có/không có server đều dùng được, không có vendor lock-in |
| **OSM Nominatim thay vì Google Maps API** | Free, không cần API key, đủ chính xác cho urban-level. Trade-off: rate-limit 1 req/s, độ chính xác POI VN kém Google |
| **Canvas heatmap thay vì Leaflet** | Leaflet ~150KB binary phải bundle, cần load OSM tiles online; canvas approach 0 dep, offline sau khi geocode |

---

## 6. Tính năng phân theo persona

### 6.1 Tính năng cho **Threat Intel Analyst**

> Phân loại này tập hợp tính năng **defensive-first** (theo dõi liên tục, alert tự động, dashboard tổng hợp). Trong thực tế analyst cần kết hợp với toàn bộ tính năng red team ở mục 6.2 để hoàn tất pipeline: **detect → triage → recon ngược → response**. Một workflow điển hình:
> 1. Footprint Monitor báo có account mới `@vcb_support_v2` trùng pattern brand
> 2. Cross-Profile pHash Diff confirm profile pic giống `@vietcombank.vn` (Hamming 4/64)
> 3. → Analyst chuyển sang Red Team mode: scanFullProfile attacker account → bóc bio PII, captions, externalUrl → enumerateFootprint username "vcb_support_v2" trên 15 site
> 4. → Doxxing Report ngược lên attacker → có khả năng attacker reuse username trên GitHub/Reddit → có thể link tới identity thật
> 5. → Compile dossier → file abuse report tới IG/X + báo công an mạng

#### 6.1.1 Username Footprint Enumeration (Sherlock-style)
- 15 site CORS-friendly: GitHub, GitLab, Codeberg, Reddit, HN, dev.to, Docker Hub, npm, Wikipedia, Keybase, Mastodon, Bluesky, Lichess, Chess.com, Codeforces
- Phân biệt 3 trạng thái: **exists** (đỏ), **inconclusive** (vàng, rate-limit/CORS block), **not-exist** (xanh)
- Background alarm tự động chạy mỗi 6h–7d, baseline diff → alert khi xuất hiện account mới

#### 6.1.2 Cross-Platform Linkage Detector
6 signals chấm điểm để xác định 2 account khác platform có cùng owner:
| Signal | Trọng số |
|---|---|
| Identical username | +50 |
| Bio cross-link explicit | +60 |
| Shared external URL | +40 |
| Shared profile pic path (CDN) | +30 |
| Identical pHash profile pic | +70 |
| Similar pHash profile pic | +55 |

Trigger pair khi tổng ≥30, confidence: low/medium/high.

#### 6.1.3 Background Cross-Profile pHash Diff
- So sánh pHash profile pic giữa **tất cả tracked profiles** sau mỗi privacy scan
- Severity rules:
  - **High**: cùng platform + khác username + pHash ≤10 → **impersonation detection**
  - **Medium**: khác platform + khác username + pHash giống → suspicious
  - **Low**: khác platform + cùng username → likely user reuse own pic
- De-dup pair-key, raise chrome.notifications cho HIGH

#### 6.1.4 Threat Intel Integration (URL Safety)
- **Google Safe Browsing v4** — official Google API, miễn phí 10k req/ngày
- **VirusTotal v3** — 70+ engine, miễn phí 500 req/ngày
- **URLhaus** — abuse.ch malware URL feed, no key needed
- Layered: heuristic local (homograph, suspicious TLD, IP-as-URL) → GSB → VT → URLhaus

#### 6.1.5 Email & Password Breach Check
- **HIBP Pwned Passwords k-anonymity**: chỉ 5 ký tự đầu SHA-1 hash gửi đi → password không bao giờ rời máy
- **XposedOrNot** + **HackCheck**: email breach lookup, fallback chain

### 6.2 Tính năng cho **Red Team Recon**

#### 6.2.1 Deep Privacy Scan — scanFullProfile()
Quét đồng thời:
- Bio (1 lần fetch)
- displayName
- 12 caption của posts gần nhất (Instagram) hoặc 10 tweet visible (X)

Với 25+ regex patterns:
| Pattern | Ví dụ match |
|---|---|
| Email | `user@example.com` |
| Phone VN | `09xxxxxxxx`, `+84xxxxxxxxx` |
| CCCD/CMND | 12 chữ số (CCCD) hoặc 9 chữ số (CMND) |
| MSSV (có context "MSSV") | `MSSV: 21520001` |
| Biển số xe VN | `51A-12345`, `30A-123.45` |
| MoMo/ZaloPay handle | `momo: 0901234567` |
| Credit card (Luhn) | `1234-5678-9012-3456` (validated) |
| Family member tag VN | `con: tên`, `mẹ: tên`, `vợ: tên` |
| Trường/Công ty VN | `học tại UIT`, `làm ở FPT` |
| Địa chỉ chi tiết VN | `123 đường ABC, phường X, quận Y` |
| Password leak | `password: ...`, `mật khẩu: ...` |

False-positive mitigation:
- Password regex bắt buộc context word + min 6 chars (tránh "pass UAC" match)
- Địa chỉ regex bắt buộc full word "đường/phố/street" + suffix "phường/quận" (tránh "3d visualizations")
- Student ID bắt buộc context "MSSV" (tránh số 7 chữ số ngẫu nhiên)
- Biển số bắt buộc format `[1-9][0-9]-[A-Z][A-Z0-9]?\s?\d{3}\.?\d{2,3}`

#### 6.2.2 Geo Pattern Heatmap
**Pipeline 7 bước**:
1. Fetch `recentPosts` từ IG API + extract location field
2. Fallback DOM scrape: tìm `<a href="/p/<shortcode>/">` → fetch HTML page each post → regex extract `"location":{"pk":...,"lat":...,"lng":...,"name":"..."}`
3. Cluster posts theo lat/lng (key = `lat.toFixed(4),lng.toFixed(4)`) hoặc theo name
4. Mercator projection lat/lng → canvas pixels
5. Render radial-gradient heat blobs, `globalCompositeOperation = 'lighter'` cho additive blending
6. Color ramp HSL hue 60→0 (yellow→red) theo intensity
7. Haversine pairwise max → warning nếu cluster <30km diameter

#### 6.2.3 EXIF Extractor (no deps)
~150 dòng JPEG TIFF parser:
- APP1 marker detection (`0xFFE1`)
- TIFF IFD walk
- GPS sub-IFD: tag `0x8825` → lat/lng/altitude/dateStamp
- Camera info: Make, Model, DateTimeOriginal, Orientation
- DMS → decimal conversion

#### 6.2.4 Bank QR Decoder
- jsQR (bundled local 130KB)
- VietQR EMV TLV parser: tag 38 (Merchant Account Info) → sub-tag 01 → bank BIN + account number
- Bonus: tag 54 (amount), 59 (merchant name), 60 (city)

→ **Use case red team**: scan QR từ ảnh public post → biết được bank/account của target → social engineering followup

#### 6.2.5 Doxxing Risk Report Generator
**Composite narrative** từ 5 nguồn:
1. PII findings từ scanPrivacy()
2. Breach data từ HIBP/XposedOrNot
3. Cross-platform linkage signals
4. Recent posts (location, time pattern)
5. Profile metadata (verified, follower count)

Output có cấu trúc:
```js
{
  riskScore: 0-100,
  riskLevel: 'low' | 'medium' | 'high' | 'critical',
  attackerKnows: ['Real name from displayName', 'Email from bio', ...],
  attackerCanDo: ['SIM swap với SĐT', 'Phishing email cá nhân', ...],
  fixActions: ['Remove SĐT khỏi caption Post #3', ...],
  estimatedTimeToFullDox: '< 4 hours / 1-2 days / 1 week'
}
```

#### 6.2.6 Reverse Image Search Shortcuts
One-click mở 4 engine:
- **Google Lens**: tốt cho object/landmark
- **Yandex**: tốt nhất cho face match (kinh nghiệm OSINT)
- **TinEye**: cho exact match dù crop
- **Bing**: backup

### 6.3 Tính năng cho **End User phổ thông**

#### 6.3.1 1-click Privacy Scan (FAB)
- Floating Action Button góc dưới phải khi mở IG/X
- Menu 7 action: Capture Following/Followers, Privacy Scan, Link Scan, Engagement Rate, Impersonation Check, Audit Privacy Settings, Parse Connected Apps
- Result hiện inline notification + auto-save vào storage cho dashboard view sau

#### 6.3.2 Privacy Settings Auditor
Quét DOM khi user ở settings page IG/X:
| Setting | Check | Recommendation |
|---|---|---|
| Account private | Có/không toggle | Cân nhắc nếu profile cá nhân |
| 2FA | Có bật không | Bật 2FA bằng authenticator app (KHÔNG SMS) |
| Active sessions | Số session | Logout session không nhận ra |
| OAuth apps | Số app connected | Revoke app không dùng >6 tháng |
| Tag policy | Anyone vs Following only | Đổi sang Following only |
| Findable by email/phone | Toggle | Tắt nếu muốn dissociate |

Output: privacy posture score 0-100 + actionable bullet recommendations.

#### 6.3.3 Safe Image Generator
PoC PII auto-blur trước khi đăng ảnh:
1. **Strip EXIF**: re-encode JPEG qua Canvas → metadata tự bay
2. **Cover QR**: detect bằng jsQR → vẽ rectangle đen + stamp "[QR removed]"
3. **Auto-blur text region** (optional toggle): Sobel edge density grid → connected components → pixelate
4. **CCCD warning**: heuristic aspect ratio 1.585 + color dominance → cảnh báo không tự crop để user quyết định

Output: download link + preview ảnh đã clean.

#### 6.3.4 Connected Apps Revocation Helper
Deep-link tới 5 platform settings:
- 📷 IG `/accounts/manage_access/`
- 🐦 X `/settings/connected_apps`
- 🔑 Google `myaccount.google.com/connections`
- 👤 Facebook business integrations
- 🐙 GitHub authorized apps

Plus DOM parser tự động extract list app + last-used + scope khi user đứng ở page.

#### 6.3.5 Dashboard với 10 pages SPA
1. **Overview** — stats cards + activity timeline
2. **Snapshots** — full snapshot history per profile
3. **Compare** — diff 2 snapshots side-by-side
4. **Privacy Scans** — history với risk score color-coded
5. **Security Score** — overall posture
6. **Tools** — 11 standalone scanners (không cần ở IG/X)
7. **Doxxing Risk** — saved reports
8. **Alerts** — push notification history
9. **Settings** — toggles + API keys
10. **About**

---

## 7. Threat model & Privacy posture

### 7.1 Threat actors mà extension bảo vệ user khỏi

| Actor | Vector tấn công | Defense của SocialShield |
|---|---|---|
| Phishing scammer | Fake DM/comment chứa link malicious | Link Scanner (GSB + VT + URLhaus) |
| Stalker | OSINT từ tagged location + bio | Privacy Scan + Geo Heatmap warning |
| Impersonator | Clone profile pic → DM followers | Cross-Profile pHash Diff (high severity alert) |
| Identity thief | Pivot từ password leak → SIM swap | HIBP password check + email breach |
| Doxxer | Cross-platform username enum | Footprint enum self-check + Doxxing Report |

### 7.2 Trust boundary

```
USER MACHINE                                       │  EXTERNAL
                                                   │
[Extension code (audited)] ──fetch──> [GSB/VT/...] │ ← chỉ URL hash (k-anon password)
[Optional AI server localhost] ──> [OpenAI API]    │ ← chỉ nếu user setup
                                                   │
[chrome.storage.local] ← KHÔNG ai khác đọc được   │
[Cookies IG/X] ← Extension request có cookies     │
              ← API call ra IG/X server          │ ← chính IG/X (đã có cookies sẵn)
```

### 7.3 Data flow privacy

| Loại dữ liệu | Lưu ở đâu | Có gửi đi đâu không? |
|---|---|---|
| Snapshots (followers/following) | `chrome.storage.local` | **Không** |
| Privacy scan results | `chrome.storage.local` | **Không** |
| Profile pHash | `chrome.storage.local` | **Không** |
| EXIF data từ ảnh local | RAM only | **Không** (không upload ảnh) |
| URL safety check input | RAM → GSB/VT/URLhaus API | URL được gửi đi (cần để check) |
| Password Pwned check | Tính SHA-1 local → 5 ký tự đầu → HIBP | **Chỉ 5 ký tự hash** (k-anonymity) |
| Email breach check | Email → XposedOrNot/HackCheck | Email được gửi (cần để check) |
| AI text analysis | Text → localhost:3456 → OpenAI | Chỉ nếu user setup AI server, chạy localhost |

### 7.4 Permission analysis (Manifest)

| Permission | Justification |
|---|---|
| `storage` | Lưu snapshots/scans local |
| `activeTab` | Inject scanner vào tab hiện tại |
| `notifications` | Push alert khi background detect impersonation |
| `alarms` | Schedule auto-capture + footprint monitor |
| `cookies` | Build cookie header để gọi IG/X API như session user |
| `scripting` | Generic mode — chạy scanner trên non-IG/X page |
| `host_permissions: 27 domains` | Threat intel APIs + footprint sites |

Đã tối thiểu hoá — không xin `<all_urls>`, không xin `tabs`, không xin `webRequest`.

---

## 8. Triển khai chi tiết

### 8.1 Modules cốt lõi

| Module | LOC | Vai trò |
|---|---|---|
| `lib/scanner.js` | ~1800 | Core engine — analyzeProfile, scanPrivacy, scanFullProfile, detectCrossPlatformLinkage, generateDoxxingReport, generateSecurityRecommendations |
| `background/service-worker.js` | ~1200 | IG/X API, threat intel proxy, alarms, message routing |
| `dashboard/dashboard.js` | ~2000 | 10-page SPA, render, export, settings |
| `lib/image-analyzer.js` | ~700 | EXIF + QR + CCCD + aHash + pHash + safe-image |
| `lib/text-analyzer.js` | ~400 | AI proxy + 20+ scam patterns |
| `content/instagram.js` | ~1400 | Capture, deep scan, DOM scrape, FAB |
| `content/twitter.js` | ~1000 | Tương tự cho X |
| `lib/privacy-auditor.js` | ~400 | Settings audit + apps page parser |
| `lib/heatmap.js` | ~180 | Canvas heatmap + Nominatim geocode |
| `lib/storage.js` | ~400 | Chrome Storage wrapper + history + CDN normalize |
| `lib/diff.js` | ~250 | Snapshot diff + 8-signal bot detection |

**Total**: ~9,700 dòng JS (chưa tính HTML/CSS).

### 8.2 Pipeline điển hình — Privacy Scan trên IG

```
1. User click FAB → Privacy Scan
2. content/instagram.js::runPrivacyScan()
   ├── extract bio từ DOM (header section)
   ├── chrome.runtime.sendMessage('FETCH_PROFILE_INFO')
   │   └── background → InstagramAPI.fetchProfileInfo(username)
   │       ├── _fetchRawProfile (cache 15min, không cache nếu degraded)
   │       ├── fetch GET /api/v1/users/web_profile_info/?username=X
   │       └── return { fullName, bio, recentPosts[12 với location.lat/lng], ... }
   ├── Fallback: nếu API trả 0 posts → _scrapePostsFromDOM()
   │   ├── querySelectorAll('a[href*="/p/"]') → extract 12 shortcodes
   │   └── for each: _fetchPostHtmlDirect(shortcode)
   │       ├── fetch('/p/<shortcode>/', credentials: 'include')
   │       └── regex match `"location":{"pk":N,"lat":F,"lng":F,"name":"..."}`
   ├── SocialShieldScanner.scanFullProfile({bio, displayName, captions})
   │   └── chạy 25+ regex patterns
   ├── SocialShieldTextAnalyzer.analyzeText(bio) (AI nếu có server)
   ├── HIBP password check nếu detect password trong bio
   ├── Cross-platform linkage nếu có twitter history
   ├── SocialShieldScanner.generateDoxxingReport({...})
   └── Storage:
       ├── savePrivacyScan('instagram', username, findings)
       ├── set('doxxing_instagram_<username>', report)
       └── set('recent_posts_instagram_<username>', { posts, fetchedAt })
3. Notify user + send PRIVACY_SCAN_COMPLETE → background
4. Background → runCrossProfilePHashScan() (auto trigger)
5. Dashboard hiển thị tại Privacy Scans page, Doxxing page, Geo Heatmap
```

### 8.3 Tích hợp 6 threat intel API

| API | Endpoint | Auth | Limit |
|---|---|---|---|
| Google Safe Browsing v4 | `safebrowsing.googleapis.com/v4/threatMatches:find` | API key user-supplied | 10k req/day |
| VirusTotal v3 | `www.virustotal.com/api/v3/urls/<base64>` | API key user-supplied | 500 req/day |
| URLhaus | `urlhaus-api.abuse.ch/v1/url/` | None | Fair use |
| HIBP Pwned Passwords | `api.pwnedpasswords.com/range/<5char>` | None (k-anonymity) | Unlimited |
| XposedOrNot | `api.xposedornot.com/v1/check-email/<email>` | None | 100 req/h |
| HackCheck | `hackcheck.woventeams.com/api/v1/check` | None | Fair use |

Fallback chain: nếu API 1 fail → API 2 → ... → rule-based local heuristic.

### 8.4 pHash DCT-based (cho impersonation detection)

```
Input image
  → Canvas resize 32×32 grayscale
  → 2D DCT-II (chỉ tính KEEP=8 row/col low-freq)
     → cosine table cached
     → row-wise DCT 32×8, column-wise DCT 8×8 → block 8×8
  → Skip DC component [0,0]
  → Median của 63 còn lại
  → Bit string 64: vi > median ? '1' : '0'
```

So sánh: Hamming distance. Threshold ≤2 identical, ≤10 similar (chặt hơn aHash do pHash robust hơn).

---

## 9. Đánh giá kết quả

### 9.1 Phạm vi kiểm thử

Đồ án **chưa xây dựng dataset đánh giá chuẩn** cho regex precision/recall. Việc đo benchmark chính xác đòi hỏi labeled dataset hàng trăm bio + ground truth — vượt phạm vi 1 đồ án môn học.

Mức độ verify đã làm:

| Hạng mục | Cách verify | Mức độ tin cậy |
|---|---|---|
| Snapshot capture | Chạy manual trên profile cá nhân + một vài profile public | Hoạt động đúng kỳ vọng |
| Privacy regex | Thử với bio của chính mình + một vài profile public + synthetic test string | Pattern match đúng các case đã thử; false-positive đã fix khi gặp (xem mục 10.2) |
| URL Safety | Thử với URL ví dụ trong tài liệu GSB/VT + URL clean | Hoạt động đúng phản hồi của API |
| EXIF GPS | Chụp ảnh smartphone + đọc lại | Tọa độ khớp Google Maps |
| VietQR decode | Tải app banking → tạo QR test → scan | Đọc đúng bank BIN + STK |
| CCCD heuristic | Thử với một vài ảnh ID card + ảnh thường | Có false-positive với card hình chữ nhật khác |
| Footprint enum | Thử với username "torvalds", "gvanrossum" | Endpoint trả đúng status đã document |
| Cross-Profile pHash | Up cùng ảnh, ảnh edit nhẹ, ảnh khác | Distinguish được trong các case thử |

> Phần này thành thật ghi nhận: kết quả là **manual verification trên test case có giới hạn**, không phải benchmark khoa học. Hướng phát triển cần dataset labeled mới đưa được số chính xác.

### 9.2 So sánh với target khoảng trống

| Yêu cầu | Trước SocialShield | Sau SocialShield |
|---|---|---|
| Tool tích hợp đa nguồn | Không có | ✓ 6 threat intel APIs |
| Chạy trên IG/X UI | Phải mở DevTools | ✓ FAB native |
| Tiếng Việt | Không có | ✓ UI + patterns + messages |
| VN-specific (CCCD, MSSV, ...) | Không có | ✓ 7 regex VN-only |
| Doxxing perspective | Tool dispatcher only | ✓ Narrative attacker-perspective |
| Self-hosted alternative AI | Đắt (OpenAI direct) | ✓ Localhost Express proxy |

### 9.3 Performance — ước lượng định tính

Chưa profiling kỹ. Các số dưới đây là **quan sát chủ quan khi dev test trên máy cá nhân** (1 lần chạy, không lấy trung bình nhiều lần):

| Operation | Cảm nhận |
|---|---|
| Privacy Scan (cold) | Vài giây, đa phần thời gian chờ IG API |
| Privacy Scan (warm cache) | Dưới 1 giây |
| pHash compute 1 image | Gần như tức thì (Canvas 32×32 nhỏ) |
| Footprint enum 15 sites | Vài giây, phụ thuộc site chậm nhất |
| Heatmap geocode (chưa cache) | Chậm do Nominatim rate-limit 1.1s/req → 10 location = ~11 giây |
| Heatmap geocode (đã cache) | Tức thì |
| Extension size unpacked | ~250KB (đo bằng tổng dir size, không phải zipped) |

Để có số performance chuẩn cần dùng Chrome DevTools Performance + lấy median của 100 run, hiện chưa làm.

---

## 10. Hạn chế & vấn đề đã gặp

### 10.1 Hạn chế kỹ thuật

| Hạn chế | Lý do | Workaround |
|---|---|---|
| **Không OCR ảnh trong MV3** | CSP `script-src self` cấm CDN load Tesseract.js | Hướng dẫn user mở tesseract.projectnaptha.com hoặc Google Lens → paste text vào Text PII Scanner |
| **IG API degraded response** | IG ngày càng restrict `web_profile_info` cho non-mobile clients | DOM scrape fallback + fetch HTML page each post → regex extract embedded JSON |
| **Adblock chặn fetch** | uBlock/ABP block `/ajax/bz`, đôi khi block cả API endpoints | Document workaround whitelist instagram.com; HTML scrape ít bị block hơn |
| **Heatmap rate-limit Nominatim** | TOS giới hạn 1 req/s/IP | Cache forever vào storage.local; chỉ geocode khi name không kèm lat/lng |
| **pHash false positive với template ảnh** | 2 ảnh template giống nhau (vd cùng IG story template) → pHash match | Manual review HIGH alerts |
| **Generic mode hạn chế** | Trên non-IG/X page, không có metadata profile structured | Chỉ scan text + URL, không có engagement/follower analysis |

### 10.2 Bug đã gặp & cách fix (từ session phát triển)

1. **Cache rỗng vĩnh viễn** (15 phút TTL nhưng response 200 + 0 edges → cache rỗng → mọi retry rỗng):
   → Fix: check edges.length > 0 trước khi cache; bump cache key v2 để bỏ qua cache cũ
2. **`privacy_audit_*` object iter crash** (`for (const scan of [...obj])` throw TypeError):
   → Fix: filter `!startsWith('privacy_audit_') && Array.isArray()` ở 4 chỗ
3. **Geo tool "Good privacy" false-positive** (0 posts → nói "no location tags"):
   → Fix: phân biệt 4 trạng thái: API fail / private / no posts / has posts without location
4. **Safe image stacking** (mỗi click append thêm card mới):
   → Fix: `out.innerHTML = '...'` thay vì `appendChild`
5. **Text-blur phá QR detection** (blur pixelate finder pattern):
   → Fix: detect QR trên ảnh sạch trước → record box → blur text (exclude QR box) → cover QR cuối cùng
6. **fetchProfileInfo bỏ lat/lng** (chỉ extract `node.location.name`):
   → Fix: extract đủ name + lat + lng từ XDTLocationDict

### 10.3 Bài học rút ra

- **MV3 CSP rất strict** — bất kỳ remote script nào đều bị reject. Phải bundle local hoặc disable feature đó.
- **IG API degraded ngày càng hung hãn** — mọi public endpoint đều có thể trả response stripped. Phải có 2-3 lớp fallback.
- **Cache invalidation** quan trọng — không cache empty result, không cache khi schema parser thay đổi (bump version key).
- **User adblock** là yếu tố không kiểm soát được — must work without API, fallback sang HTML scrape, JSON-LD, DOM extract.
- **Service worker DevTools vs page console** — log của background chỉ thấy ở `chrome://extensions → service worker`. Phải educate developer/QA về điều này.

---

## 11. Hướng phát triển tương lai

### 11.1 Ngắn hạn (đã có trong roadmap)

- [ ] OCR thực sự work trong MV3 — qua OffscreenCanvas + WASM bundle hoặc fallback localhost service
- [ ] Heatmap pan/zoom + click-to-Maps overlay
- [ ] Text-region detection bằng MSER hoặc lightweight CRNN export sang ONNX runtime web
- [ ] GitHub connected apps DOM parser (cùng pattern với IG/X)
- [ ] Apps count delta alert (so với lần parse trước → app mới xuất hiện = phải review)
- [ ] pHash diff ngược: build "celebrity reference set" để cảnh báo khi user upload ảnh giống public figure

### 11.2 Trung hạn

- Support thêm **Facebook**, **TikTok**, **Threads** (cần phân tích DOM + API riêng)
- Cross-language regex patterns (Korean, Japanese, Chinese cho Asian-targeted)
- Hỗ trợ Firefox (chi tiết ở mục **11.3 Firefox Port**) + Edge (Chromium → drop-in compat)
- **Encrypted local backup** xuất ra file (mật khẩu user-supplied)

### 11.3 Firefox Port — Feasibility Analysis

Firefox đã hỗ trợ **Manifest V3** từ Firefox 109 (Jan 2023). Port từ Chrome MV3 sang Firefox MV3 **khả thi** với ~80% code không đổi, nhưng có 6 điểm khác biệt cần xử lý:

#### 11.4.1 Khác biệt API

| Khía cạnh | Chrome MV3 | Firefox MV3 | Solution |
|---|---|---|---|
| Namespace API | `chrome.*` (callback hoặc Promise) | `browser.*` (native Promise) | Dùng `webextension-polyfill` (~30KB) — wrap `chrome.*` thành `browser.*` cross-browser |
| Background context | **Service Worker** (terminate sau idle, không persistent global) | **Event Page** (non-persistent background page, có DOM-like context) | Code hiện tại của ta dùng `importScripts('../lib/storage.js')` — service-worker-only. Firefox event page không support `importScripts` ngoài WW, cần đổi sang `<script>` tag trong background page HTML, hoặc bundle |
| `chrome.scripting.executeScript` | OK | OK from FF 102+ | Compatible |
| `chrome.alarms` | OK | OK | Compatible |
| `chrome.notifications` | OK | OK với một số option khác (vd thiếu `buttons`) | Test feature parity |
| `chrome.cookies` | OK (cần `cookies` permission) | OK với extra check first-party isolation | Tested-but-different |

#### 11.4.2 Manifest changes

Manifest hiện tại cần thêm `browser_specific_settings.gecko`:

```jsonc
{
  "manifest_version": 3,
  "name": "SocialShield",
  "version": "1.1.0",
  // ... existing fields ...

  "browser_specific_settings": {
    "gecko": {
      "id": "socialshield@uit.edu.vn",
      "strict_min_version": "115.0"
    }
  },

  // Background: Firefox không support service_worker key,
  // dùng scripts array thay thế (event page model)
  "background": {
    // Chrome MV3:
    "service_worker": "background/service-worker.js",
    // Firefox MV3 fallback (Chrome ignore):
    "scripts": ["background/service-worker.js"],
    "type": "module"  // nếu dùng ES modules
  }
}
```

Chrome đọc `service_worker`, Firefox đọc `scripts` — có thể co-exist trong cùng 1 manifest.

#### 11.4.3 importScripts vs script tags

**Vấn đề lớn nhất**: `background/service-worker.js` của ta dòng đầu có:

```js
try {
  importScripts('../lib/storage.js');
} catch (err) {
  console.error('Failed to importScripts storage.js:', err);
}
```

`importScripts` chỉ tồn tại trong **WebWorker context** (service worker). Firefox event page **không phải worker** → throw `ReferenceError`.

**Solution A — Conditional load**:
```js
if (typeof importScripts !== 'undefined') {
  // Chrome service worker path
  importScripts('../lib/storage.js');
}
// Firefox path: rely on background.scripts array trong manifest
// liệt kê storage.js trước service-worker.js
```

Sau đó manifest:
```jsonc
"background": {
  "service_worker": "background/service-worker.js",
  "scripts": ["lib/storage.js", "background/service-worker.js"]
}
```

**Solution B — Bundler** (Webpack/esbuild): bundle thành 1 file duy nhất, không dùng importScripts. Recommended cho production.

#### 11.4.4 CSP & content security

Firefox MV3 CSP **strict tương tự Chrome** (`script-src 'self'`). Tất cả workaround ta đã làm (bundle jsQR, không load Tesseract remote) **vẫn áp dụng**. Không cần thay đổi gì.

#### 11.4.5 Build & distribution

| Step | Chrome | Firefox |
|---|---|---|
| Dev load | `chrome://extensions` → Load unpacked | `about:debugging#/runtime/this-firefox` → Load Temporary Add-on |
| Production sign | Optional (Web Store sign) | **Bắt buộc** sign qua AMO (`web-ext sign --api-key=... --api-secret=...`) |
| Distribution | Chrome Web Store ($5 dev fee) | addons.mozilla.org (free) hoặc self-host signed `.xpi` |

Lưu ý: Firefox temporary add-on **bị bỏ khi đóng trình duyệt** — phải sign để cài permanent. Có thể bypass bằng Firefox Developer Edition / Nightly với `xpinstall.signatures.required = false`.

#### 11.4.6 Specific code paths cần test trên Firefox

| Code path | Lý do cần test |
|---|---|
| `chrome.storage.local.get(null)` | Firefox đôi khi return `Promise` thay vì callback — `webextension-polyfill` xử lý |
| `chrome.cookies.getAll({ url: 'https://www.instagram.com' })` | Firefox first-party isolation có thể return ít cookie hơn |
| `chrome.runtime.sendMessage` từ content script | Firefox return Promise; callback style của Chrome cũng work nhờ polyfill |
| `fetch` từ background | Firefox CORS rule cho extension origin chặt hơn Chrome cho một số endpoint |
| `chrome.notifications.create` với `iconUrl` | Firefox đòi absolute URL (extension URL) thay vì relative |
| Service worker `self.chrome?.notifications` | Firefox event page dùng `window.browser` (sau polyfill = `browser`) — code check `self.chrome` cần đổi sang `globalThis.browser \|\| globalThis.chrome` |

#### 11.4.7 Effort estimation

| Task | Estimated effort |
|---|---|
| Thêm polyfill + cấu hình build | 2–4 giờ |
| Refactor importScripts → scripts array hoặc bundle | 4–6 giờ |
| Manifest browser_specific_settings | 30 phút |
| Test 10 main flow (capture, scan, footprint, heatmap, ...) trên Firefox | 4–8 giờ |
| Fix Firefox-specific bugs (cookies, notifications, fetch CORS) | 4–12 giờ |
| Setup AMO signing pipeline | 2–4 giờ |
| **Total** | **~16–35 giờ** (~ 2-4 working days) |

#### 11.4.8 Tóm tắt khả thi

✅ **Có thể port được** với effort vừa phải.
✅ Đa số tính năng "just works" sau polyfill + manifest fix.
⚠️ Cần thay đổi background lifecycle assumption (service worker → event page).
⚠️ Service worker DevTools workflow khác (Firefox dùng `about:debugging` → Inspect).
❌ Không port được 1-to-1 nếu code phụ thuộc vào Chrome-only feature (vd `chrome.declarativeNetRequest` — ta KHÔNG dùng, an toàn).

**Recommended next step nếu port**: setup branch `feature/firefox-port`, thêm `webextension-polyfill` + bundler (esbuild), generate 2 manifest variants từ 1 source template, CI build cả 2 artifact (`socialshield-chrome.zip`, `socialshield-firefox.xpi`).

---

### 11.4 Dài hạn / nghiên cứu

- Tự host **OpenSearch threat intel feed** — hợp tác với VNCERT
- ML-based bio classification (replacement cho rule-based scam patterns)
- Federated learning — chia sẻ pHash của known impersonators giữa các SocialShield user (opt-in, privacy-preserving)
- Browser-agnostic core engine có thể chạy trong Tampermonkey/Violentmonkey nếu không có quyền extension

---

## 12. Kết luận

SocialShield v1.1 đã đáp ứng 3 mục tiêu chính của đồ án:

1. **Đa persona**: cùng 1 codebase, 1 install, phục vụ threat intel analyst (Footprint Monitor + Linkage + pHash Diff), red team recon (Doxxing Report + Geo Heatmap + EXIF + VietQR), và end-user phổ thông (1-click FAB + Risk Score + Recommendations).

2. **VN-specific value**: 7 regex patterns không có ở tool quốc tế (CCCD, MSSV, biển số, MoMo, ZaloPay, family member VN, địa chỉ phường/quận), VietQR EMV decoder, UI tiếng Việt — lấp đúng khoảng trống của tool thị trường VN.

3. **Privacy-respecting**: 0 server trung gian thu thập data, k-anonymity cho password check, optional localhost-only AI server, Manifest V3 với permission tối thiểu hoá.

Bài học lớn nhất qua quá trình phát triển: **build extension cho mạng xã hội = cuộc chạy đua với platform anti-scraping**. Phải có nhiều lớp fallback (API → DOM scrape → HTML regex → JSON-LD), không cache eagerly, document workaround cho user khi adblock hoặc IG aggressive đến mức không lách được.

Tổng cộng ~12,000 dòng code (~9,700 JS + ~2,300 HTML/CSS), 11 modules, 10 dashboard pages, 6 threat intel API tích hợp, 25+ regex patterns, 3 perceptual hash functions (aHash, pHash, hashDistance), DOM scrape engine 3-pattern regex cho IG post HTML, canvas heatmap renderer 0-dep, optional Node.js + OpenAI proxy server.

Đồ án không chỉ là 1 Chrome Extension mà còn là 1 **case study về tổng hợp đa kỹ thuật** trong 1 sản phẩm phục vụ nhiều persona: từ DOM scraping, threat intel integration, image hashing, canvas graphics, regex engineering, Chrome MV3 architecture, đến UX design 3-mode (FAB inline, Dashboard SPA, Popup generic).

---

**Tác giả**: Nhóm sinh viên NT208.Q21.ANTN — UIT
**Repo**: `D:\NT208.Q21.ANTN\socialshield`
**License**: MIT
