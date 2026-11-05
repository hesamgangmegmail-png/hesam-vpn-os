# HESAM VPN OS — v0.2 Cyber Edition

پنل مدیریتی فارسی و راست‌چین با معماری **Cloudflare Pages + Cloudflare Workers + Cloudflare D1**، تم Cyber مشکی/آبی و طراحی واکنش‌گرا.

> این نسخه مرکز مدیریت داده‌هاست؛ وجود یک IP یا رکورد پروکسی به معنی وجود سرور VPN نیست. اجرای VLESS، Trojan، Shadowsocks، SOCKS5، HTTP Proxy یا SSH Tunnel تا زمان اتصال VPN Node مستقل فعال نمی‌شود.

## وضعیت قابلیت‌ها در v0.2

### پیاده‌سازی‌شده
- ورود نام کاربری/رمز عبور و نشست تصادفی ۱۲ ساعته؛ نشست خام فقط در حافظه مرورگر است و هش آن در D1 ذخیره می‌شود.
- هش رمز مدیر با PBKDF2-SHA256؛ رمز خام در D1 ذخیره نمی‌شود.
- نقش‌های `owner`، `admin`، `operator` و `viewer` و کنترل دسترسی در API.
- مدیریت حساب‌های مدیر از API مالک (`GET/POST /api/admins` و `PATCH /api/admins/:id`).
- محدودسازی نرخ درخواست API و تلاش ورود با جدول D1.
- CORS با فهرست originهای دقیق؛ هیچ wildcard عمومی وجود ندارد.
- ویرایش کامل IP و پروکسی، دسته‌بندی و برچسب‌ها.
- فیلتر پروکسی بر اساس کشور، پروتکل و وضعیت؛ فیلتر IP بر اساس کشور و وضعیت.
- اعتبارسنجی دامنه/IP، پورت، پروتکل، انتقال، نقش و طول ورودی‌ها.
- ثبت رویدادهای ورود/خروج و تغییرات مدیریتی در `audit_logs`.
- خروجی JSON پروکسی‌ها و API سلامت.
- مهاجرت افزایشی D1؛ هیچ جدول یا رکورد موجودی در مهاجرت v0.2 حذف نمی‌شود.
- تست‌های خودکار اعتبارسنجی با Vitest.

### نیازمند تنظیم Cloudflare
- ساخت D1 و قرار دادن `database_id` واقعی در `wrangler.toml`.
- ثبت `BOOTSTRAP_ADMIN_PASSWORD` به‌عنوان Secret.
- تنظیم `PANEL_ORIGIN` دقیقاً برابر Origin سایت Pages.
- اجرای migrationهای D1 و انتشار Worker و Pages.

### نیازمند VPN Node / بعداً
- اجرای واقعی VLESS/Trojan/REALITY و سایر پروتکل‌ها.
- تست واقعی Ping، TCP/UDP، TLS handshake، Packet Loss، Jitter و مانیتورینگ زنده.
- Failover واقعی، توزیع کاربران، محدودیت حجم/زمان روی هسته VPN و تولید اشتراک عملیاتی V2Box.

## پیش‌نیازها
- Node.js نسخه 20 یا جدیدتر
- npm
- حساب Cloudflare برای استقرار و D1

## اجرای محلی

1. فایل `.dev.vars` را در ریشه پروژه بساز:

```env
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_PASSWORD=یک-رمز-قوی-حداقل-۱۶-کاراکتری
PANEL_ORIGIN=http://localhost:5173
```

2. فایل `.env.local` را در ریشه پروژه بساز:

```env
VITE_API_BASE=http://localhost:8787
```

3. نصب و مهاجرت محلی:

```bash
npm install
npx wrangler d1 migrations apply hesam-vpn-os-db --local
```

4. ترمینال اول (API):

```bash
npx wrangler dev
```

5. ترمینال دوم (رابط):

```bash
npm run dev
```

6. پنل را در `http://localhost:5173` باز کن. ورود اولیه:
- نام کاربری: `admin` (یا مقدار `BOOTSTRAP_ADMIN_USERNAME`)
- رمز: مقدار `BOOTSTRAP_ADMIN_PASSWORD`

در اولین ورود موفق، حساب مالک در D1 ساخته و رمز به‌صورت PBKDF2 hash ذخیره می‌شود. نشست بعد از ۱۲ ساعت منقضی می‌شود یا با خروج حذف می‌شود.

## آزمون و بررسی کد

```bash
npm install
npm test
npm run build
# یا هر دو بررسی پشت سر هم
npm run check
```

تست‌های فعلی شامل اعتبارسنجی آدرس، پورت، پروتکل، نقش مدیر و برچسب‌ها هستند. این‌ها تست یکپارچه با حساب Cloudflare یا D1 راه‌دور نیستند.

## استقرار Cloudflare

### ۱. ساخت D1

```bash
npx wrangler login
npx wrangler d1 create hesam-vpn-os-db
```

شناسه‌ای که Cloudflare برمی‌گرداند را در `wrangler.toml` جایگزین مقدار `REPLACE_WITH_YOUR_D1_DATABASE_ID` کن.

### ۲. تنظیم Origin پنل

