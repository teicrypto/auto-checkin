// auto/onvoyage.js
// Platform : app.onvoyage.ai — GEO Dashboard (GeoFi / Creator Earnings)
// Action   : DAILY CHECK IN button trên /dashboard
// Node     : 18+ (fetch native, ESM)
//
// ═══════════════════════════════════════════════════════════════
// TRƯỚC KHI CHẠY — đọc phần HƯỚNG DẪN cuối file
// ═══════════════════════════════════════════════════════════════

import { getCookie } from "../utils/loadCookies.js";
import { log, logResult } from "../utils/logger.js";

// ─────────────────────────────────────────────────────────────
// CONFIG — ★ CHỈNH 2 DÒNG NÀY sau khi inspect Network tab
// ─────────────────────────────────────────────────────────────
const PLATFORM = "onvoyage";
const BASE_URL  = "https://onvoyage-backend-954067898723.us-central1.run.app";

// ★ Endpoint check-in — xem tab "Headers" → Request URL
// Các pattern hay gặp:
//   /api/user/checkin   /api/checkin   /api/daily-checkin
//   /api/v1/checkin     /api/tasks/checkin  /api/rewards/checkin
const CHECKIN_ENDPOINT = `${BASE_URL}/api/v1/task/checkin`;

// ★ Body — xem tab "Payload". {} nếu trống, null nếu không có body
const CHECKIN_BODY = {};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/** Parse JSON an toàn — không bao giờ throw */
async function safeJson(res) {
  const text = await res.text().catch(() => "");
  if (!text.trim()) return {};
  try { return JSON.parse(text); }
  catch { return { _raw: text.slice(0, 500) }; }
}

