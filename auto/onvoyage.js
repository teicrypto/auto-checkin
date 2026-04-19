// auto/onvoyage.js
// Platform  : app.onvoyage.ai — GEO Dashboard
// Endpoint  : POST https://onvoyage-backend-954067898723.us-central1.run.app/api/v1/task/checkin
// Auth      : Bearer JWT token (auto-detect)
// Body      : RỖNG (Content-Length: 0)
// Features  : ✅ Daily check-in + ⚡ Phát hiện task chưa làm
// Confirmed : 19/04/2026

import { getAuth } from "../utils/loadCookies.js";
import { log, logResult } from "../utils/logger.js";

const PLATFORM     = "onvoyage";
const FRONTEND_URL = "https://app.onvoyage.ai";
const BACKEND_URL  = "https://onvoyage-backend-954067898723.us-central1.run.app";

const ENDPOINT_CHECKIN = `${BACKEND_URL}/api/v1/task/checkin`;

// TODO ★ Xác nhận endpoint task list:
//   DevTools → reload dashboard → tìm GET request trả về array tasks[]
const TASK_LIST_PATHS = [
  "/api/v1/task/list",
  "/api/v1/tasks",
  "/api/v1/task",
  "/api/tasks",
  "/api/v1/user/tasks",
  "/api/v1/missions",
];

// ─────────────────────────────────────────────────────────────
async function safeJson(res) {
  const text = await res.text().catch(() => "");
  if (!text.trim()) return {};
  try { return JSON.parse(text); }
  catch { return { _raw: text.slice(0, 500) }; }
}

// ─────────────────────────────────────────────────────────────
async function checkTasks(headers) {
  log(PLATFORM, "── Kiểm tra danh sách task...");

  for (const path of TASK_LIST_PATHS) {
    let res;
    try {
      res = await fetch(`${BACKEND_URL}${path}`, {
        method : "GET",
        headers,
        signal : AbortSignal.timeout(8000),
      });
    } catch { continue; }

    if (!res.ok) continue;

    const data = await safeJson(res);
    const tasks =
      data?.data?.tasks || data?.data?.list || data?.data ||
      data?.tasks       || data?.list       || data?.result || null;

    if (!Array.isArray(tasks)) continue;

    log(PLATFORM, `Task endpoint OK: ${path} — ${tasks.length} task(s)`);

    const pending = tasks.filter(t => {
      const done =
        t?.completed === true || t?.done === true ||
        t?.finished  === true || t?.is_completed === true ||
        t?.status === "completed" || t?.status === "done" || t?.status === 1;
      return !done;
    });

    if (pending.length === 0) {
      log(PLATFORM, "✅ Tất cả task đã hoàn thành!", "success");
      return [];
    }

    log(PLATFORM, `⚡ ${pending.length} task chưa hoàn thành:`, "warn");
    return pending.map(t => {
      const name   = t?.name || t?.title || t?.task_name || t?.description || t?.type || "Unknown";
      const reward = t?.reward || t?.points || t?.tokens || null;
      const str    = reward !== null ? `"${name}" (reward: ${reward})` : `"${name}"`;
      log(PLATFORM, `   ⚡ TASK CHƯA LÀM: ${str}`, "warn");
      return { name, reward, raw: t };
    });
  }

  log(PLATFORM, "Không tìm thấy task list endpoint — bỏ qua.", "warn");
  return null;
}

