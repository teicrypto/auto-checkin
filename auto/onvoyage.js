// auto/onvoyage.js
// Platform  : app.onvoyage.ai — GEO Dashboard
// Auth      : Bearer JWT (auto-detect từ cookies.txt)
// Engine    : Playwright + full stealth (Chrome thật, không headless detection)
// Features  : ✅ Check-in + ⚡ Task check + 🛡️ Anti-detection tối đa
// Confirmed : 19/04/2026

import { getAuth } from "../utils/loadCookies.js";
import { log, logResult } from "../utils/logger.js";
import {
  createContext, createPage,
  humanClick, humanDelay,
  closeBrowser,
} from "../utils/browser.js";

// ─────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────
const PLATFORM     = "onvoyage";
const FRONTEND_URL = "https://app.onvoyage.ai";
const BACKEND_URL  = "https://onvoyage-backend-954067898723.us-central1.run.app";

// Endpoint xác nhận từ DevTools
const ENDPOINT_CHECKIN = `${BACKEND_URL}/api/v1/task/checkin`;

// Task list paths để thử
const TASK_LIST_PATHS = [
  "/api/v1/task/list",
  "/api/v1/tasks",
  "/api/v1/task",
  "/api/tasks",
  "/api/v1/user/tasks",
  "/api/v1/missions",
];

// ─────────────────────────────────────────────────────────────
// HELPER — parse JSON an toàn
// ─────────────────────────────────────────────────────────────
function safeParseJson(text) {
  if (!text || !text.trim()) return {};
  try { return JSON.parse(text); }
  catch { return { _raw: String(text).slice(0, 500) }; }
}

// ─────────────────────────────────────────────────────────────
// HELPER — gọi API qua browser context (TLS/HTTP2 hoàn toàn như Chrome)
// Dùng page.evaluate() để fetch từ BÊN TRONG browser
// → headers, TLS, HTTP/2 đều do Chrome thật xử lý
// ─────────────────────────────────────────────────────────────
async function browserFetch(page, url, options = {}) {
  const result = await page.evaluate(async ({ url, options }) => {
    try {
      const res = await fetch(url, options);
      const text = await res.text();
      return {
        status  : res.status,
        ok      : res.ok,
        text,
        headers : Object.fromEntries(res.headers.entries()),
      };
    } catch (err) {
      return { error: err.message };
    }
  }, { url, options });

  if (result.error) throw new Error(result.error);

  return {
    status  : result.status,
    ok      : result.ok,
    headers : result.headers,
    json    : () => safeParseJson(result.text),
    text    : () => result.text,
  };
}

// ─────────────────────────────────────────────────────────────
// INJECT TOKEN vào browser context
// Đặt Authorization header mặc định cho mọi request từ trang
// ─────────────────────────────────────────────────────────────
async function injectAuth(page, token) {
  // Cách 1: Inject vào localStorage/sessionStorage nếu site dùng
  await page.evaluate((t) => {
    try { localStorage.setItem("token", t); } catch {}
    try { localStorage.setItem("access_token", t); } catch {}
    try { sessionStorage.setItem("token", t); } catch {}
  }, token);

  // Cách 2: Route intercept — tự động thêm Authorization header
  // vào MỌI request đến backend
  await page.route(`${BACKEND_URL}/**`, async (route) => {
    const headers = {
      ...route.request().headers(),
      "authorization": `Bearer ${token}`,
    };
    await route.continue({ headers });
  });
}

