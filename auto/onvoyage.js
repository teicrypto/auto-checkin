// auto/onvoyage.js
// Platform  : app.onvoyage.ai — GEO Dashboard
// Endpoint  : POST https://onvoyage-backend-954067898723.us-central1.run.app/api/v1/task/checkin
// Auth      : Authorization Bearer JWT (auto-detect)
// Body      : RỖNG (Content-Length: 0)
// Features  : ✅ Check-in + ⚡ Task check + 🛡️ Full anti-detection
// Confirmed : 19/04/2026

import { getAuth } from "../utils/loadCookies.js";
import { log, logResult } from "../utils/logger.js";

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────
const PLATFORM     = "onvoyage";
const FRONTEND_URL = "https://app.onvoyage.ai";
const BACKEND_URL  = "https://onvoyage-backend-954067898723.us-central1.run.app";
const ENDPOINT_CHECKIN = `${BACKEND_URL}/api/v1/task/checkin`;

// Chrome version lấy từ DevTools — sec-ch-ua phải khớp user-agent
const CHROME_VERSION = "147";

const TASK_LIST_PATHS = [
  "/api/v1/task/list",
  "/api/v1/tasks",
  "/api/v1/task",
  "/api/tasks",
  "/api/v1/user/tasks",
  "/api/v1/missions",
];

// ─────────────────────────────────────────────────────────────
// A. BROWSER FINGERPRINT HEADERS
// Tất cả headers phải nhất quán với nhau (version, OS, platform)
// Thứ tự khai báo khớp với thứ tự Chrome thật gửi
// ─────────────────────────────────────────────────────────────
function browserHeaders(overrides = {}) {
  const base = {
    // ── Auth (sẽ được spread trước, nằm đầu tiên) ──
    // (auth.headers được spread bên ngoài)

    // ── Body metadata ──
    // content-type chỉ thêm khi có body — KHÔNG thêm ở đây nếu body null

    // ── Accept ──
    "accept"                      : "application/json, text/plain, */*",
    "accept-encoding"             : "gzip, deflate, br, zstd",
    "accept-language"             : "en-US,en;q=0.9,vi-VN;q=0.8,vi;q=0.7,fr-FR;q=0.6,fr;q=0.5",

    // ── Navigation context ──
    "origin"                      : FRONTEND_URL,
    "referer"                     : `${FRONTEND_URL}/`,

    // ── Browser fingerprint — version phải khớp nhau ──
    "user-agent"                  : `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION}.0.0.0 Safari/537.36`,
    "sec-ch-ua"                   : `"Google Chrome";v="${CHROME_VERSION}", "Not.A/Brand";v="8", "Chromium";v="${CHROME_VERSION}"`,
    "sec-ch-ua-mobile"            : "?0",
    "sec-ch-ua-platform"          : '"Windows"',
    "sec-ch-ua-arch"              : '"x86"',
    "sec-ch-ua-bitness"           : '"64"',
    "sec-ch-ua-full-version-list" : `"Google Chrome";v="${CHROME_VERSION}.0.0.0", "Not.A/Brand";v="8.0.0.0", "Chromium";v="${CHROME_VERSION}.0.0.0"`,

    // ── Fetch metadata ──
    "sec-fetch-dest"              : "empty",
    "sec-fetch-mode"              : "cors",
    "sec-fetch-site"              : "cross-site", // backend khác domain với frontend
    "sec-fetch-user"              : "?1",          // request từ user click

    // ── Priority hint (Chrome 101+) ──
    "priority"                    : "u=1, i",
  };

  // Merge overrides (cho phép ghi đè từng field khi cần)
  return { ...base, ...overrides };
}

