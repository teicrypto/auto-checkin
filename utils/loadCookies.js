// utils/loadCookies.js
// Đọc file cookies.txt và parse thành object
// Format trong cookies.txt:
//   onvoyage=abc123...
//   cedomis=xyz789...

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const COOKIE_FILE = resolve(__dirname, "../cookies.txt");

export function loadCookies() {
  if (!existsSync(COOKIE_FILE)) {
    throw new Error(
      `❌ Không tìm thấy file cookies.txt\n` +
      `   Tạo file tại: ${COOKIE_FILE}\n` +
      `   Xem hướng dẫn: README.md`
    );
  }

  const lines = readFileSync(COOKIE_FILE, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#")); // bỏ dòng trống và comment

  const cookies = {};
  for (const line of lines) {
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    cookies[key] = value;
  }

  return cookies;
}

export function getCookie(name) {
  const cookies = loadCookies();
  const key = name.toLowerCase();
  if (!cookies[key]) {
    throw new Error(
      `❌ Không tìm thấy cookie cho "${name}" trong cookies.txt\n` +
      `   Thêm dòng: ${key}=your_cookie_value`
    );
  }
  return cookies[key];
}
