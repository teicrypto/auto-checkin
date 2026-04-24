// ============================================================
// auto/cedomis.js — Auto Check-in cho cedomis.xyz
// API: api.cedomis.xyz (tách biệt với frontend cedomis.xyz)
// Auth: cookie auth-token=eyJ...
// ============================================================

import { getAuth }                              from "../utils/loadCookies.js";
import { log, logResult }                       from "../utils/logger.js";
import { createContext, createPage, humanDelay } from "../utils/browser.js";

// ── CONFIG ──────────────────────────────────────────────────
const PLATFORM     = "cedomis";
const FRONTEND_URL = "https://cedomis.xyz/dashboard";
const BACKEND_URL  = "https://api.cedomis.xyz";

const CHECKIN_PATH = "/api/v1/user/daily-login/claim";
const TASKS_PATH   = "/api/v1/user/tasks"; // TODO: xác nhận lại path từ DevTools

// ── HELPERS ─────────────────────────────────────────────────
async function browserFetch(page, url, options = {}) {
  const result = await page.evaluate(async ({ url, options }) => {
    try {
      const res  = await fetch(url, options);
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
    json    : () => { try { return JSON.parse(result.text); } catch { return { _raw: result.text?.slice(0, 500) }; } },
    text    : () => result.text,
  };
}

/** Tính thời gian còn lại đến nextTime (epoch ms hoặc ISO string) */
function timeUntil(nextTime) {
  const ms   = typeof nextTime === "number" ? nextTime : new Date(nextTime).getTime();
  const diff = ms - Date.now();
  if (diff <= 0) return "0h 0m";
  const hours   = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}

// ── CHECK-IN ─────────────────────────────────────────────────
async function doCheckin(page, authHeaders) {
  await humanDelay(200, 600);
  await page.mouse.move(600 + Math.random() * 200, 300 + Math.random() * 100);

  const res  = await browserFetch(page, `${BACKEND_URL}${CHECKIN_PATH}`, {
    method  : "POST",
    headers : {
      "content-type" : "application/json",
      ...authHeaders,
    },
    body: JSON.stringify({}),
  });

  const data = res.json();

  if (res.status === 401 || res.status === 403) {
    log(PLATFORM, "❌ Token hết hạn hoặc không hợp lệ (401/403)", "error");
    return { success: false, reason: "auth_expired" };
  }

  if (res.status === 429) {
    log(PLATFORM, "⏳ Rate limited (429) — thử lại sau", "warn");
    return { success: false, reason: "rate_limited" };
  }

  // Đã claim rồi → báo còn bao nhiêu giờ
  if (
    res.status === 400 ||
    data?.message?.toLowerCase().includes("already") ||
    data?.already
  ) {
    const nextTime =
      data?.nextClaimAt       ??
      data?.next_claim_at     ??
      data?.nextLoginTime     ??
      data?.data?.nextClaimAt ??
      null;

    if (nextTime) {
      const remain = timeUntil(nextTime);
      log(PLATFORM, `⏳ Đã check-in rồi. Claim lại sau: ${remain}`, "warn");
    } else {
      log(PLATFORM, `⏳ Đã check-in rồi. Chờ ~24h. (${JSON.stringify(data).slice(0, 120)})`, "warn");
    }
    return { success: false, reason: "already_claimed", data };
  }

  if (res.ok || res.status === 201) {
    const reward =
      data?.reward        ??
      data?.points        ??
      data?.tokens        ??
      data?.data?.reward  ??
      data?.data?.points  ??
      "";
    log(PLATFORM, `✅ Check-in thành công${reward ? ` — Nhận: ${reward}` : ""}`, "success");
    return { success: true, data };
  }

  log(PLATFORM, `⚠️ Response ${res.status}: ${JSON.stringify(data).slice(0, 200)}`, "warn");
  return { success: false, reason: "unknown", data };
}

// ── TASK / QUIZ LIST ─────────────────────────────────────────
async function checkTasks(page, authHeaders) {
  try {
    await humanDelay(800, 1500);

    const res = await browserFetch(page, `${BACKEND_URL}${TASKS_PATH}`, {
      method  : "GET",
      headers : { ...authHeaders },
    });

    if (!res.ok) {
      log(PLATFORM, `⚠️ Không lấy được task list (${res.status})`, "warn");
      return [];
    }

    const data  = res.json();
    const tasks = data?.tasks ?? data?.data?.tasks ?? data?.quizzes ?? data?.data ?? [];

    if (!Array.isArray(tasks)) {
      log(PLATFORM, "⚠️ Task list không phải array — kiểm tra TASKS_PATH", "warn");
      return [];
    }

    const newTasks = tasks.filter(t =>
      !t.completed && !t.is_completed &&
      t.status !== "done" && t.status !== "completed"
    );

    if (newTasks.length === 0) {
      log(PLATFORM, "ℹ️ Không có task/quiz mới", "info");
    } else {
      log(PLATFORM, `🎯 Có ${newTasks.length} task/quiz chưa làm:`, "info");
      newTasks.forEach((t, i) => {
        const name   = t.title ?? t.name ?? t.task_name ?? `Task #${i + 1}`;
        const reward = t.reward ?? t.points ?? "";
        log(PLATFORM, `   ${i + 1}. ${name}${reward ? ` (+${reward})` : ""}`, "info");
      });
    }

    return newTasks;
  } catch (err) {
    log(PLATFORM, `⚠️ checkTasks lỗi: ${err.message}`, "warn");
    return [];
  }
}

// ── MAIN ─────────────────────────────────────────────────────
export async function run() {
  let context, page;
  try {
    const auth = getAuth(PLATFORM);
    log(PLATFORM, "🚀 Khởi động check-in cedomis.xyz ...", "info");

    context = await createContext();
    page    = await createPage(context);

    // Inject auth vào mọi request đến api.cedomis.xyz
    await page.route("https://api.cedomis.xyz/**", async (route) => {
      await route.continue({
        headers: { ...route.request().headers(), ...auth.headers },
      });
    });

    // Warmup
    log(PLATFORM, "📄 Đang mở dashboard ...", "info");
    await page.goto(FRONTEND_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.mouse.wheel(0, 200 + Math.random() * 150);
    await humanDelay(1500, 3500);

    // Build auth headers cho browserFetch
    // cookies.txt: cedomis=eyJhbGci...  (value của cookie auth-token)
    const authHeaders = { cookie: `auth-token=${auth.value}` };

    // Check-in
    const checkinResult = await doCheckin(page, authHeaders);

    // Kiểm tra task/quiz mới
    const newTasks = await checkTasks(page, authHeaders);

    logResult(PLATFORM, checkinResult.success, checkinResult.reason ?? checkinResult.data);

    return {
      success  : checkinResult.success,
      platform : PLATFORM,
      newTasks,
      data     : checkinResult.data,
    };

  } catch (err) {
    log(PLATFORM, `💥 Lỗi: ${err.message}`, "error");
    logResult(PLATFORM, false, err.message);
    return { success: false, platform: PLATFORM, reason: err.message };

  } finally {
    if (context) await context.close().catch(() => {});
  }
}

// ============================================================
// SETUP — cookies.txt
// ============================================================
//
// Thêm dòng sau vào cookies.txt:
//
//   cedomis=eyJhbGci...
//
// Cách lấy auth-token:
//   1. Vào https://cedomis.xyz/dashboard (đã đăng nhập)
//   2. F12 → Application → Cookies → cedomis.xyz
//   3. Tìm cookie tên "auth-token" → copy giá trị (eyJhbGci...)
//   4. Dán vào cookies.txt: cedomis=eyJhbGci...
//
// Lấy TASKS_PATH đúng (nếu cần):
//   1. F12 → Network → Fetch/XHR → reload trang dashboard
//   2. Tìm GET request đến api.cedomis.xyz trả về danh sách tasks/quizzes
//   3. Copy :path → điền vào TASKS_PATH ở trên
//
// Chạy:
//   node index.js cedomis
// ============================================================