// ─────────────────────────────────────────────────────────────
// B. HUMAN TIMING
// Delay ngẫu nhiên giả lập hành vi người dùng thật
// ─────────────────────────────────────────────────────────────
function humanDelay(minMs = 800, maxMs = 2500) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  log(PLATFORM, `[timing] chờ ${ms}ms...`);
  return new Promise(r => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────
// C. SESSION WARMUP
// Gọi GET dashboard trước khi POST check-in
// Trình duyệt thật luôn load trang trước khi user click button
// ─────────────────────────────────────────────────────────────
async function warmup(authHeaders) {
  log(PLATFORM, "[warmup] Giả lập load trang dashboard...");
  try {
    // Headers cho navigation request (khác với fetch/XHR)
    const navHeaders = {
      ...authHeaders,
      "accept"         : "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "accept-encoding": "gzip, deflate, br, zstd",
      "accept-language": "en-US,en;q=0.9,vi-VN;q=0.8",
      "user-agent"     : `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION}.0.0.0 Safari/537.36`,
      "sec-ch-ua"      : `"Google Chrome";v="${CHROME_VERSION}", "Not.A/Brand";v="8", "Chromium";v="${CHROME_VERSION}"`,
      "sec-ch-ua-mobile"   : "?0",
      "sec-ch-ua-platform" : '"Windows"',
      "sec-fetch-dest" : "document",  // navigation request
      "sec-fetch-mode" : "navigate",
      "sec-fetch-site" : "none",      // direct URL access
      "sec-fetch-user" : "?1",
      "upgrade-insecure-requests": "1",
    };
    await fetch(`${FRONTEND_URL}/dashboard`, {
      method  : "GET",
      headers : navHeaders,
      signal  : AbortSignal.timeout(8000),
    });
    log(PLATFORM, "[warmup] Done — giả lập user đang đọc trang...");
    // Giả lập thời gian user nhìn vào trang trước khi click
    await humanDelay(1200, 3000);
  } catch {
    log(PLATFORM, "[warmup] Skip — tiếp tục check-in.", "warn");
  }
}

// ─────────────────────────────────────────────────────────────
// D. FETCH WITH RETRY + BACKOFF
// Tự động retry khi gặp network error hoặc rate limit
// ─────────────────────────────────────────────────────────────
async function fetchWithRetry(url, options, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });

      if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get("retry-after") || "60");
        log(PLATFORM, `[retry] Rate limit (429) — chờ ${retryAfter}s...`, "warn");
        await new Promise(r => setTimeout(r, retryAfter * 1000));
        continue; // retry
      }

      return res;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const wait = (attempt + 1) * 2000 + Math.random() * 1000;
      log(PLATFORM, `[retry] Lần ${attempt + 1} thất bại — thử lại sau ${Math.round(wait/1000)}s...`, "warn");
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

// ─────────────────────────────────────────────────────────────
// E. SAFE JSON PARSE
// ─────────────────────────────────────────────────────────────
async function safeJson(res) {
  const text = await res.text().catch(() => "");
  if (!text.trim()) return {};
  try { return JSON.parse(text); }
  catch { return { _raw: text.slice(0, 500) }; }
}

