# PROMPT TẠO SKILL CHECK-IN MỚI — FULL ANTI-DETECTION
# Dùng cho chat mới — copy toàn bộ, paste vào chat, điền PHẦN 4

════════════════════════════════════════════════════════════════
PHẦN 1 — CONTEXT PROJECT
════════════════════════════════════════════════════════════════

Project auto check-in Node.js (ESM, Node 18+):

auto-checkin/
├── index.js
├── cookies.txt           # tên_kèo=Bearer_token hoặc cookie_string
├── utils/
│   ├── loadCookies.js    # export getAuth(platform)
│   │                     #   → { type, value, headers }
│   └── logger.js         # export log(platform, msg, type), logResult(...)
└── auto/
    └── [tên_kèo].js      # FILE CẦN TẠO

getAuth() tự động detect:
  eyJ... (3 phần ngăn bởi .)  → { type:"bearer", headers:{ authorization:"Bearer ..." } }
  _ga=...; session=...        → { type:"cookie", headers:{ cookie:"..." } }

════════════════════════════════════════════════════════════════
PHẦN 2 — QUY TẮC CODE BẮT BUỘC
════════════════════════════════════════════════════════════════

IMPORTS:
  import { getAuth } from "../utils/loadCookies.js";
  import { log, logResult } from "../utils/logger.js";

EXPORT:
  export async function run() { ... }

AUTH:
  const auth = getAuth(PLATFORM);
  const headers = { ...auth.headers, ...browserHeaders(), ...extraHeaders };

RESPONSE — handle đủ 401/403/429/timeout/200/default

TASK CHECK — function checkTasks(headers) riêng, chạy sau check-in

RETURN:
  { success, platform, newTasks:[], data/reason }

════════════════════════════════════════════════════════════════
PHẦN 3 — ANTI-DETECTION (ÁP DỤNG CHO MỌI SKILL)
════════════════════════════════════════════════════════════════

Viết skill với đầy đủ các kỹ thuật sau:

── A. BROWSER FINGERPRINT HEADERS ──────────────────────────────

Tạo function browserHeaders() với headers NHẤT QUÁN, không mâu thuẫn nhau.
Quan trọng: sec-ch-ua phải khớp với user-agent cùng version Chrome.

const CHROME_VERSION = "147";  // đổi theo DevTools thực tế
const PLATFORM_OS    = "Windows";

function browserHeaders() {
  return {
    // ── Core ──
    "accept"              : "application/json, text/plain, */*",
    "accept-encoding"     : "gzip, deflate, br, zstd",
    "accept-language"     : "en-US,en;q=0.9,vi-VN;q=0.8,vi;q=0.7,fr-FR;q=0.6,fr;q=0.5",
    "connection"          : "keep-alive",

    // ── Browser fingerprint — phải khớp nhau (version, OS, platform) ──
    "user-agent"          : `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION}.0.0.0 Safari/537.36`,
    "sec-ch-ua"           : `"Google Chrome";v="${CHROME_VERSION}", "Not.A/Brand";v="8", "Chromium";v="${CHROME_VERSION}"`,
    "sec-ch-ua-mobile"    : "?0",
    "sec-ch-ua-platform"  : `"${PLATFORM_OS}"`,
    "sec-ch-ua-arch"      : '"x86"',
    "sec-ch-ua-bitness"   : '"64"',
    "sec-ch-ua-full-version-list": `"Google Chrome";v="${CHROME_VERSION}.0.0.0", "Not.A/Brand";v="8.0.0.0", "Chromium";v="${CHROME_VERSION}.0.0.0"`,

    // ── Fetch metadata — phải khớp với context request ──
    "sec-fetch-dest"      : "empty",
    "sec-fetch-mode"      : "cors",
    "sec-fetch-site"      : "same-origin",  // ★ đổi "cross-site" nếu backend khác domain
    "sec-fetch-user"      : "?1",           // chỉ thêm nếu request từ user action (click)

    // ── Priority hint (Chrome 101+) ──
    "priority"            : "u=1, i",
  };
}

── B. HUMAN TIMING — delay ngẫu nhiên giả lập hành vi người dùng ──

// Delay ngẫu nhiên giữa các bước (ms)
function humanDelay(minMs = 800, maxMs = 2500) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(r => setTimeout(r, ms));
}

// Dùng trước khi gọi API check-in:
await humanDelay(500, 1500);   // giả lập thời gian user nhìn vào trang rồi mới click
// Dùng giữa các bước multi-step:
await humanDelay(300, 800);

── C. REQUEST ORDERING — thứ tự header đúng như Chrome thật ──

