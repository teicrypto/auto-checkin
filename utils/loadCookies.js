// utils/loadCookies.js
// Đọc file cookies.txt — hỗ trợ cả Bearer token lẫn Cookie string
//
// Format trong cookies.txt:
//   onvoyage=eyJhbGciOiJIUzI1NiIs...        ← Bearer JWT token
//   cedomis=_ga=xxx; session=yyy; token=zzz  ← Cookie string
//   galxe=Bearer eyJhbGciOiJIUzI1...         ← có thể để cả prefix Bearer
//
// Dòng bắt đầu bằng # là comment, bị bỏ qua

import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname  = dirname(fileURLToPath(import.meta.url));
const COOKIE_FILE = resolve(__dirname, "../cookies.txt");

// ─────────────────────────────────────────────────────────────
// Parse toàn bộ file → object { tên_kèo: "giá_trị" }
// ─────────────────────────────────────────────────────────────
export function loadAll() {
  if (!existsSync(COOKIE_FILE)) {
    throw new Error(
      `❌ Không tìm thấy file cookies.txt\n` +
      `   Tạo file tại: ${COOKIE_FILE}\n` +
      `   Xem cookies.example.txt để biết format`
    );
  }

  const result = {};
  const lines  = readFileSync(COOKIE_FILE, "utf-8").split("\n");

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue; // bỏ dòng trống và comment

    const idx = line.indexOf("=");
    if (idx === -1) continue; // không có dấu = → bỏ qua

    const key   = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key && value) result[key] = value;
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// Lấy giá trị thô cho 1 kèo (chưa detect loại)
// ─────────────────────────────────────────────────────────────
export function getRaw(platform) {
  const all = loadAll();
  const key = platform.toLowerCase();
  if (!all[key]) {
    throw new Error(
      `❌ Không tìm thấy auth cho "${platform}" trong cookies.txt\n` +
      `   Thêm dòng: ${key}=eyJhbGci...  (Bearer token)\n` +
      `   Hoặc:      ${key}=_ga=xxx; session=yyy  (Cookie)`
    );
  }
  return all[key];
}

// Alias giữ tương thích với code cũ
export const getCookie = getRaw;

// ─────────────────────────────────────────────────────────────
// Detect loại auth và trả về object dùng được luôn trong headers
// ─────────────────────────────────────────────────────────────
export function getAuth(platform) {
  const raw = getRaw(platform);

  // Trường hợp 1: có prefix "Bearer " → JWT token rõ ràng
  if (raw.toLowerCase().startsWith("bearer ")) {
    const token = raw.slice(7).trim();
    return {
      type    : "bearer",
      value   : token,
      headers : { "authorization": `Bearer ${token}` },
    };
  }

  // Trường hợp 2: trông như JWT (bắt đầu bằng eyJ + có 2 dấu chấm)
  // JWT format: xxxxx.yyyyy.zzzzz
  const looksLikeJwt = raw.startsWith("eyJ") && raw.split(".").length === 3;
  if (looksLikeJwt) {
    return {
      type    : "bearer",
      value   : raw,
      headers : { "authorization": `Bearer ${raw}` },
    };
  }

  // Trường hợp 3: Cookie string (có dấu = bên trong value, hoặc dấu ;)
  return {
    type    : "cookie",
    value   : raw,
    headers : { "cookie": raw },
  };
}
