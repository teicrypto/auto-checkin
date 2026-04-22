// utils/browser.js
// Quản lý Playwright browser instance dùng chung cho toàn bộ app
// Stealth mode: vô hiệu hoá TẤT CẢ dấu hiệu automation
//
// Kỹ thuật áp dụng:
//   - puppeteer-extra-plugin-stealth: patch navigator.webdriver, plugins, WebGL...
//   - Real Chrome UA + fingerprint headers nhất quán
//   - Viewport ngẫu nhiên trong range thực tế
//   - Timezone, locale, geolocation thực tế
//   - Human-like mouse movement + typing delay
//   - Tắt tất cả flags headless bị detect

import { chromium } from "playwright";

// ─────────────────────────────────────────────────────────────
// STEALTH PATCHES — áp dụng trực tiếp qua CDP
// (thay thế cho puppeteer-extra-plugin-stealth với Playwright)
// ─────────────────────────────────────────────────────────────
const STEALTH_SCRIPTS = [
  // 1. Xoá navigator.webdriver
  `Object.defineProperty(navigator, 'webdriver', { get: () => undefined })`,

  // 2. Fake plugins như Chrome thật
  `Object.defineProperty(navigator, 'plugins', {
    get: () => {
      const makePlugin = (name, desc, filename, mimeTypes) => {
        const plugin = { name, description: desc, filename, length: mimeTypes.length };
        mimeTypes.forEach((mt, i) => { plugin[i] = mt; });
        return plugin;
      };
      return [
        makePlugin('PDF Viewer','Portable Document Format','internal-pdf-viewer',[
          {type:'application/pdf',suffixes:'pdf',description:''},
          {type:'text/pdf',suffixes:'pdf',description:''}
        ]),
        makePlugin('Chrome PDF Viewer','Portable Document Format','internal-pdf-viewer',[
          {type:'application/pdf',suffixes:'pdf',description:''}
        ]),
        makePlugin('Chromium PDF Viewer','Portable Document Format','internal-pdf-viewer',[
          {type:'application/pdf',suffixes:'pdf',description:''}
        ]),
        makePlugin('Microsoft Edge PDF Viewer','Portable Document Format','internal-pdf-viewer',[
          {type:'application/pdf',suffixes:'pdf',description:''}
        ]),
        makePlugin('WebKit built-in PDF','Portable Document Format','internal-pdf-viewer',[
          {type:'application/pdf',suffixes:'pdf',description:''}
        ]),
      ];
    }
  })`,

  // 3. Fake languages
  `Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'vi'] })`,

  // 4. Fake hardwareConcurrency (số CPU core)
  `Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })`,

  // 5. Fake deviceMemory (RAM GB)
  `Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 })`,

  // 6. Fake connection
  `Object.defineProperty(navigator, 'connection', {
    get: () => ({
      effectiveType: '4g', rtt: 50, downlink: 10,
      saveData: false, onchange: null
    })
  })`,

  // 7. Xoá automation-related chrome properties
  `window.chrome = {
    runtime: {
      connect: () => {},
      sendMessage: () => {},
      onMessage: { addListener: () => {}, removeListener: () => {} },
    },
    loadTimes: () => ({ requestTime: Date.now()/1000, startLoadTime: Date.now()/1000 }),
    csi: () => ({ startE: Date.now(), onloadT: Date.now(), pageT: 1000, tran: 15 }),
    app: { isInstalled: false, InstallState: {}, RunningState: {} },
  }`,

  // 8. Patch Notification để không bị detect
  `const _originalQuery = window.navigator.permissions?.query;
  if (_originalQuery) {
    window.navigator.permissions.query = (parameters) =>
      parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : _originalQuery(parameters);
  }`,

  // 9. Xoá dấu hiệu headless trong screen
  `Object.defineProperty(screen, 'availTop', { get: () => 0 })`,
  `Object.defineProperty(screen, 'availLeft', { get: () => 0 })`,
];

// ─────────────────────────────────────────────────────────────
// VIEWPORT — ngẫu nhiên trong range thực tế của laptop/desktop
// ─────────────────────────────────────────────────────────────
const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1440, height: 900  },
  { width: 1536, height: 864  },
  { width: 1366, height: 768  },
  { width: 1280, height: 800  },
];

function randomViewport() {
  return VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];
}

// ─────────────────────────────────────────────────────────────
// HUMAN TIMING
// ─────────────────────────────────────────────────────────────
export function humanDelay(minMs = 500, maxMs = 2000) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(r => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────
// BROWSER MANAGER — singleton pattern
// ─────────────────────────────────────────────────────────────
let _browser = null;

export async function getBrowser() {
  if (_browser) return _browser;

  _browser = await chromium.launch({
    headless : true,   // true để chạy nền; đổi false để debug xem browser

    // Args giả lập Chrome thật, tắt các flags bị detect là headless/automation
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled", // quan trọng nhất
      "--disable-infobars",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--disable-notifications",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--window-size=1920,1080",
      "--start-maximized",
      // Tắt các flag headless bị detect
      "--disable-features=IsolateOrigins,site-per-process",
    ],

    // Không dùng --headless=new để tránh một số detection
    ignoreDefaultArgs: ["--enable-automation", "--enable-blink-features=IdleDetection"],
  });

  return _browser;
}

