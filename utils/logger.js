// utils/logger.js
// Simple logger with timestamps và emoji

export function log(platform, msg, type = "info") {
  const time = new Date().toLocaleTimeString("vi-VN");
  const icons = { info: "ℹ️", success: "✅", error: "❌", warn: "⚠️" };
  const icon = icons[type] || "•";
  console.log(`[${time}] ${icon} [${platform.toUpperCase()}] ${msg}`);
}

export function logResult(platform, success, detail = "") {
  if (success) {
    log(platform, `Check-in thành công! ${detail}`, "success");
  } else {
    log(platform, `Check-in thất bại. ${detail}`, "error");
  }
}
