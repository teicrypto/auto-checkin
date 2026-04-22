// index.js — Entry point
// node index.js           → chạy tất cả kèo
// node index.js onvoyage  → chạy 1 kèo

import { readdirSync } from "fs";
import { resolve, dirname, basename, extname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { log } from "./utils/logger.js";
import { closeBrowser } from "./utils/browser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTO_DIR  = resolve(__dirname, "auto");

function discoverSkills() {
  return readdirSync(AUTO_DIR)
    .filter(f => extname(f) === ".js")
    .map(f => basename(f, ".js").toLowerCase());
}

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
      log("index", `Skills có sẵn: ${discoverSkills().join(", ")}`, "info");
    } else {
      log("index", `Lỗi khi chạy "${name}": ${err.message}`, "error");
    }
  }
}

async function main() {
  const target = process.argv[2]?.toLowerCase();
  const skills = discoverSkills();

  console.log("━".repeat(50));
  console.log(`🤖 Auto Check-in | ${new Date().toLocaleString("vi-VN")}`);
  console.log(`📦 Skills: ${skills.join(", ")}`);
  console.log(`🌐 Engine: Playwright stealth`);
  console.log("━".repeat(50));

  try {
    if (target) {
      log("index", `Chạy skill: ${target}`);
      await runSkill(target);
    } else {
      log("index", `Chạy tất cả ${skills.length} skill(s)...`);
      for (const skill of skills) {
        await runSkill(skill);
        // Delay giữa các kèo — dùng chung browser nhưng tạo context mới
        if (skills.indexOf(skill) < skills.length - 1) {
          await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
        }
      }
    }
  } finally {
    // Đóng browser sau khi tất cả kèo xong
    await closeBrowser();
    log("index", "Browser đã đóng.");
  }

  console.log("━".repeat(50));
  log("index", "Hoàn tất!", "success");
}

main().catch(async (err) => {
  console.error("Fatal error:", err);
  await closeBrowser();
  process.exit(1);
});