Node.js fetch() giữ nguyên thứ tự header khai báo.
Luôn khai báo theo thứ tự Chrome thật gửi:
  1. :method, :path, :authority (pseudo-headers, tự động)
  2. content-length / content-type (nếu có body)
  3. authorization / cookie
  4. accept
  5. accept-encoding
  6. accept-language
  7. origin
  8. referer
  9. user-agent
  10. sec-ch-ua*
  11. sec-fetch-*
  12. priority
  13. Các header tuỳ chỉnh khác (x-csrf-token...)

── D. SESSION WARMUP — gọi 1 request GET trước khi check-in ──

Trước khi POST check-in, gọi GET trang dashboard hoặc /api/user/me.
Lý do: trình duyệt thật luôn load trang trước khi user click button.
Nếu server thấy POST check-in mà không có GET trước → dấu hiệu bot.

async function warmup(headers, baseUrl) {
  try {
    await fetch(`${baseUrl}/dashboard`, {
      method  : "GET",
      headers : { ...headers, "sec-fetch-dest": "document", "sec-fetch-mode": "navigate", "sec-fetch-site": "none" },
      signal  : AbortSignal.timeout(8000),
    });
    await humanDelay(1000, 2500); // giả lập thời gian trang load xong
  } catch {
    // warmup fail không nghiêm trọng, tiếp tục
  }
}

── E. RETRY VỚI BACKOFF — giả lập retry tự nhiên ──

async function fetchWithRetry(url, options, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429) {
        const wait = parseInt(res.headers.get("retry-after") || "60") * 1000;
        log(PLATFORM, `Rate limit — chờ ${wait/1000}s...`, "warn");
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      return res;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await humanDelay(2000, 5000); // chờ trước khi retry
    }
  }
}

── F. CONTENT-TYPE ĐÚNG ──

Không có body   → KHÔNG thêm content-type
Body JSON       → "content-type": "application/json"
Body form-data  → "content-type": "application/x-www-form-urlencoded"

Sai content-type là dấu hiệu bot rõ nhất.

── G. ORIGIN & REFERER CHÍNH XÁC ──

Quy tắc:
  origin  = domain gốc không có trailing slash: "https://app.example.com"
  referer = trang cụ thể user đang đứng:        "https://app.example.com/dashboard"

Nếu backend khác domain (cross-site):
  sec-fetch-site = "cross-site"
  origin vẫn là FRONTEND domain (không phải backend)

════════════════════════════════════════════════════════════════
PHẦN 4 — THÔNG TIN KÈO MỚI ★ ĐIỀN VÀO ĐÂY
════════════════════════════════════════════════════════════════

Tên kèo (chữ thường, không dấu):
  [ ]

── CHECK-IN REQUEST (DevTools → Network → Fetch/XHR → click request check-in) ──

:authority (backend domain, để trống nếu cùng domain frontend):
  [ ]

Frontend URL (trang web bạn đang mở):
  [ ]

:path:
  [ ]

:method:
  [ ] POST  [ ] GET

Content-Length:
  [ ] 0 (không có body)
  [ ] Có body → paste nội dung tab Payload:

Body:
  [ ]

Loại auth (nhìn vào Request Headers):
  [ ] Authorization: Bearer eyJ...
  [ ] cookie: _ga=...
  [ ] Khác: [ ]

Chrome version (xem trong sec-ch-ua):
  [ ] "Google Chrome";v="___"

Sec-Fetch-Site:
  [ ] same-origin   [ ] cross-site

Header đặc biệt ngoài các header chuẩn (x-csrf-token, x-api-key...):
  [ ] Không có
  [ ] Có: [ ]

── TASK LIST (reload trang dashboard → tìm GET request trả về array tasks) ──

:path task list:
  [ ] Không tìm được
  [ ] Tìm được: [ ]

Response task list (tab Preview — paste để biết field tên, status, reward):
  [ ]

── RESPONSE CHECK-IN ──

Response thành công (tab Preview):
  [ ]

Response đã check-in rồi (nếu biết):
  [ ]

════════════════════════════════════════════════════════════════
YÊU CẦU OUTPUT
════════════════════════════════════════════════════════════════

1. Viết file auto/[tên_kèo].js với ĐẦY ĐỦ các kỹ thuật PHẦN 3:
   - function browserHeaders() với version khớp DevTools
   - function humanDelay() + dùng trước check-in và giữa các bước
   - function warmup() + gọi trước check-in
   - function fetchWithRetry() + dùng cho request check-in
   - Header order đúng thứ tự Chrome
   - content-type chỉ thêm khi có body
   - origin/referer chính xác
   - function checkTasks() sau check-in

2. Nếu thiếu thông tin → ghi // TODO: ... thay vì tự đoán

3. Không dùng thư viện ngoài (chỉ fetch native + utils/)

4. Cuối file có comment:
   // SETUP: tên_kèo=eyJ... hoặc tên_kèo=cookie_string
   // Token hết hạn → lấy lại từ DevTools → Authorization header
