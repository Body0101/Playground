@echo off
REM ══════════════════════════════════════════════════
REM   Smart Attendance System — Windows Deploy
REM   Run as Administrator for full setup
REM ══════════════════════════════════════════════════

echo.
echo ╔══════════════════════════════════════════╗
echo ║   Smart Attendance System — Windows      ║
echo ╚══════════════════════════════════════════╝
echo.

REM ── Check Node.js ─────────────────────────────────
node --version >nul 2>&1
IF ERRORLEVEL 1 (
    echo ❌  Node.js not found!
    echo     Download from: https://nodejs.org  (LTS version)
    pause
    exit /b 1
)
FOR /F "tokens=*" %%v IN ('node -e "process.stdout.write(process.versions.node)"') DO SET NODE_VER=%%v
echo ✅  Node.js %NODE_VER%

REM ── Install dependencies ──────────────────────────
echo     Installing npm packages...
npm ci --omit=dev
IF ERRORLEVEL 1 (echo ❌  npm install failed & pause & exit /b 1)
echo ✅  Packages installed

REM ── Generate .env ─────────────────────────────────
IF NOT EXIST .env (
    echo     Generating .env...
    FOR /F "tokens=*" %%s IN ('node -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))"') DO SET SECRET=%%s
    (
        echo JWT_SECRET=%SECRET%
        echo PORT=3000
        echo NODE_ENV=production
        echo AUTO_BACKUP=true
        echo MAX_BACKUPS=14
    ) > .env
    echo ✅  .env generated
) ELSE (
    echo ✅  .env exists
)

REM ── Directories ───────────────────────────────────
IF NOT EXIST data\backups mkdir data\backups
IF NOT EXIST logs         mkdir logs
echo ✅  Directories ready

REM ── Migrations ────────────────────────────────────
node db\migrate.js up
IF ERRORLEVEL 1 (echo ❌  Migration failed & pause & exit /b 1)
echo ✅  Database ready

REM ── PM2 ───────────────────────────────────────────
pm2 --version >nul 2>&1
IF ERRORLEVEL 1 (
    echo     Installing PM2...
    npm install -g pm2
)
pm2 stop attendance >nul 2>&1
pm2 delete attendance >nul 2>&1
pm2 start ecosystem.config.js
pm2 save

REM ── Get IP ────────────────────────────────────────
FOR /F "tokens=*" %%i IN ('node -e "const os=require('os');for(const n of Object.values(os.networkInterfaces()))for(const i of n)if(i.family==='IPv4'&&!i.internal){process.stdout.write(i.address);process.exit(0);}"') DO SET LOCAL_IP=%%i

echo.
echo ╔══════════════════════════════════════════╗
echo ║   ✅  Deploy complete!                   ║
echo ╠══════════════════════════════════════════╣
echo ║   Network : http://%LOCAL_IP%:3000
echo ║   QR Code : http://%LOCAL_IP%:3000/qr
echo ║   ESP32 SERVER_IP = %LOCAL_IP%
echo ╠══════════════════════════════════════════╣
echo ║   pm2 logs attendance  ^<^- live logs      ║
echo ╚══════════════════════════════════════════╝
echo.
pause
