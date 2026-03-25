#!/usr/bin/env bash
# ══════════════════════════════════════════════════════
#   Smart Attendance System — Auto-Deploy Script
#   Tested on: Ubuntu 22.04, Debian 11, Raspberry Pi OS
#
#   Usage:
#     chmod +x deploy.sh
#     ./deploy.sh
# ══════════════════════════════════════════════════════

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✅  $1${NC}"; }
warn() { echo -e "${YELLOW}⚠️   $1${NC}"; }
err()  { echo -e "${RED}❌  $1${NC}"; exit 1; }
info() { echo -e "    $1"; }

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Smart Attendance System — Deploy       ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. Node.js ────────────────────────────────────────
if ! command -v node &>/dev/null; then
  warn "Node.js not found. Installing Node.js 20 LTS..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
NODE_VER=$(node -e "process.stdout.write(process.versions.node)")
MAJOR=$(echo "$NODE_VER" | cut -d. -f1)
if [ "$MAJOR" -lt 18 ]; then
  err "Node.js >= 18 required (found $NODE_VER). Run: sudo n 20"
fi
ok "Node.js $NODE_VER"

# ── 2. npm install ────────────────────────────────────
info "Installing dependencies..."
npm ci --omit=dev --silent
ok "npm packages installed"

# ── 3. .env ───────────────────────────────────────────
if [ ! -f .env ]; then
  warn ".env not found — generating..."
  SECRET=$(node -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))")
  cat > .env << EOF
JWT_SECRET=${SECRET}
PORT=3000
NODE_ENV=production
AUTO_BACKUP=true
MAX_BACKUPS=14
BACKUP_EVERY=21600000
EOF
  ok ".env generated"
else
  ok ".env exists"
fi

# ── 4. Directories ────────────────────────────────────
mkdir -p data/backups logs
ok "Directories ready"

# ── 5. Migrations ────────────────────────────────────
node db/migrate.js up
ok "Database migrations applied"

# ── 6. PM2 ────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  info "Installing PM2 globally..."
  sudo npm install -g pm2 --silent
fi
ok "PM2 $(pm2 -v)"

# Stop old instance if running
pm2 stop attendance 2>/dev/null || true
pm2 delete attendance 2>/dev/null || true

# Start fresh
pm2 start ecosystem.config.js
pm2 save

# ── 7. Auto-start on boot ─────────────────────────────
STARTUP=$(pm2 startup 2>&1 | tail -1)
if echo "$STARTUP" | grep -q "sudo"; then
  warn "Run this command to enable auto-start on boot:"
  echo ""
  echo "    $STARTUP"
  echo ""
else
  ok "PM2 startup configured"
fi

# ── 8. Firewall ───────────────────────────────────────
if command -v ufw &>/dev/null; then
  if sudo ufw status | grep -q "Status: active"; then
    sudo ufw allow 3000/tcp > /dev/null 2>&1 || true
    ok "Firewall: port 3000 opened"
  fi
fi

# ── 9. Show result ────────────────────────────────────
LOCAL_IP=$(node -e "
const os=require('os');
for(const n of Object.values(os.networkInterfaces()))
  for(const i of n)
    if(i.family==='IPv4'&&!i.internal){process.stdout.write(i.address);process.exit(0);}
process.stdout.write('localhost');
")
PORT=$(grep -E '^PORT=' .env | cut -d= -f2 || echo 3000)

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   ✅  Deployment complete!               ║"
echo "╠══════════════════════════════════════════╣"
printf "║   Network URL : http://%-18s ║\n" "${LOCAL_IP}:${PORT}"
printf "║   QR Code     : http://%-18s ║\n" "${LOCAL_IP}:${PORT}/qr"
echo "║                                          ║"
echo "║   ESP32 SERVER_IP = ${LOCAL_IP}      "
echo "╠══════════════════════════════════════════╣"
echo "║   pm2 logs attendance  ← live logs       ║"
echo "║   pm2 monit            ← dashboard       ║"
echo "║   pm2 restart attendance ← restart       ║"
echo "╚══════════════════════════════════════════╝"
echo ""
