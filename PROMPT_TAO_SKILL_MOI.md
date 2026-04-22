# PROMPT TẠO SKILL CHECK-IN MỚI — PLAYWRIGHT STEALTH
# Dùng cho chat mới — copy toàn bộ, paste vào chat, điền PHẦN 5

════════════════════════════════════════════════════════════════
PHẦN 1 — CONTEXT PROJECT
════════════════════════════════════════════════════════════════

Project auto check-in Node.js (ESM, Node 18+), engine Playwright headless:

auto-checkin/
├── index.js
├── setup.js              # chạy 1 lần sau clone: node setup.js
├── cookies.txt           # tên_kèo=Bearer_token hoặc cookie_string
├── utils/
│   ├── browser.js        # Playwright stealth — createContext, createPage, humanDelay, humanClick, closeBrowser
│   ├── loadCookies.js    # getAuth(platform) → { type, value, headers }
│   └── logger.js         # log(platform, msg, type), logResult(platform, success, detail)
└── auto/
    └── [tên_kèo].js      # FILE CẦN TẠO

getAuth() tự động detect:
  eyJ...x.y.z  → { type:"bearer", headers:{ authorization:"Bearer ..." } }
  _ga=...;...  → { type:"cookie", headers:{ cookie:"..." } }

════════════════════════════════════════════════════════════════
PHẦN 2 — MÔI TRƯỜNG CHẠY
════════════════════════════════════════════════════════════════

Playwright chạy headless (không cần GUI/màn hình):
  - headless: true trong browser.js
  - Chạy được trên: VPS Linux, Docker, GitHub Actions, cron job
  - Không cần Xvfb hay display server
  - node setup.js sẽ tự cài Chromium kèm system dependencies

════════════════════════════════════════════════════════════════
PHẦN 3 — CẤU TRÚC SKILL BẮT BUỘC
════════════════════════════════════════════════════════════════

IMPORTS — đúng 3 dòng:
  import { getAuth } from "../utils/loadCookies.js";
  import { log, logResult } from "../utils/logger.js";
  import { createContext, createPage, humanDelay } from "../utils/browser.js";

EXPORT:
  export async function run() { ... }

PATTERN CHÍNH — gọi API từ bên trong browser (Chrome thật xử lý TLS/HTTP2):
  async function browserFetch(page, url, options = {}) {
    const result = await page.evaluate(async ({ url, options }) => {
      try {
        const res  = await fetch(url, options);
        const text = await res.text();
        return { status: res.status, ok: res.ok, text, headers: Object.fromEntries(res.headers.entries()) };
      } catch (err) { return { error: err.message }; }
    }, { url, options });
    if (result.error) throw new Error(result.error);
    return {
      status  : result.status,
      ok      : result.ok,
      headers : result.headers,
      json    : () => { try { return JSON.parse(result.text); } catch { return { _raw: result.text?.slice(0,500) }; } },
      text    : () => result.text,
    };
  }

AUTH INJECTION — thêm header vào mọi request đến backend:
  await page.route(`${BACKEND_URL}/**`, async (route) => {
    await route.continue({ headers: { ...route.request().headers(), ...auth.headers } });
  });

FLOW CHUẨN:
  1. getAuth(PLATFORM)
  2. createContext() + createPage()
  3. page.route() inject auth
  4. page.goto(dashboard, { waitUntil:"domcontentloaded" }) — warmup
  5. page.mouse.wheel() scroll nhẹ
  6. humanDelay(1500, 3500)
  7. humanDelay(200, 600) — trước API call
  8. browserFetch() check-in
  9. xử lý 401/403/429/ok
  10. checkTasks()
  11. context.close() trong finally

CLEANUP — luôn dùng try/finally:
  let context, page;
  try { ... }
  catch (err) { ... return { success: false } }
  finally { if (context) await context.close().catch(() => {}); }
  // KHÔNG gọi closeBrowser() — index.js lo

RETURN: { success, platform, newTasks:[], data/reason }

════════════════════════════════════════════════════════════════
PHẦN 4 — ANTI-DETECTION (tích hợp sẵn trong browser.js)
════════════════════════════════════════════════════════════════

Đã có sẵn, KHÔNG cần viết lại trong skill:
  ✅ navigator.webdriver = undefined
  ✅ Fake plugins, hardwareConcurrency, deviceMemory, connection
  ✅ window.chrome runtime object
  ✅ Viewport ngẫu nhiên 1366-1920px
  ✅ Timezone Asia/Ho_Chi_Minh, locale en-US
  ✅ --disable-blink-features=AutomationControlled
  ✅ Block ads/analytics/sentry/hotjar
  ✅ HTTP/2 + TLS fingerprint Chrome thật
  ✅ Human mouse Bezier curve

Trong skill CHỈ cần thêm:
  humanDelay() đúng chỗ + scroll + mouse.move() trước API call

════════════════════════════════════════════════════════════════
PHẦN 5 — THÔNG TIN KÈO MỚI ★ ĐIỀN VÀO ĐÂY
════════════════════════════════════════════════════════════════

── BƯỚC 0: KIỂM TRA TRANG TRƯỚC ────────────────────────────────

Trước khi điền, hãy vào trang web của kèo và:
  1. Xem trang dùng anti-bot gì (Cloudflare/DataDome/không có)
  2. Xác định flow login/auth
  3. Mở DevTools → Network → bấm nút Check-in để lấy thông tin

Nếu cần, hãy fetch trang chủ để phân tích:
  URL trang chủ/dashboard: [ ]

── THÔNG TIN CƠ BẢN ────────────────────────────────────────────

