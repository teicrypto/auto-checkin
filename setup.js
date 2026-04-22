// setup.js — Chạy 1 lần sau khi clone: node setup.js
// Tự động cài chromium + kiểm tra môi trường

import { execSync } from "child_process";
import { existsSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log("━".repeat(50));
console.log("🔧 Auto Check-in — Setup");
console.log("━".repeat(50));

// ── 1. Kiểm tra Node version ─────────────────────────────
const nodeVersion = parseInt(process.version.slice(1).split(".")[0]);
if (nodeVersion < 18) {
  console.error(`❌ Node.js >= 18 required. Current: ${process.version}`);
  process.exit(1);
}
console.log(`✅ Node.js ${process.version}`);

// ── 2. Cài npm packages ──────────────────────────────────
console.log("\n📦 Cài npm packages...");
try {
  execSync("npm install", { stdio: "inherit", cwd: __dirname });
  console.log("✅ npm install xong");
} catch {
  console.error("❌ npm install thất bại");
  process.exit(1);
}

// ── 3. Cài Chromium browser ──────────────────────────────
console.log("\n🌐 Cài Chromium (lần đầu ~150MB, chờ xíu)...");
try {
  execSync("npx playwright install chromium --with-deps", {
    stdio : "inherit",
    cwd   : __dirname,
  });
  console.log("✅ Chromium đã cài xong");
} catch {
  // Thử không có --with-deps (một số môi trường không hỗ trợ)
  try {
    execSync("npx playwright install chromium", { stdio: "inherit", cwd: __dirname });
    console.log("✅ Chromium đã cài xong (không có system deps)");
  } catch (err) {
    console.error("❌ Cài Chromium thất bại:", err.message);
    process.exit(1);
  }
}

// ── 4. Tạo cookies.txt nếu chưa có ──────────────────────
const cookieFile = resolve(__dirname, "cookies.txt");
if (!existsSync(cookieFile)) {
  const example = resolve(__dirname, "cookies.example.txt");
  if (existsSync(example)) {
    const { readFileSync } = await import("fs");
    writeFileSync(cookieFile, readFileSync(example, "utf-8"));
    console.log("\n📄 Tạo cookies.txt từ cookies.example.txt");
  } else {
    writeFileSync(cookieFile, "# Thêm token/cookie vào đây\n# tên_kèo=eyJhbGci...\n");
    console.log("\n📄 Tạo cookies.txt mới");
  }
  console.log("⚠️  Điền token vào cookies.txt trước khi chạy!");
} else {
  console.log("\n✅ cookies.txt đã tồn tại");
}

// ── Xong ─────────────────────────────────────────────────
console.log("\n" + "━".repeat(50));
console.log("✅ Setup hoàn tất!");
console.log("\nCác bước tiếp theo:");
console.log("  1. Điền token vào cookies.txt");
console.log("  2. node index.js           ← chạy tất cả kèo");
console.log("  3. node index.js onvoyage  ← chạy 1 kèo");
console.log("━".repeat(50));
