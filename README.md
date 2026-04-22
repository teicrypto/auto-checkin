# 🤖 Auto Check-in — Playwright Stealth

Hệ thống tự động điểm danh hàng ngày cho nhiều kèo web3/airdrop.
Engine: **Playwright + Chrome thật** — chân thật nhất có thể.

## 📁 Cấu trúc

```
auto-checkin/
├── setup.js              ← chạy 1 lần sau clone
├── index.js              ← entry point
├── cookies.txt           ← token/cookie (KHÔNG commit)
├── cookies.example.txt   ← template
├── utils/
│   ├── browser.js        ← Playwright stealth engine
│   ├── loadCookies.js    ← đọc cookies.txt, auto-detect loại auth
│   └── logger.js         ← logging với màu sắc
└── auto/
    ├── onvoyage.js       ← kèo onvoyage.ai
    └── cedomis.js        ← template kèo mới
```

## 🚀 Setup (chỉ làm 1 lần)

```bash
git clone https://github.com/YOUR/auto-checkin.git
cd auto-checkin
node setup.js          # cài npm packages + tải Chromium (~150MB)
```

## ⚙️ Cấu hình

Điền token vào `cookies.txt`:
```
# Bearer JWT token (web3 hiện đại)
onvoyage=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx

# Cookie string (trang cũ)
cedomis=_ga=xxx; session=yyy; token=zzz
```

Lấy token: DevTools → Network → click request check-in → Headers → Authorization → copy sau "Bearer "

## ▶️ Chạy

```bash
node index.js              # tất cả kèo
node index.js onvoyage     # 1 kèo
```

## ➕ Thêm kèo mới

```bash
cp auto/cedomis.js auto/newkeo.js
# Sửa PLATFORM, FRONTEND_URL, BACKEND_URL, ENDPOINT_CHECKIN
# Thêm vào cookies.txt: newkeo=eyJ...
```

## 🔄 Cron job hàng ngày

```bash
# Mỗi ngày 8:00 sáng
0 8 * * * cd /path/to/auto-checkin && git pull && node index.js
```

## 🛡️ Anti-detection

- ✅ Chrome thật (Playwright) — TLS/HTTP2 fingerprint chuẩn 100%
- ✅ Tắt `navigator.webdriver`
- ✅ Fake plugins, hardwareConcurrency, deviceMemory
- ✅ Viewport ngẫu nhiên
- ✅ Timezone Vietnam, locale en-US
- ✅ Human mouse movement
- ✅ Random delay giữa các bước
- ✅ Session warmup (load trang trước khi gọi API)