// ─────────────────────────────────────────────────────────────
export async function run() {
  log(PLATFORM, "══════════════════════════════════════════");
  log(PLATFORM, "Bắt đầu check-in + kiểm tra task...");

  // ── 1. Auth ─────────────────────────────────────────────
  let auth;
  try {
    auth = getAuth(PLATFORM);
    log(PLATFORM, `Auth type: ${auth.type} (${auth.value.length} chars)`);
  } catch (err) {
    log(PLATFORM, err.message, "error");
    return { success: false, platform: PLATFORM, reason: "no_auth" };
  }

  // ── 2. Headers ──────────────────────────────────────────
  const headers = {
    ...auth.headers,                   // authorization: Bearer ... (auto)
    "accept"             : "application/json, text/plain, */*",
    "accept-encoding"    : "gzip, deflate, br, zstd",
    "accept-language"    : "en-US,en;q=0.9,vi-VN;q=0.8,vi;q=0.7",
    "content-length"     : "0",
    "origin"             : FRONTEND_URL,
    "referer"            : `${FRONTEND_URL}/`,
    "priority"           : "u=1, i",
    "user-agent"         : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
    "sec-ch-ua"          : '"Google Chrome";v="147", "Not.A/Brand";v="8", "Chromium";v="147"',
    "sec-ch-ua-mobile"   : "?0",
    "sec-ch-ua-platform" : '"Windows"',
    "sec-fetch-dest"     : "empty",
    "sec-fetch-mode"     : "cors",
    "sec-fetch-site"     : "cross-site",
  };

  // ── 3. Check-in ─────────────────────────────────────────
  log(PLATFORM, `Bước 1/2 — POST ${ENDPOINT_CHECKIN}`);
  let res;
  try {
    res = await fetch(ENDPOINT_CHECKIN, {
      method : "POST",
      headers,
      body   : null,
      signal : AbortSignal.timeout(15000),
    });
  } catch (err) {
    const reason = err.name === "TimeoutError" ? "Timeout >15s" : `Network: ${err.message}`;
    log(PLATFORM, reason, "error");
    return { success: false, platform: PLATFORM, reason };
  }

  const data = await safeJson(res);
  log(PLATFORM, `[DEBUG] checkin HTTP ${res.status} → ${JSON.stringify(data).slice(0, 250)}`);

  // ── 4. Xử lý kết quả check-in ───────────────────────────
  let checkinSuccess = false;

  if (res.status === 401) {
    logResult(PLATFORM, false, "Token hết hạn (401) — lấy token mới từ DevTools.");
    return { success: false, platform: PLATFORM, reason: "unauthorized" };
  }
  if (res.status === 403) {
    logResult(PLATFORM, false, "Bị block (403).");
    return { success: false, platform: PLATFORM, reason: "forbidden" };
  }
  if (res.status === 429) {
    logResult(PLATFORM, false, `Rate limit (429) — thử lại sau ${res.headers.get("retry-after") || "?"}s.`);
    return { success: false, platform: PLATFORM, reason: "rate_limited" };
  }
  if (res.ok) {
    const msg = data?.message || data?.msg || data?.data?.message || data?.result || "OK";
    const alreadyDone = ["already","checked","duplicate","today","done","exists"]
      .some(kw => String(msg).toLowerCase().includes(kw));
    const points = data?.data?.points || data?.data?.reward || data?.points || data?.reward || null;
    logResult(PLATFORM, true, alreadyDone
      ? `Đã check-in rồi: "${msg}"`
      : (points !== null ? `${msg} | +${points}` : msg)
    );
    checkinSuccess = true;
  } else {
    logResult(PLATFORM, false, String(data?.message || data?.error || `HTTP ${res.status}`).slice(0, 200));
    return { success: false, platform: PLATFORM, reason: data?.message || `HTTP ${res.status}` };
  }

  // ── 5. Kiểm tra task ────────────────────────────────────
  log(PLATFORM, "Bước 2/2 — Kiểm tra task...");
  const newTasks = await checkTasks(headers);

  // ── 6. Tổng kết ─────────────────────────────────────────
  log(PLATFORM, "══════════════════════════════════════════");
  if (newTasks === null)        log(PLATFORM, "Tổng kết: ✅ Check-in OK | ⚠️  Không check được task");
  else if (newTasks.length === 0) log(PLATFORM, "Tổng kết: ✅ Check-in OK | ✅ Không có task mới", "success");
  else                          log(PLATFORM, `Tổng kết: ✅ Check-in OK | ⚡ ${newTasks.length} TASK CHƯA LÀM!`, "warn");

  return { success: checkinSuccess, platform: PLATFORM, newTasks: newTasks ?? [], data };
}

// ═══════════════════════════════════════════════════════════════
//  SETUP cookies.txt
//  onvoyage=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx
//
//  Lấy token: DevTools → request checkin → Headers → Authorization
//  → copy phần sau "Bearer " (bắt đầu từ eyJ...)
//  Token hết hạn → lỗi 401 → lấy lại token
// ═══════════════════════════════════════════════════════════════