// ─────────────────────────────────────────────────────────────
// F. CHECK TASKS
// ─────────────────────────────────────────────────────────────
async function checkTasks(headers) {
  log(PLATFORM, "── Kiểm tra danh sách task...");
  await humanDelay(400, 1000); // delay nhỏ giữa các request

  for (const path of TASK_LIST_PATHS) {
    let res;
    try {
      res = await fetch(`${BACKEND_URL}${path}`, {
        method  : "GET",
        headers : { ...headers, "sec-fetch-user": undefined }, // GET không có sec-fetch-user
        signal  : AbortSignal.timeout(8000),
      });
    } catch { continue; }

    if (!res.ok) continue;

    const data  = await safeJson(res);
    const tasks =
      data?.data?.tasks || data?.data?.list || data?.data ||
      data?.tasks       || data?.list       || data?.result || null;

    if (!Array.isArray(tasks)) continue;

    log(PLATFORM, `Task endpoint OK: ${path} — ${tasks.length} task(s)`);

    const pending = tasks.filter(t =>
      !(t?.completed === true || t?.done === true || t?.is_completed === true ||
        t?.status === "completed" || t?.status === "done" || t?.status === 1)
    );

    if (pending.length === 0) {
      log(PLATFORM, "✅ Tất cả task đã hoàn thành!", "success");
      return [];
    }

    log(PLATFORM, `⚡ ${pending.length} task chưa hoàn thành:`, "warn");
    return pending.map(t => {
      const name   = t?.name || t?.title || t?.task_name || t?.description || t?.type || "Unknown";
      const reward = t?.reward || t?.points || t?.tokens || null;
      log(PLATFORM, `   ⚡ TASK CHƯA LÀM: "${name}"${reward !== null ? ` (reward: ${reward})` : ""}`, "warn");
      return { name, reward, raw: t };
    });
  }

  log(PLATFORM, "Không tìm thấy task endpoint — bỏ qua.", "warn");
  return null;
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
export async function run() {
  log(PLATFORM, "══════════════════════════════════════════");
  log(PLATFORM, "Bắt đầu check-in (full anti-detection mode)...");

  // ── 1. Auth ─────────────────────────────────────────────
  let auth;
  try {
    auth = getAuth(PLATFORM);
    log(PLATFORM, `Auth type: ${auth.type} (${auth.value.length} chars)`);
  } catch (err) {
    log(PLATFORM, err.message, "error");
    log(PLATFORM, "→ Thêm vào cookies.txt:  onvoyage=eyJhbGci...", "warn");
    return { success: false, platform: PLATFORM, reason: "no_auth" };
  }

  // ── 2. Build headers — auth đứng đầu, rồi browser fingerprint ──
  const headers = {
    ...auth.headers,       // authorization: Bearer ... (đứng đầu như Chrome thật)
    ...browserHeaders(),   // tất cả fingerprint headers
    // content-length: 0 — không thêm content-type vì body null
    "content-length": "0",
  };

  // ── 3. Warmup — giả lập load trang trước khi click ──────
  await warmup(auth.headers);

  // ── 4. Delay nhỏ trước khi click check-in ───────────────
  // Giả lập thời gian user di chuyển chuột đến nút rồi click
  await humanDelay(300, 900);

  // ── 5. Gọi check-in ─────────────────────────────────────
  log(PLATFORM, `Bước 1/2 — POST ${ENDPOINT_CHECKIN}`);
  let res;
  try {
    res = await fetchWithRetry(ENDPOINT_CHECKIN, {
      method  : "POST",
      headers,
      body    : null, // Content-Length: 0 đã xác nhận từ DevTools
    });
  } catch (err) {
    const reason = err.name === "TimeoutError" ? "Timeout >15s" : `Network: ${err.message}`;
    log(PLATFORM, reason, "error");
    return { success: false, platform: PLATFORM, reason };
  }

  const data = await safeJson(res);
  log(PLATFORM, `[DEBUG] HTTP ${res.status} → ${JSON.stringify(data).slice(0, 300)}`);

  // ── 6. Xử lý response ────────────────────────────────────
  if (res.status === 401) {
    logResult(PLATFORM, false, "Token hết hạn (401) — lấy token mới từ DevTools → Authorization header.");
    return { success: false, platform: PLATFORM, reason: "unauthorized" };
  }
  if (res.status === 403) {
    logResult(PLATFORM, false, "Bị block (403) — kiểm tra token hoặc bị detect bot.");
    return { success: false, platform: PLATFORM, reason: "forbidden" };
  }
  if (!res.ok) {
    logResult(PLATFORM, false, String(data?.message || data?.error || `HTTP ${res.status}`).slice(0, 200));
    return { success: false, platform: PLATFORM, reason: data?.message || `HTTP ${res.status}` };
  }

  // 200/201 — thành công
  const msg = data?.message || data?.msg || data?.data?.message || data?.result || "OK";
  const alreadyDone = ["already","checked","duplicate","today","done","exists"]
    .some(kw => String(msg).toLowerCase().includes(kw));
  const points = data?.data?.points || data?.data?.reward || data?.points || data?.reward || null;
  logResult(PLATFORM, true, alreadyDone
    ? `Đã check-in rồi: "${msg}"`
    : (points !== null ? `${msg} | +${points}` : msg)
  );

  // ── 7. Kiểm tra task ─────────────────────────────────────
  log(PLATFORM, "Bước 2/2 — Kiểm tra task...");
  const newTasks = await checkTasks(headers);

  // ── 8. Tổng kết ──────────────────────────────────────────
  log(PLATFORM, "══════════════════════════════════════════");
  if (newTasks === null)          log(PLATFORM, "Tổng kết: ✅ Check-in OK | ⚠️  Không check được task");
  else if (newTasks.length === 0) log(PLATFORM, "Tổng kết: ✅ Check-in OK | ✅ Không có task mới", "success");
  else                            log(PLATFORM, `Tổng kết: ✅ Check-in OK | ⚡ ${newTasks.length} TASK CHƯA LÀM — vào làm thủ công!`, "warn");

  return { success: true, platform: PLATFORM, newTasks: newTasks ?? [], data };
}

// ═══════════════════════════════════════════════════════════════
//  SETUP cookies.txt
//  onvoyage=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx
//
//  Lấy token: DevTools → request checkin → Headers → Authorization
//  → copy phần sau "Bearer " (bắt đầu từ eyJ...)
//  Token hết hạn → lỗi 401 → lấy lại token
// ═══════════════════════════════════════════════════════════════