برای اجرای محلی، مقدار پیش‌فرض `http://localhost:5173` است. پیش از انتشار production در `wrangler.toml` آن را با Origin دقیق Pages جایگزین کن (بدون مسیر و بدون `/` انتهایی):

```toml
PANEL_ORIGIN = "https://YOUR-PAGES-PROJECT.pages.dev"
```

برای چند Origin مجاز، مقدار `ADDITIONAL_ALLOWED_ORIGINS` را با آدرس‌های دقیق و جداشده با کاما تنظیم کن. از `*` استفاده نکن.

### ۳. مهاجرت و Secret

```bash
npx wrangler d1 migrations apply hesam-vpn-os-db --remote
npx wrangler secret put BOOTSTRAP_ADMIN_PASSWORD
```

هنگام دستور دوم، رمز قوی اولیه را در ورودی مخفی وارد کن. مقدار آن را داخل کد، Git یا فایل عمومی قرار نده. نام کاربری اولیه از `BOOTSTRAP_ADMIN_USERNAME` خوانده می‌شود و پیش‌فرض آن `admin` است.

### ۴. انتشار Worker و Pages

```bash
npx wrangler deploy
npm run build
npx wrangler pages deploy frontend/dist --project-name YOUR-PAGES-PROJECT
```

برای build رابط در محیط انتشار، متغیر `VITE_API_BASE` باید به Origin عمومی Worker اشاره کند؛ مثلاً:

```bash
VITE_API_BASE=https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev npm run build
```

اگر از دامنه اختصاصی استفاده می‌کنی، همان Origin نهایی را هم در `PANEL_ORIGIN` قرار بده.

## نقش‌ها

| نقش | مشاهده | ایجاد/ویرایش/تغییر وضعیت | حذف | مدیریت مدیران |
|---|---:|---:|---:|---:|
| owner | بله | بله | بله | بله |
| admin | بله | بله | بله | خیر |
| operator | بله | بله | خیر | خیر |
| viewer | بله | خیر | خیر | خیر |

حساب‌های جدید از API مالک ساخته می‌شوند. رمز حساب‌های جدید حداقل ۱۲ نویسه است. ایجاد حساب `owner` از endpoint عمومی مدیران مجاز نیست؛ ارتقای نقش فقط توسط مالک انجام می‌شود.

## APIهای مهم

- `POST /api/auth/login` — ورود و دریافت نشست
- `GET /api/auth/me` — اطلاعات حساب جاری
- `POST /api/auth/logout` — ابطال نشست جاری
- `GET/POST /api/admins` و `PATCH /api/admins/:id` — مدیریت مدیران (فقط owner)
- `GET/POST /api/ips` و `PUT/DELETE /api/ips/:id`
- `GET/POST /api/proxies` و `PUT/DELETE /api/proxies/:id`
- `PUT /api/proxies/:id/status`
- `GET /api/audit-logs?limit=50` — مشاهده رویدادها (owner/admin)
- `GET /api/export/proxies.json`
- `GET /api/health`

در APIهای محافظت‌شده، هدر `Authorization: Bearer <session-token>` لازم است.

## ملاحظات امنیتی و محدودیت‌ها

- مهاجرت `0002_v02_admin_and_metadata.sql` فقط ستون‌ها و جدول‌های جدید اضافه می‌کند؛ داده‌های موجود را پاک یا بازنویسی نمی‌کند.
- محدودسازی نرخ فعلی در D1 و بر اساس IP درخواست است؛ برای بار زیاد، Cloudflare Rate Limiting/Turnstile یا Durable Objects می‌تواند لایه تکمیلی باشد.
- CORS فقط مرورگرهای دارای Origin مجاز را می‌پذیرد؛ مقدار `PANEL_ORIGIN` باید درست تنظیم شود و به‌تنهایی جایگزین احراز هویت نیست.
- نشست در حافظه مرورگر نگهداری می‌شود؛ با refresh صفحه باید دوباره وارد شوی.
- API مدیریت مدیران آماده است، اما صفحه گرافیکی مدیریت مدیران هنوز در رابط اضافه نشده است.
- تست خودکار فعلی، تست واحد اعتبارسنجی است؛ تست end-to-end روی D1 و محیط Cloudflare باید پس از تنظیم حساب اجرا شود.
- عملیات حذف در رابط نیازمند تأیید کاربر است. این توسعه هیچ داده‌ای را خودکار حذف نمی‌کند.
- قبل از استفاده عمومی، backup، بازبینی امنیتی، محدودیت‌های دسترسی Cloudflare و تست روی دامنه واقعی را انجام بده.


## استقرار آسان با گوشی اندروید
راهنمای گام‌به‌گام استقرار بدون نصب Node.js روی گوشی در فایل `ANDROID-DEPLOY-FA.md` است. گردش‌کار GitHub Actions در `.github/workflows/deploy.yml` با هر push به شاخه `main` پروژه را منتشر می‌کند.


## استقرار فقط با گوشی اندروید
راهنمای `ANDROID-DEPLOY-FA.md` را دنبال کن. فایل `GITHUB-WORKFLOW-COPY-THIS.yml` را در مسیر `.github/workflows/deploy.yml` مخزن GitHub قرار بده. نیازی به نصب Node.js روی گوشی نیست.
