// index.js — Entry point
// Dùng: node index.js              → chạy tất cả kèo
//       node index.js onvoyage     → chạy 1 kèo cụ thể

import { readdirSync } from "fs";
import { resolve, dirname, basename, extname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { log } from "./utils/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTO_DIR = resolve(__dirname, "auto");

// ── Tự động tìm tất cả file .js trong thư mục auto/ ──────────
function discoverSkills() {
  return readdirSync(AUTO_DIR)
    .filter((f) => extname(f) === ".js")
    .map((f) => basename(f, ".js").toLowerCase());
}

// ── Chạy 1 skill theo tên ────────────────────────────────────
async function runSkill(name) {
  const filePath = resolve(AUTO_DIR, `${name}.js`);
  try {
    const mod = await import(pathToFileURL(filePath).href);
    if (typeof mod.run !== "function") {
      log("index", `Skill "${name}" không có export function run()`, "warn");
      return;
    }
    await mod.run();
  } catch (err) {
    if (err.code === "ERR_MODULE_NOT_FOUND") {
      log("index", `Không tìm thấy skill: "${name}"`, "error");
      log("index", `Các skill có sẵn: ${discoverSkills().join(", ")}`, "info");
    } else {
      log("index", `Lỗi khi chạy "${name}": ${err.message}`, "error");
    }
  }
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  const target = process.argv[2]?.toLowerCase();
  const skills = discoverSkills();

  console.log("━".repeat(50));
  console.log(`🤖 Auto Check-in | ${new Date().toLocaleString("vi-VN")}`);
  console.log(`📦 Skills có sẵn: ${skills.join(", ")}`);
  console.log("━".repeat(50));

  if (target) {
    // Chạy 1 kèo cụ thể
    log("index", `Chạy skill: ${target}`);
    await runSkill(target);
  } else {
    // Chạy tất cả kèo tuần tự
    log("index", `Chạy tất cả ${skills.length} skill(s)...`);
    for (const skill of skills) {
      await runSkill(skill);
      // Delay nhỏ giữa các kèo để tránh rate limit
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  console.log("━".repeat(50));
  log("index", "Hoàn tất!", "success");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
