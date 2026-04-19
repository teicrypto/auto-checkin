// auto/onvoyage.js
// Platform  : app.onvoyage.ai — GEO Dashboard
// Endpoint  : POST https://onvoyage-backend-954067898723.us-central1.run.app/api/v1/task/checkin
// Auth      : Authorization Bearer token (JWT)
// Body      : RỖNG (Content-Length: 0)
// Confirmed : 19/04/2026 từ DevTools Network tab

import { getCookie } from "../utils/loadCookies.js";
import { log, logResult } from "../utils/logger.js";

// ─────────────────────────────────────────────────────────────
// CONFIG — đã xác nhận từ DevTools, không cần đổi trừ khi site update
// ─────────────────────────────────────────────────────────────
const PLATFORM     = "onvoyage";
const FRONTEND_URL = "https://app.onvoyage.ai";
const BACKEND_URL  = "https://onvoyage-backend-954067898723.us-central1.run.app";
const ENDPOINT     = `${BACKEND_URL}/api/v1/task/checkin`;

// ─────────────────────────────────────────────────────────────
// HELPER — parse response an toàn, không bao giờ throw
// ─────────────────────────────────────────────────────────────
async function safeJson(res) {
  const text = await res.text().catch(() => "");
  if (!text.trim()) return {};
  try { return JSON.parse(text); }
  catch { return { _raw: text.slice(0, 500) }; }
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
export async function run() {
  log(PLATFORM, "══════════════════════════════════════════");
  log(PLATFORM, "Bắt đầu check-in...");

  // ── 1. Đọc Bearer token từ cookies.txt ──────────────────
  // Lưu ý: "cookie" ở đây thực chất là Bearer JWT token
  // Cách lấy token: DevTools → Network → click request checkin
  //   → Headers → Authorization → copy phần sau chữ "Bearer "
  // Dán vào cookies.txt theo format:
  //   onvoyage=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx
  let token;
  try {
    token = getCookie(PLATFORM);
    // Tự động bỏ prefix "Bearer " nếu user lỡ copy cả cụm
    if (token.toLowerCase().startsWith("bearer ")) {
      token = token.slice(7).trim();
    }
    log(PLATFORM, `Token loaded (${token.length} chars)`);
  } catch (err) {
    log(PLATFORM, err.message, "error");
    log(PLATFORM, "→ Thêm vào cookies.txt:  onvoyage=eyJhbGci...", "warn");
    log(PLATFORM, "→ Lấy token: DevTools → request checkin → Headers → Authorization → copy sau 'Bearer '", "warn");
    return { success: false, platform: PLATFORM, reason: "no_token" };
  }

  // ── 2. Xây headers — khớp hoàn toàn với DevTools ────────
  const headers = {
    // Auth — quan trọng nhất
    "authorization"      : `Bearer ${token}`,
    // Standard
    "accept"             : "application/json, text/plain, */*",
    "accept-encoding"    : "gzip, deflate, br, zstd",
    "accept-language"    : "en-US,en;q=0.9,vi-VN;q=0.8,vi;q=0.7,fr-FR;q=0.6,fr;q=0.5",
    "content-length"     : "0",
    // Navigation context
    "origin"             : FRONTEND_URL,
    "referer"            : `${FRONTEND_URL}/`,
    "priority"           : "u=1, i",
    // Browser fingerprint — khớp với Chrome 147 trong ảnh
    "user-agent"         : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
    "sec-ch-ua"          : '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
    "sec-ch-ua-mobile"   : "?0",
    "sec-ch-ua-platform" : '"Windows"',
    "sec-fetch-dest"     : "empty",
    "sec-fetch-mode"     : "cors",
    "sec-fetch-site"     : "cross-site", // backend khác domain với frontend
  };

  // ── 3. Gọi API check-in ──────────────────────────────────
  log(PLATFORM, `POST ${ENDPOINT}`);

  let res;
  try {
    res = await fetch(ENDPOINT, {
      method  : "POST",
      headers,
      // Body rỗng — Content-Length: 0 xác nhận từ DevTools
      body    : null,
      signal  : AbortSignal.timeout(15000),
    });
  } catch (err) {
    const reason = err.name === "TimeoutError"
      ? "Timeout >15s — server không phản hồi"
      : `Network error: ${err.message}`;
    log(PLATFORM, reason, "error");
    return { success: false, platform: PLATFORM, reason };
  }

  const data = await safeJson(res);
  log(PLATFORM, `[DEBUG] HTTP ${res.status} → ${JSON.stringify(data).slice(0, 300)}`);

  // ── 4. Xử lý response ────────────────────────────────────
  switch (res.status) {

    case 200:
    case 201: {
      const msg =
        data?.message       ||
        data?.msg           ||
        data?.data?.message ||
        data?.result        ||
        "OK";

      // Detect "đã check-in hôm nay rồi" trả về trong body
      const alreadyKeywords = ["already", "checked", "duplicate", "today", "done", "exists"];
      if (alreadyKeywords.some(kw => String(msg).toLowerCase().includes(kw))) {
        logResult(PLATFORM, true, `Đã check-in rồi: "${msg}"`);
        return { success: true, platform: PLATFORM, reason: "already_checked_in", data };
      }

      // Điểm / reward nếu có
      const points =
        data?.data?.points  ||
        data?.data?.reward  ||
        data?.data?.tokens  ||
        data?.points        ||
        data?.reward        ||
        null;

      const detail = points !== null ? `${msg} | +${points}` : msg;
      logResult(PLATFORM, true, detail);
      return { success: true, platform: PLATFORM, data };
    }

    case 401:
      logResult(PLATFORM, false,
        "Token hết hạn (401). Cần lấy token mới từ DevTools → Authorization header."
      );
      return { success: false, platform: PLATFORM, reason: "unauthorized" };

    case 403:
      logResult(PLATFORM, false,
        "Bị từ chối (403). Token sai hoặc không đủ quyền."
      );
      return { success: false, platform: PLATFORM, reason: "forbidden" };

    case 429: {
      const retryAfter = res.headers.get("retry-after") || "?";
      logResult(PLATFORM, false, `Rate limit (429) — thử lại sau ${retryAfter}s.`);
      return { success: false, platform: PLATFORM, reason: "rate_limited" };
    }

    default: {
      const reason =
        data?.message ||
        data?.error   ||
        data?.msg     ||
        data?._raw    ||
        `HTTP ${res.status}`;
      logResult(PLATFORM, false, String(reason).slice(0, 200));
      return { success: false, platform: PLATFORM, reason, statusCode: res.status };
    }
  }
}

// ═══════════════════════════════════════════════════════════════
//  CÁCH LẤY BEARER TOKEN (làm 1 lần, token hết hạn thì lặp lại)
// ═══════════════════════════════════════════════════════════════
//
//  1. Mở https://app.onvoyage.ai/dashboard (đã đăng nhập)
//  2. F12 → Network → Fetch/XHR
//  3. Bấm nút DAILY CHECK IN (hoặc reload trang để thấy request khác)
//  4. Click vào request "checkin"
//  5. Tab Headers → Request Headers → tìm dòng:
//       Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx
//  6. Copy phần sau chữ "Bearer " (bắt đầu từ eyJ...)
//  7. Dán vào cookies.txt:
//       onvoyage=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx
//
//  ⚠️  JWT token thường hết hạn sau 1-30 ngày
//      Khi thấy lỗi 401 → lấy token mới theo các bước trên
// ═══════════════════════════════════════════════════════════════
