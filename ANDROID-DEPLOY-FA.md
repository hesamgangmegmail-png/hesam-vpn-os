# راهنمای استقرار HESAM VPN OS فقط با گوشی اندروید

در این روش لازم نیست Node.js، Termux یا Pydroid روی گوشی نصب کنی. GitHub Actions پروژه را روی سرور خودش می‌سازد و روی Cloudflare منتشر می‌کند.

## ۱) ساخت منابع Cloudflare (فقط یک‌بار)

1. در Cloudflare > Workers & Pages یک پروژه Pages با نام دلخواه بساز.
2. در D1 یک دیتابیس با نام دقیق `hesam-vpn-os-db` بساز و مقدار **Database ID** را کپی کن.
3. از پروفایل Cloudflare مقدار **Account ID** را کپی کن.
4. بساز یک API Token با دسترسی‌های Account: Workers Scripts Edit، Cloudflare Pages Edit، D1 Edit و Account Settings Read.
5. در Workers & Pages مطمئن شو زیردامنه `workers.dev` برای حسابت فعال است. آدرس Worker این پروژه به شکل `https://hesam-vpn-os-api.<subdomain>.workers.dev` خواهد بود؛ `<subdomain>` را از صفحه Workers & Pages حساب خودت بردار.

## ۲) ساخت Repository با گوشی

1. ZIP دانلودشده را لازم نیست روی گوشی استخراج کنی.
2. در GitHub یک Repository جدید به نام `hesam-vpn-os` بساز؛ **Private** را انتخاب کن.
3. در Repository روی Add file > Upload files بزن و فقط فایل `HESAM-VPN-OS-v0.2-ANDROID-DEPLOY.zip` را بارگذاری کن. Commit changes را بزن.
4. حالا Add file > Create new file را بزن. نام فایل را دقیقاً این بگذار: `.github/workflows/deploy.yml`
5. فایل `GITHUB-WORKFLOW-COPY-THIS.yml` را از داخل ZIP باز کن و تمام متن آن را در فایل جدید GitHub کپی کن. Commit changes را بزن.

## ۳) تنظیم Secrets در GitHub

در Repository برو به Settings > Secrets and variables > Actions > New repository secret و این ۷ Secret را بساز:

| نام دقیق | مقداری که باید وارد شود |
|---|---|
| `CLOUDFLARE_API_TOKEN` | API Token مرحله ۱ |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID |
| `D1_DATABASE_ID` | Database ID دیتابیس D1 |
| `PAGES_PROJECT_NAME` | نام پروژه Pages |
| `PANEL_ORIGIN` | آدرس Pages مثل `https://hesam-vpn-os.pages.dev` |
| `WORKER_API_BASE` | آدرس Worker با زیردامنه واقعی خودت |
| `BOOTSTRAP_ADMIN_PASSWORD` | رمز اولیه قوی و حداقل ۱۶ نویسه |

`WORKER_API_BASE` را بدون `/` انتهایی وارد کن. `PANEL_ORIGIN` نیز بدون مسیر و `/` انتهایی باشد.

## ۴) اجرای نصب خودکار

1. در Repository زبانه Actions را باز کن.
2. گردش‌کار Deploy HESAM VPN OS را انتخاب کن.
3. Run workflow را بزن.
4. اگر همه مراحل سبز شدند، آدرس Pages را باز کن.
5. نام کاربری اولیه `admin` و رمز همان `BOOTSTRAP_ADMIN_PASSWORD` است.

## از این به بعد

برای نسخه‌های بعدی، ZIP جدید را با همان نام در Repository جایگزین کن (Upload files و Commit). سپس Actions را باز کن و Run workflow را بزن. می‌توانی فایل ZIP را همواره با همان نام نگه داری تا Workflow نیاز به تغییر نداشته باشد.

## امنیت و محدودیت‌ها

- API Token و رمز مدیر را فقط در GitHub Secrets نگه دار؛ هرگز داخل ZIP یا کد قرار نده.
- Repository را Private نگه دار.
- Workflow فقط migrationهای افزایشی D1 را اجرا می‌کند؛ دستور حذف جدول یا پاک‌سازی داده ندارد.
- این روش پنل و API را مستقر می‌کند، نه VPN Node. VLESS/Trojan واقعی و تست Ping/Packet Loss/Jitter هنوز به Node واقعی نیاز دارند.