export async function closeBrowser() {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}

// ─────────────────────────────────────────────────────────────
// TẠO CONTEXT — mỗi kèo 1 context riêng biệt (isolated)
// ─────────────────────────────────────────────────────────────
export async function createContext(options = {}) {
  const browser  = await getBrowser();
  const viewport = randomViewport();

  const context = await browser.newContext({
    // ── Viewport + screen ──
    viewport,
    screen: { width: viewport.width, height: viewport.height },

    // ── UA phải khớp hoàn toàn với stealth scripts ──
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",

    // ── Locale + timezone như người Việt Nam dùng Chrome tiếng Anh ──
    locale           : "en-US",
    timezoneId       : "Asia/Ho_Chi_Minh",
    geolocation      : { latitude: 10.8231, longitude: 106.6297 }, // HCM
    permissions      : ["geolocation"],

    // ── Color scheme ──
    colorScheme: "light",

    // ── HTTP headers mặc định cho mọi request từ context ──
    extraHTTPHeaders: {
      "accept-language": "en-US,en;q=0.9,vi-VN;q=0.8,vi;q=0.7",
    },

    // ── Tắt service workers (đôi khi gây interference) ──
    serviceWorkers: "block",

    // ── Ignore HTTPS errors ──
    ignoreHTTPSErrors: false,

    ...options,
  });

  // ── Inject stealth scripts vào MỌI page trong context ──
  for (const script of STEALTH_SCRIPTS) {
    await context.addInitScript(script);
  }

  // ── Thêm script chặn WebDriver detection ──
  await context.addInitScript(() => {
    // Xoá tất cả dấu hiệu Playwright/automation
    delete window.__playwright;
    delete window.__pw_manual;
    delete window.__PW_inspect;
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  return context;
}

// ─────────────────────────────────────────────────────────────
// TẠO PAGE với các setting chống detect
// ─────────────────────────────────────────────────────────────
export async function createPage(context) {
  const page = await context.newPage();

  // ── Chặn resource không cần thiết (tăng tốc, giảm fingerprint surface) ──
  await page.route("**/*.{png,jpg,jpeg,gif,svg,ico,woff,woff2,ttf,mp4,webm}", r => r.abort());
  await page.route("**/analytics/**", r => r.abort());
  await page.route("**/gtag/**", r => r.abort());
  await page.route("**/hotjar/**", r => r.abort());
  await page.route("**/sentry/**", r => r.abort());

  return page;
}

// ─────────────────────────────────────────────────────────────
// HUMAN MOUSE — di chuyển chuột tự nhiên trước khi click
// ─────────────────────────────────────────────────────────────
export async function humanMouseMove(page, targetX, targetY) {
  // Lấy vị trí chuột hiện tại (mặc định 0,0)
  const startX = Math.floor(Math.random() * 400) + 100;
  const startY = Math.floor(Math.random() * 300) + 100;

  // Di chuyển theo đường cong Bezier giả lập
  const steps = Math.floor(Math.random() * 10) + 8; // 8-17 bước
  for (let i = 0; i <= steps; i++) {
    const t  = i / steps;
    // Easing: easeInOutQuad
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    // Thêm noise nhỏ giả lập tay run
    const noise = () => (Math.random() - 0.5) * 4;
    const x = Math.round(startX + (targetX - startX) * ease + noise());
    const y = Math.round(startY + (targetY - startY) * ease + noise());
    await page.mouse.move(x, y);
    await new Promise(r => setTimeout(r, Math.random() * 20 + 5)); // 5-25ms mỗi step
  }
}

// ─────────────────────────────────────────────────────────────
// HUMAN CLICK — move chuột rồi mới click
// ─────────────────────────────────────────────────────────────
export async function humanClick(page, selector) {
  const el = await page.waitForSelector(selector, { timeout: 10000 });
  const box = await el.boundingBox();
  if (!box) throw new Error(`Element không visible: ${selector}`);

  // Click vào điểm ngẫu nhiên trong element (không phải center cố định)
  const x = box.x + box.width  * (0.3 + Math.random() * 0.4);
  const y = box.y + box.height * (0.3 + Math.random() * 0.4);

  await humanMouseMove(page, x, y);
  await humanDelay(80, 250); // dừng tay trước khi click
  await page.mouse.click(x, y);
}

// ─────────────────────────────────────────────────────────────
// INTERCEPT API — dùng page.route() để bắt và gọi API
// Cách này: browser thật gọi API → TLS/HTTP2/headers hoàn toàn như Chrome
// ─────────────────────────────────────────────────────────────
export async function interceptRequest(page, urlPattern) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("intercept timeout")), 15000);
    page.on("response", async (response) => {
      if (response.url().includes(urlPattern)) {
        clearTimeout(timeout);
        try {
          const body = await response.json().catch(() => ({}));
          resolve({ status: response.status(), body, headers: response.headers() });
        } catch (err) {
          reject(err);
        }
      }
    });
  });
}
