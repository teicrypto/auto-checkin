// ============================================================
// auto/cedomis.js — Auto Check-in cho cedomis.xyz
// Dùng Playwright thật + intercept Next.js Server Action
// Auth: cookie auth-token=eyJ...
// ============================================================

import { getAuth }                               from "../utils/loadCookies.js";
import { log, logResult }                        from "../utils/logger.js";
import { createContext, createPage, humanDelay } from "../utils/browser.js";

// ── CONFIG ──────────────────────────────────────────────────
const PLATFORM = "cedomis";
const BASE_URL  = "https://cedomis.xyz";

// Next-Action hash — nếu thay đổi, lấy lại từ:
// DevTools → Network → POST /dashboard → Request Headers → Next-Action
const CHECKIN_ACTION = "609a85ff31b8a14390bfc4c69d4e03f130ebabea41";

// ── HELPERS ─────────────────────────────────────────────────
function timeUntil(nextTime) {
  const ms   = typeof nextTime === "number" ? nextTime : new Date(nextTime).getTime();
  const diff = ms - Date.now();
  if (diff <= 0) return "0h 0m";
  const hours   = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m`;
}

// ── CHECK-IN ─────────────────────────────────────────────────
async function doCheckin(page, authToken) {
  await humanDelay(300, 800);

  // Intercept đúng request Server Action check-in
  // Browser tự gửi — đúng TLS fingerprint, đúng Cloudflare cookie
  const responseData = await new Promise(async (resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Checkin timeout 15s")), 15_000);

    // Lắng nghe response từ Server Action
    page.once("response", async (response) => {
      if (
        response.url().includes("/dashboard") &&
        response.request().method() === "POST" &&
        response.request().headers()["next-action"] === CHECKIN_ACTION
      ) {
        clearTimeout(timeout);
        try {
          const text = await response.text();
          resolve({ status: response.status(), text });
        } catch (err) {
          reject(err);
        }
      }
    });

    // Trigger Server Action bằng cách inject script vào page
    await page.evaluate(async ({ baseUrl, action }) => {
      await fetch(`${baseUrl}/dashboard`, {
        method  : "POST",
        headers : {
          "accept"               : "text/x-component",
          "content-type"         : "text/plain;charset=UTF-8",
          "next-action"          : action,
          "next-router-state-tree": encodeURIComponent(JSON.stringify(["","",{"children":["dashboard",{"children":["__PAGE__",{}]}]}])),
        },
        body: JSON.stringify([
          `${baseUrl}/api/v1/user/daily-login/claim`,
          { auth: true, method: "POST" }
        ]),
      });
    }, { baseUrl: BASE_URL, action: CHECKIN_ACTION });
  });

  const { status, text } = responseData;

  if (status === 401 || status === 403) {
    log(PLATFORM, "❌ Token hết hạn (401/403)", "error");
    return { success: false, reason: "auth_expired" };
  }

  if (status === 429) {
    log(PLATFORM, "⏳ Rate limited (429)", "warn");
    return { success: false, reason: "rate_limited" };
  }

  // Parse JSON data từ RSC response
  let data = null;
  try {
    const match = text.match(/\{[^{}]*"(?:message|success|error|reward|points|nextClaimAt|already)[^{}]*\}/);
    if (match) data = JSON.parse(match[0]);
  } catch { /* ignore */ }

  if (!data) {
    log(PLATFORM, `📦 Raw (200 chars): ${text.slice(0, 200)}`, "info");
  }

  // Đã claim rồi
  if (
    text.toLowerCase().includes("already") ||
    data?.already ||
    data?.message?.toLowerCase().includes("already")
  ) {
    const nextTime =
      data?.nextClaimAt   ??
      data?.next_claim_at ??
      data?.nextLoginTime ??
      null;

    if (nextTime) {
      log(PLATFORM, `⏳ Đã check-in rồi. Claim lại sau: ${timeUntil(nextTime)}`, "warn");
    } else {
      log(PLATFORM, "⏳ Đã check-in rồi. Chờ ~24h.", "warn");
    }
    return { success: false, reason: "already_claimed", data };
  }

  if (status >= 200 && status < 300) {
    const reward = data?.reward ?? data?.points ?? data?.tokens ?? "";
    log(PLATFORM, `✅ Check-in thành công${reward ? ` — Nhận: ${reward}` : ""}`, "success");
    return { success: true, data };
  }

  log(PLATFORM, `⚠️ Response ${status}: ${text.slice(0, 200)}`, "warn");
  return { success: false, reason: "unknown" };
}

// ── MAIN ─────────────────────────────────────────────────────
export async function run() {
  let context, page;
  try {
    const auth = getAuth(PLATFORM);
    log(PLATFORM, "🚀 Khởi động check-in cedomis.xyz ...", "info");

    context = await createContext();
    page    = await createPage(context);

    // Set cookie auth-token trước khi mở trang
    await context.addCookies([{
      name    : "auth-token",
      value   : auth.value,
      domain  : "cedomis.xyz",
      path    : "/",
      httpOnly: true,
      secure  : true,
    }]);

    // Mở dashboard — browser thật với cookie thật → pass Cloudflare
    log(PLATFORM, "📄 Đang mở dashboard ...", "info");
    await page.goto(`${BASE_URL}/dashboard`, {
      waitUntil: "domcontentloaded",
      timeout  : 30_000,
    });

    // Scroll nhẹ cho tự nhiên
    await page.mouse.wheel(0, 150 + Math.random() * 100);
    await humanDelay(1500, 3000);

    // Check-in
    const result = await doCheckin(page, auth.value);
    logResult(PLATFORM, result.success, result.reason ?? result.data);

    return {
      success  : result.success,
      platform : PLATFORM,
      data     : result.data,
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
//   cedomis=eyJhbGci...
//
// Cách lấy:
//   F12 → Application → Cookies → cedomis.xyz → auth-token → copy Value
//
// Chạy:
//   node index.js cedomis
// ============================================================