// ─────────────────────────────────────────────────────────────
// CHECK TASKS
// ─────────────────────────────────────────────────────────────
async function checkTasks(page, token) {
  log(PLATFORM, "── Kiểm tra danh sách task...");
  await humanDelay(600, 1500);

  for (const path of TASK_LIST_PATHS) {
    try {
      const res = await browserFetch(page, `${BACKEND_URL}${path}`, {
        method  : "GET",
        headers : {
          "authorization": `Bearer ${token}`,
          "accept"        : "application/json, text/plain, */*",
        },
      });

      if (!res.ok) continue;

      const data  = res.json();
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
        const name   = t?.name || t?.title || t?.task_name || t?.description || "Unknown";
        const reward = t?.reward || t?.points || t?.tokens || null;
        log(PLATFORM, `   ⚡ TASK CHƯA LÀM: "${name}"${reward !== null ? ` (reward: ${reward})` : ""}`, "warn");
        return { name, reward, raw: t };
      });
    } catch { continue; }
  }

  log(PLATFORM, "Không tìm thấy task endpoint — bỏ qua.", "warn");
  return null;
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────
export async function run() {
  log(PLATFORM, "══════════════════════════════════════════");
  log(PLATFORM, "Bắt đầu check-in (Playwright stealth mode)...");

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

  const token = auth.value; // JWT token đã được strip "Bearer " prefix

  let context, page;
  try {
    // ── 2. Tạo browser context ───────────────────────────
    log(PLATFORM, "Khởi động browser...");
    context = await createContext();
    page    = await createPage(context);

    // ── 3. Inject auth ───────────────────────────────────
    await injectAuth(page, token);

    // ── 4. Load trang dashboard — giả lập user mở trang ─
    log(PLATFORM, `Load ${FRONTEND_URL}/dashboard...`);
    try {
      await page.goto(`${FRONTEND_URL}/dashboard`, {
        waitUntil : "domcontentloaded", // không cần chờ full load
        timeout   : 20000,
      });
      log(PLATFORM, "Trang đã load — giả lập user đọc trang...");
      // Giả lập scroll nhẹ
      await page.mouse.wheel(0, Math.floor(Math.random() * 300) + 100);
      await humanDelay(1500, 3500);
    } catch {
      // Nếu trang yêu cầu login redirect thì vẫn tiếp tục gọi API
      log(PLATFORM, "Dashboard load không hoàn toàn — tiếp tục gọi API.", "warn");
      await humanDelay(800, 1500);
    }

    // ── 5. Gọi check-in từ BÊN TRONG browser ────────────
    log(PLATFORM, `Bước 1/2 — POST ${ENDPOINT_CHECKIN}`);

    // Giả lập user di chuyển chuột trước khi click
    await page.mouse.move(
      Math.floor(Math.random() * 400) + 200,
      Math.floor(Math.random() * 300) + 150,
    );
    await humanDelay(200, 600);

    const res = await browserFetch(page, ENDPOINT_CHECKIN, {
      method  : "POST",
      headers : {
        "authorization"  : `Bearer ${token}`,
        "accept"         : "application/json, text/plain, */*",
        "content-length" : "0",
        "origin"         : FRONTEND_URL,
        "referer"        : `${FRONTEND_URL}/`,
      },
      body: null,
    });

    const data = res.json();
    log(PLATFORM, `[DEBUG] HTTP ${res.status} → ${JSON.stringify(data).slice(0, 300)}`);

    // ── 6. Xử lý response ──────────────────────────────
    if (res.status === 401) {
      logResult(PLATFORM, false, "Token hết hạn (401) — lấy token mới từ DevTools.");
      return { success: false, platform: PLATFORM, reason: "unauthorized" };
    }
    if (res.status === 403) {
      logResult(PLATFORM, false, "Bị block (403).");
      return { success: false, platform: PLATFORM, reason: "forbidden" };
    }
    if (res.status === 429) {
      const after = data?.retryAfter || "?";
      logResult(PLATFORM, false, `Rate limit (429) — thử lại sau ${after}s.`);
      return { success: false, platform: PLATFORM, reason: "rate_limited" };
    }
    if (!res.ok) {
      logResult(PLATFORM, false, String(data?.message || `HTTP ${res.status}`).slice(0, 200));
      return { success: false, platform: PLATFORM, reason: data?.message || `HTTP ${res.status}` };
    }

    const msg = data?.message || data?.msg || data?.data?.message || data?.result || "OK";
    const alreadyDone = ["already","checked","duplicate","today","done","exists"]
      .some(kw => String(msg).toLowerCase().includes(kw));
    const points = data?.data?.points || data?.data?.reward || data?.points || null;
    logResult(PLATFORM, true, alreadyDone
      ? `Đã check-in rồi: "${msg}"`
      : (points !== null ? `${msg} | +${points}` : msg)
    );

    // ── 7. Task check ────────────────────────────────────
    log(PLATFORM, "Bước 2/2 — Kiểm tra task...");
    const newTasks = await checkTasks(page, token);

    // ── 8. Tổng kết ──────────────────────────────────────
    log(PLATFORM, "══════════════════════════════════════════");
    if (newTasks === null)
      log(PLATFORM, "Tổng kết: ✅ Check-in OK | ⚠️  Không check được task");
    else if (newTasks.length === 0)
      log(PLATFORM, "Tổng kết: ✅ Check-in OK | ✅ Không có task mới", "success");
    else
      log(PLATFORM, `Tổng kết: ✅ Check-in OK | ⚡ ${newTasks.length} TASK CHƯA LÀM!`, "warn");

    return { success: true, platform: PLATFORM, newTasks: newTasks ?? [], data };

  } catch (err) {
    log(PLATFORM, `Lỗi không xử lý được: ${err.message}`, "error");
    return { success: false, platform: PLATFORM, reason: err.message };
  } finally {
    // ── Cleanup — đóng context (không đóng browser để kèo tiếp dùng lại) ──
    if (context) await context.close().catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════
//  SETUP cookies.txt
//  onvoyage=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx
//
//  Lấy token: DevTools → request checkin → Headers
//  → Authorization → copy sau "Bearer "
//  Token hết hạn → lỗi 401 → lấy lại
// ═══════════════════════════════════════════════════════════════
