// ============================================================
// auto/cedomis.js — Auto Check-in cho cedomis.xyz
// Dùng Next.js Server Action (không phải REST API)
// Auth: cookie auth-token=eyJ...
// ============================================================

import { getAuth }        from "../utils/loadCookies.js";
import { log, logResult } from "../utils/logger.js";

// ── CONFIG ──────────────────────────────────────────────────
const PLATFORM = "cedomis";
const BASE_URL  = "https://cedomis.xyz";

// Next-Action hash — lấy từ DevTools → Request Headers → Next-Action
const CHECKIN_ACTION = "609a85ff31b8a14390bfc4c69d4e03f130ebabea41";

// Next-Router-State-Tree — lấy từ DevTools (đã encode URL)
const ROUTER_STATE   = "%5B%22%22%2C%7B%22children%22%3A%5B%22dashboard%22%2C%7B%22children%22%3A%5B%22__PAGE__%22%2C%7B%7D%2C%22%2Fdashboard%22%2C%22refresh%22%5D%7D%5D%7D%5D";

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
async function doCheckin(authToken) {
  // Body của Server Action: array JSON với URL + options
  const body = JSON.stringify([
    `${BASE_URL}/api/v1/user/daily-login/claim`,
    { auth: true, method: "POST" }
  ]);

  const res = await fetch(`${BASE_URL}/dashboard`, {
    method  : "POST",
    headers : {
      "accept"               : "text/x-component",
      "content-type"         : "text/plain;charset=UTF-8",
      "cookie"               : `auth-token=${authToken}`,
      "next-action"          : CHECKIN_ACTION,
      "next-router-state-tree": ROUTER_STATE,
      "origin"               : BASE_URL,
      "referer"              : `${BASE_URL}/dashboard`,
      "user-agent"           : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
    },
    body,
  });

  const text = await res.text();

  if (res.status === 401 || res.status === 403) {
    log(PLATFORM, "❌ Token hết hạn hoặc không hợp lệ (401/403)", "error");
    return { success: false, reason: "auth_expired" };
  }

  if (res.status === 429) {
    log(PLATFORM, "⏳ Rate limited (429) — thử lại sau", "warn");
    return { success: false, reason: "rate_limited" };
  }

  // Next.js trả về dạng: 1:["$","div",null,{...}]
  // Tìm JSON data trong response text
  let data = null;
  try {
    // Tìm object JSON lồng trong RSC response
    const match = text.match(/\{[^{}]*"(?:message|success|error|reward|points|nextClaimAt|already)[^{}]*\}/);
    if (match) data = JSON.parse(match[0]);
  } catch { /* ignore */ }

  // Log raw nếu không parse được để debug
  if (!data) {
    log(PLATFORM, `📦 Raw response (200 chars): ${text.slice(0, 200)}`, "info");
  }

  // Đã claim rồi
  if (
    text.includes("already") ||
    text.includes("Already") ||
    data?.already ||
    data?.message?.toLowerCase().includes("already")
  ) {
    const nextTime =
      data?.nextClaimAt    ??
      data?.next_claim_at  ??
      data?.nextLoginTime  ??
      null;

    if (nextTime) {
      log(PLATFORM, `⏳ Đã check-in rồi. Claim lại sau: ${timeUntil(nextTime)}`, "warn");
    } else {
      log(PLATFORM, "⏳ Đã check-in rồi. Chờ ~24h.", "warn");
    }
    return { success: false, reason: "already_claimed", data };
  }

  if (res.ok) {
    const reward = data?.reward ?? data?.points ?? data?.tokens ?? "";
    log(PLATFORM, `✅ Check-in thành công${reward ? ` — Nhận: ${reward}` : ""}`, "success");
    return { success: true, data };
  }

  log(PLATFORM, `⚠️ Response ${res.status}: ${text.slice(0, 200)}`, "warn");
  return { success: false, reason: "unknown" };
}

// ── MAIN ─────────────────────────────────────────────────────
export async function run() {
  try {
    const auth = getAuth(PLATFORM);
    log(PLATFORM, "🚀 Bắt đầu check-in cedomis.xyz ...", "info");

    // auth.value = giá trị cookie auth-token
    const authToken = auth.value ?? auth.token ?? auth.cookie ?? auth;

    const result = await doCheckin(authToken);
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
  }
}

// ============================================================
// SETUP — cookies.txt
// ============================================================
//
// Thêm vào cookies.txt:
//   cedomis=eyJhbGci...
//
// Cách lấy auth-token:
//   1. Vào https://cedomis.xyz/dashboard (đã login)
//   2. F12 → Application → Cookies → cedomis.xyz
//   3. Tìm "auth-token" → copy Value
//   4. Dán: cedomis=<value đó>
//
// Lưu ý:
//   - File này KHÔNG dùng Playwright (không cần browser)
//   - Gọi thẳng HTTP từ Node.js → nhanh hơn, ổn định hơn
//   - Nếu CHECKIN_ACTION thay đổi, lấy lại từ DevTools →
//     Network → click request POST /dashboard → Request Headers → Next-Action
//
// Chạy:
//   node index.js cedomis
// ============================================================