Tên kèo (chữ thường, không dấu):
  [ ]

Frontend URL (trang đang mở trên browser):
  [ ]

── CHECK-IN REQUEST ─────────────────────────────────────────────

Cách lấy: F12 → Network → Fetch/XHR → bấm nút Check-in → click request mới xuất hiện

:authority (nếu khác frontend URL):
  [ ]

:path:
  [ ]  VD: /api/v1/task/checkin

:method:
  [ ] POST   [ ] GET   [ ] PUT   [ ] PATCH

Content-Length:
  [ ] 0 = không có body
  [ ] Có body → tab Payload → paste nội dung:
      [ ]

Loại auth (tab Headers → Request Headers):
  [ ] Authorization: Bearer eyJ...    → copy phần sau "Bearer "
  [ ] cookie: _ga=...                 → copy toàn bộ value
  [ ] Khác: [ ]

Chrome version (tìm trong sec-ch-ua):
  "Google Chrome";v="[ ]"

Sec-Fetch-Site:
  [ ] same-origin   (backend cùng domain frontend)
  [ ] cross-site    (backend khác domain)

Header đặc biệt ngoài các header chuẩn:
  [ ] Không có
  [ ] Có: [ ]   VD: x-csrf-token, x-api-key, x-request-id

── RESPONSE CHECK-IN (tab Preview) ─────────────────────────────

Response khi THÀNH CÔNG — paste JSON:
  [ ]

Response khi ĐÃ CHECK-IN RỒI — paste JSON (nếu biết):
  [ ]

Field chứa điểm/reward (nếu thấy):
  [ ]   VD: data.points, reward, tokens

── TASK LIST ────────────────────────────────────────────────────

Cách lấy: reload trang dashboard → tìm GET request trả về array tasks[]
Tab Preview phải có dạng: { data: { tasks: [...] } } hoặc { tasks: [...] }

Path tìm được:
  [ ] Không tìm được
  [ ] Tìm được: [ ]   VD: /api/v1/task/list

Response structure — paste JSON mẫu (để biết field tên, status, reward):
  [ ]

── ANTI-BOT ─────────────────────────────────────────────────────

Trang có Cloudflare không? (thấy "Checking your browser..." khi vào lần đầu)
  [ ] Không   [ ] Có → cần xử lý thêm

Trang có yêu cầu CAPTCHA không?
  [ ] Không   [ ] Có

════════════════════════════════════════════════════════════════
PHẦN 6 — HƯỚNG DẪN LẤY THÔNG TIN TỪ DEVTOOLS
════════════════════════════════════════════════════════════════

Nếu chưa biết cách lấy thông tin, làm theo các bước sau:

① MỞ DEVTOOLS ĐÚNG CÁCH
  1. Vào trang dashboard (đã đăng nhập)
  2. F12 (hoặc Ctrl+Shift+I)
  3. Click tab "Network"
  4. Click filter "Fetch/XHR"
  5. Nếu list đang có nhiều request → click biểu tượng 🚫 (clear) để xoá hết

② BẮT REQUEST CHECK-IN
  6. Bấm nút CHECK-IN trên trang
  7. Thấy 1-3 dòng mới xuất hiện trong Network panel
  8. Tìm dòng có tên chứa: "check", "checkin", "daily", "task", "reward"
     Method thường là POST, Status 200

③ LẤY THÔNG TIN (click vào dòng đó)

  Tab "Headers":
    Kéo xuống "Request Headers"
    :authority → backend domain (nếu khác frontend)
    :path      → endpoint
    :method    → POST/GET
    Authorization: Bearer eyJ... → copy phần sau "Bearer "
       HOẶC cookie: → copy toàn bộ value
    sec-ch-ua: "Google Chrome";v="147" → lấy số version
    sec-fetch-site: same-origin/cross-site
    Header lạ khác → ghi lại hết

  Tab "Payload" (hoặc "Request"):
    Nếu có nội dung → paste vào CHECKIN_BODY
    Nếu trống/không có tab → Content-Length: 0, body = null

  Tab "Preview" (hoặc "Response"):
    Xem JSON trả về → ghi lại structure

④ LẤY TASK LIST
  9. Reload trang (F5) trong khi DevTools đang mở
  10. Tìm GET request có response là array tasks[]
      Tab Preview phải thấy: { tasks: [...] } hoặc { data: { tasks: [...] } }
  11. Lấy :path của request đó

⑤ COPY AS CURL (cách nhanh nhất — paste tất cả vào đây)
  Chuột phải vào request → Copy → "Copy as cURL (bash)"
  Paste vào đây (xoá phần giá trị Authorization/cookie trước khi paste)

════════════════════════════════════════════════════════════════
YÊU CẦU OUTPUT
════════════════════════════════════════════════════════════════

1. Nếu URL trang chủ được cung cấp → fetch trang đó trước để:
   - Xác nhận trang có dùng Cloudflare/anti-bot không
   - Tìm thêm thông tin về API structure nếu có docs public
   - Hướng dẫn cụ thể hơn nếu cần

2. Viết file auto/[tên_kèo].js theo đúng PHẦN 3:
   - browserFetch() pattern
   - page.route() inject auth
   - humanDelay() đúng chỗ + scroll + mouse.move()
   - checkTasks() riêng
   - try/finally đóng context
   - Không gọi closeBrowser()

3. Nếu thiếu thông tin → ghi // TODO: ... thay vì tự đoán

4. Cuối file comment: SETUP cookies.txt + cách lấy token

5. Nếu trang có Cloudflare → cảnh báo và hướng dẫn thêm cách xử lý
