# PROMPT TẠO SKILL CHECK-IN MỚI
# Dùng cho chat mới — copy toàn bộ phần dưới, paste vào chat, điền PHẦN 3

════════════════════════════════════════════════════════════════
PHẦN 1 — CONTEXT PROJECT
════════════════════════════════════════════════════════════════

Tôi có project auto check-in Node.js (ESM, Node 18+) cấu trúc:

auto-checkin/
├── index.js              # tự động load tất cả .js trong auto/
├── cookies.txt           # tên_kèo=Bearer_token hoặc cookie_string
├── utils/
│   ├── loadCookies.js    # export getAuth(platform), getCookie(platform)
│   └── logger.js         # export log(platform, msg, type), logResult(platform, success, detail)
└── auto/
    └── [tên_kèo].js      # FILE CẦN TẠO

════════════════════════════════════════════════════════════════
PHẦN 2 — QUY TẮC BẮT BUỘC
════════════════════════════════════════════════════════════════

IMPORTS — chỉ dùng đúng 2 dòng:
  import { getAuth } from "../utils/loadCookies.js";
  import { log, logResult } from "../utils/logger.js";

EXPORT — chỉ 1 hàm:
  export async function run() { ... }

AUTH — luôn dùng getAuth(), không dùng getCookie():
  const auth = getAuth(PLATFORM);
  // auth.type    → "bearer" hoặc "cookie"
  // auth.headers → { authorization: "Bearer ..." } hoặc { cookie: "..." }
  // Spread vào headers: ...auth.headers

HEADERS — build từ auth.headers + các header chuẩn:
  const headers = {
    ...auth.headers,        // auth tự động
    "accept": "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9,vi-VN;q=0.8",
    "origin": FRONTEND_URL,
    "referer": `${FRONTEND_URL}/dashboard`,
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)...",
    "sec-fetch-site": "same-origin" hoặc "cross-site",  // ★ quan trọng
    // + các header đặc biệt từ DevTools nếu có
  };

BODY:
  null  nếu Content-Length: 0 (không có body)
  JSON.stringify({...})  nếu có payload

RESPONSE — handle đủ:
  200/201 → thành công + detect "already checked in" trong body
  401     → auth hết hạn
  403     → bị block
  429     → rate limit
  timeout → AbortSignal.timeout(15000)
  default → log raw

TASK CHECK — function checkTasks(headers) riêng:
  Thử nhiều path phổ biến để tìm task list endpoint
  Lọc task chưa hoàn thành → log ra với format:
    ⚡ TASK CHƯA LÀM: "tên task" (reward: X)
  Return: array task chưa làm, [] nếu hết, null nếu không tìm được endpoint

RETURN của run():
  { success, platform, newTasks: [], data/reason }

CUỐI FILE — comment hướng dẫn setup cookies.txt

════════════════════════════════════════════════════════════════
PHẦN 3 — THÔNG TIN KÈO MỚI ★ ĐIỀN VÀO ĐÂY
════════════════════════════════════════════════════════════════

Tên kèo (chữ thường, không dấu):
  [VD: galxe]

── CHECK-IN REQUEST (từ DevTools) ──

:authority (backend domain):
  [VD: onvoyage-backend-954067898723.us-central1.run.app]
  [Để trống nếu cùng domain với frontend]

:path:
  [VD: /api/v1/task/checkin]

:method:
  [POST / GET]

Content-Length:
  [0 nếu không có body, hoặc số bytes]

Body (tab Payload):
  [paste nội dung JSON hoặc ghi "rỗng"]

Loại auth (nhìn vào Request Headers):
  [ ] Authorization: Bearer eyJ...   → Bearer JWT
  [ ] cookie: _ga=...; session=...   → Cookie string

Sec-Fetch-Site:
  [ ] same-origin   (backend cùng domain frontend)
  [ ] cross-site    (backend khác domain)

Header đặc biệt (nếu thấy trong Request Headers ngoài các header chuẩn):
  [VD: x-csrf-token: abc, x-api-key: xyz — ghi "không có" nếu không thấy]

── TASK LIST REQUEST (nếu có) ──

:path:
  [VD: /api/v1/task/list — để trống nếu không tìm được]

Response structure (tab Preview):
  [paste JSON hoặc mô tả — để biết field nào là tên task, status, reward]

── RESPONSE CHECK-IN ──

Response khi thành công (tab Preview):
  [paste JSON]

Response khi đã check-in rồi (nếu biết):
  [paste JSON hoặc ghi "không biết"]

════════════════════════════════════════════════════════════════
YÊU CẦU OUTPUT
════════════════════════════════════════════════════════════════

1. Viết file auto/[tên_kèo].js hoàn chỉnh theo đúng quy tắc PHẦN 2
2. Nếu thiếu thông tin → ghi // TODO: ... trong code thay vì tự đoán
3. Không dùng thư viện ngoài (fetch native + utils/ chỉ vậy thôi)
4. Cuối file có comment hướng dẫn setup cookies.txt