/** In debug ngắn gọn */
function dbg(label, status, data) {
  const preview = JSON.stringify(data).slice(0, 280);
  log(PLATFORM, `[${label}] HTTP ${status} → ${preview}`, "info");
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
export async function run() {
  log(PLATFORM, "══════════════════════════════════════════");
  log(PLATFORM, "Bắt đầu check-in...");

  // ── BƯỚC 1: Đọc cookie ──────────────────────────────────
  let cookie;
  try {
    cookie = getCookie(PLATFORM);
    log(PLATFORM, `Cookie OK (${cookie.length} chars)`);
  } catch (err) {
    log(PLATFORM, err.message, "error");
    log(PLATFORM, '→ Thêm dòng  onvoyage=<cookie>  vào cookies.txt', "warn");
    return { success: false, platform: PLATFORM, reason: "no_cookie" };
  }

  // ── BƯỚC 2: Xây headers ─────────────────────────────────
  // Copy sát headers thật từ DevTools → tab Headers → Request Headers
  const headers = {
    // ── Chuẩn fetch ──
    "accept"             : "application/json, text/plain, */*",
    "accept-language"    : "en-US,en;q=0.9,vi;q=0.8",
    "content-type"       : "application/json",
    // ── Auth ──
    "cookie"             : cookie,
    // ── Navigation context (nhiều site reject nếu thiếu) ──
    "origin"             : BASE_URL,
    "referer"            : `${BASE_URL}/dashboard`,
    // ── Browser fingerprint ──
    "user-agent"         : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "sec-ch-ua"          : '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "sec-ch-ua-mobile"   : "?0",
    "sec-ch-ua-platform" : '"Windows"',
    "sec-fetch-dest"     : "empty",
    "sec-fetch-mode"     : "cors",
    "sec-fetch-site"     : "same-origin",
    // ── TODO: nếu DevTools thấy các header bổ sung, thêm ở đây ──
    // "x-csrf-token"    : extractFromCookie(cookie, "csrftoken"),
    // "x-api-key"       : "...",
    // "authorization"   : `Bearer ${extractFromCookie(cookie, "access_token")}`,
  };

  // ── BƯỚC 3: Kiểm tra đã check-in hôm nay chưa ──────────
  log(PLATFORM, "Bước 1/2 — Kiểm tra trạng thái...");
  const statusPaths = [
    "/api/user/checkin/status",
    "/api/checkin/status",
    "/api/user/me",
    "/api/user/profile",
    "/api/dashboard",
  ];

  for (const path of statusPaths) {
    try {
      const r = await fetch(`${BASE_URL}${path}`, {
        method : "GET",
        headers,
        signal : AbortSignal.timeout(7000),
      });

      if (!r.ok) continue; // path không tồn tại, thử tiếp

      const d = await safeJson(r);
      dbg("status", r.status, d);

      // Kiểm tra các field "đã check-in hôm nay"
      const done =
        d?.data?.checked_in    === true ||
        d?.data?.checkedIn     === true ||
        d?.data?.daily_checkin === true ||
        d?.checked_in          === true ||
        d?.checkedIn           === true ||
        d?.today_checked       === true ||
        d?.isCheckedIn         === true;

      if (done) {
        logResult(PLATFORM, true, "Đã check-in hôm nay rồi — bỏ qua.");
        return { success: true, platform: PLATFORM, reason: "already_checked_in" };
      }

      log(PLATFORM, `Status path OK: ${path} — chưa check-in hôm nay.`);
      break;
    } catch {
      // timeout hoặc network error trên path này → thử path tiếp
    }
  }

  // ── BƯỚC 4: Gọi check-in ────────────────────────────────
  log(PLATFORM, `Bước 2/2 — POST ${CHECKIN_ENDPOINT}`);

  let res;
  try {
    res = await fetch(CHECKIN_ENDPOINT, {
      method : "POST",
      headers,
      body   : CHECKIN_BODY !== null ? JSON.stringify(CHECKIN_BODY) : undefined,
      signal : AbortSignal.timeout(15000),
    });
  } catch (err) {
    const reason = err.name === "TimeoutError"
      ? "Timeout >15s — server không phản hồi"
      : `Network error: ${err.message}`;
    log(PLATFORM, reason, "error");
    return { success: false, platform: PLATFORM, reason };
  }

  const data = await safeJson(res);
  dbg("checkin", res.status, data);

  // ── BƯỚC 5: Xử lý response ──────────────────────────────
  if (res.status === 401) {
    logResult(PLATFORM, false, "Cookie hết hạn (401) — cần lấy cookie mới.");
    return { success: false, platform: PLATFORM, reason: "unauthorized" };
  }

  if (res.status === 403) {
    logResult(PLATFORM, false, "Bị block (403) — kiểm tra CSRF token / IP.");
    return { success: false, platform: PLATFORM, reason: "forbidden" };
  }

  if (res.status === 429) {
    const retryAfter = res.headers.get("retry-after") || "?";
    logResult(PLATFORM, false, `Rate limit (429) — thử lại sau ${retryAfter}s.`);
    return { success: false, platform: PLATFORM, reason: "rate_limited" };
  }

  if (res.ok) {
    // Lấy message từ các field phổ biến
    const msg =
      data?.message        ||
      data?.msg            ||
      data?.data?.message  ||
      data?.data?.msg      ||
      data?.result         ||
      "OK";

    // Một số site trả HTTP 200 nhưng body báo "already checked in"
    const alreadyKeywords = ["already", "checked", "duplicate", "today", "done"];
    if (alreadyKeywords.some(kw => String(msg).toLowerCase().includes(kw))) {
      logResult(PLATFORM, true, `Đã check-in rồi: "${msg}"`);
      return { success: true, platform: PLATFORM, reason: "already_checked_in", data };
    }

    // Lấy điểm/reward nếu có
    const points =
      data?.data?.points  ||
      data?.data?.reward  ||
      data?.data?.tokens  ||
      data?.points        ||
      data?.reward        ||
      null;

    const detail = points !== null ? `${msg} | +${points} điểm/token` : msg;
    logResult(PLATFORM, true, detail);
    return { success: true, platform: PLATFORM, data };
  }

  // Các HTTP error khác (4xx / 5xx)
  const reason =
    data?.message ||
    data?.error   ||
    data?.msg     ||
    data?._raw    ||
    `HTTP ${res.status}`;
  logResult(PLATFORM, false, String(reason).slice(0, 200));
  return { success: false, platform: PLATFORM, reason, statusCode: res.status };
}

// ═══════════════════════════════════════════════════════════════
//  HƯỚNG DẪN ĐẦY ĐỦ
// ═══════════════════════════════════════════════════════════════
//
//  ① LẤY ENDPOINT CHÍNH XÁC
//  ─────────────────────────
//  1. Mở Chrome, vào https://app.onvoyage.ai/dashboard (đã đăng nhập)
//  2. F12 → tab "Network" → chọn filter "Fetch/XHR"
//  3. Bấm nút "DAILY CHECK IN"
//  4. Quan sát request mới xuất hiện → click vào
//  5. Tab "Headers":
//       • Request URL    → cập nhật CHECKIN_ENDPOINT ở trên
//       • Request Method → thường POST, đổi nếu khác
//       • Xem có header bổ sung không (x-csrf-token, authorization...)
//         → uncomment và thêm vào object headers ở Bước 2
//  6. Tab "Payload":
//       • Copy nội dung → cập nhật CHECKIN_BODY
//       • Nếu trống     → CHECKIN_BODY = null
//  7. Tab "Preview" / "Response":
//       • Xem structure khi thành công
//       • Nếu field message/points tên khác → sửa phần "Lấy điểm" Bước 5
//
//  ② LẤY COOKIE
//  ─────────────
//  Cách 1 (đơn giản nhất):
//    F12 → Console → gõ: document.cookie
//    Copy kết quả → paste vào cookies.txt
//
//  Cách 2 (đầy đủ hơn, gồm cả HttpOnly cookie):
//    F12 → Network → click bất kỳ request nào → tab "Headers"
//    → Request Headers → tìm dòng "cookie:" → copy giá trị
//
//  Cách 3 (dùng EditThisCookie extension):
//    Cài extension → vào trang → export → copy string
//
//  Format trong cookies.txt (1 dòng, không xuống hàng):
//  onvoyage=_ga=GA1.1.xxx; session=eyJ...; cf_clearance=abc...; __token=xyz
//
//  ③ CHẠY
//  ───────
//  node index.js onvoyage
//
//  ④ XEM DEBUG
//  ────────────
//  Output sẽ in ra HTTP status và response body đầy đủ.
//  Nếu thấy lỗi 404 → endpoint sai, xem lại bước ①
//  Nếu thấy lỗi 401 → cookie sai hoặc hết hạn
//  Nếu thấy lỗi 403 → thiếu CSRF token hoặc header đặc biệt
// ═══════════════════════════════════════════════════════════════
