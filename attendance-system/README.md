# ðŸŽ“ Smart Attendance System v2.0

Ù†Ø¸Ø§Ù… Ø­Ø¶ÙˆØ± Ø°ÙƒÙŠ Ù…ØªÙƒØ§Ù…Ù„ â€” ESP32 + RFID + Ø­Ø³Ø§Ø³ Ø­Ø±ÙƒØ© + ØªØ·Ø¨ÙŠÙ‚ ÙˆÙŠØ¨ Ù„Ù„Ø·Ù„Ø§Ø¨ ÙˆØ§Ù„Ù…Ø¹ÙŠØ¯ÙŠÙ†.


## Quick Links
- Server backend: server/README.md
- ESP32 firmware: esp32/README.md
- Deployment scripts: server/deploy.sh (Linux), server/deploy.bat (Windows)
- Container setup: server/docker-compose.yml and server/Dockerfile

## Repo Layout
- esp32/attendance_esp32.ino  (device firmware)
- server/                    (Node.js backend + web UI)
  - db/                      (SQLite, migrations, repositories, backups)
  - public/                  (SPA served by server.js)
  - scripts/setup.js         (one-time init + migrations)

---

## ðŸ“¦ Ù‡ÙŠÙƒÙ„ Ø§Ù„Ù…Ø´Ø±ÙˆØ¹

```
attendance-system/
â”œâ”€â”€ esp32/
â”‚   â””â”€â”€ attendance_esp32.ino      â† ÙƒÙˆØ¯ Arduino Ù„Ù„Ù€ ESP32
â””â”€â”€ server/
    â”œâ”€â”€ server.js                  â† Backend (Express + Socket.io)
    â”œâ”€â”€ package.json
    â”œâ”€â”€ ecosystem.config.js        â† PM2 config
    â”œâ”€â”€ docker-compose.yml         â† Docker deployment
    â”œâ”€â”€ Dockerfile
    â”œâ”€â”€ nginx.conf                 â† Reverse proxy
    â”œâ”€â”€ deploy.sh                  â† Linux/Pi auto-deploy
    â”œâ”€â”€ deploy.bat                 â† Windows auto-deploy
    â”œâ”€â”€ .env.example
    â”œâ”€â”€ db/
    â”‚   â”œâ”€â”€ index.js               â† SQLite connection singleton
    â”‚   â”œâ”€â”€ migrate.js             â† Migration runner
    â”‚   â”œâ”€â”€ store.js               â† Repository facade
    â”‚   â”œâ”€â”€ seed.js                â† Demo data
    â”‚   â”œâ”€â”€ backup.js              â† Hot backup + rotation
    â”‚   â”œâ”€â”€ migrations/
    â”‚   â”‚   â”œâ”€â”€ 001_initial_schema.js
    â”‚   â”‚   â”œâ”€â”€ 002_indexes.js
    â”‚   â”‚   â””â”€â”€ 003_triggers.js
    â”‚   â””â”€â”€ repositories/
    â”‚       â”œâ”€â”€ UserRepository.js
    â”‚       â”œâ”€â”€ SessionRepository.js
    â”‚       â”œâ”€â”€ AttendanceRepository.js
    â”‚       â”œâ”€â”€ QuizRepository.js
    â”‚       â””â”€â”€ misc.js            â† Hand, Complaint, Audit
    â”œâ”€â”€ scripts/
    â”‚   â””â”€â”€ setup.js               â† First-run wizard
    â””â”€â”€ public/
        â””â”€â”€ index.html             â† Frontend SPA
```

---

## ðŸ”§ Ø§Ù„Ø£Ø¬Ù‡Ø²Ø© Ø§Ù„Ù…Ø·Ù„ÙˆØ¨Ø©

| Ø§Ù„Ø¬Ù‡Ø§Ø² | Ø§Ù„ÙˆØµÙ |
|--------|-------|
| ESP32 Dev Board | ÙˆØ­Ø¯Ø© Ø§Ù„ØªØ­ÙƒÙ… |
| MFRC522 | Ù‚Ø§Ø±Ø¦ RFID (SPI) |
| HC-SR501 | Ø­Ø³Ø§Ø³ Ø­Ø±ÙƒØ© PIR |
| SSD1306 OLED 128Ã—64 | Ø´Ø§Ø´Ø© Ø¹Ø±Ø¶ (I2C) |
| LED Ø£Ø­Ù…Ø± + 220Î© | Ù…Ø¤Ø´Ø± Ø§Ù„Ø­Ø§Ù„Ø© |

---

## ðŸ”Œ Ø§Ù„ØªÙˆØµÙŠÙ„Ø§Øª

```
MFRC522  â†’  ESP32
  SDA    â†’  GPIO 5
  SCK    â†’  GPIO 18
  MOSI   â†’  GPIO 23
  MISO   â†’  GPIO 19
  RST    â†’  GPIO 4   â† Ù…Ù‡Ù…: Ù…Ø´ GPIO 22
  3.3V   â†’  3.3V
  GND    â†’  GND

HC-SR501 â†’  ESP32
  VCC    â†’  5V
  OUT    â†’  GPIO 27
  GND    â†’  GND

SSD1306  â†’  ESP32
  SDA    â†’  GPIO 21
  SCL    â†’  GPIO 22
  VCC    â†’  3.3V
  GND    â†’  GND

LED Ø§Ù„Ø£Ø­Ù…Ø±
  (+)    â†’  GPIO 26 â†’ Ù…Ù‚Ø§ÙˆÙ…Ø© 220Î© â†’ GND
```

---

## ðŸš€ ØªØ´ØºÙŠÙ„ Ø§Ù„Ø³ÙŠØ±ÙØ±

### Ø§Ù„Ø·Ø±ÙŠÙ‚Ø© Ù¡ â€” Ø£Ø³Ø±Ø¹ Ø·Ø±ÙŠÙ‚Ø© (Linux / Raspberry Pi)

```bash
cd server
chmod +x deploy.sh
./deploy.sh
```

Ø§Ù„Ø³ÙƒØ±ÙŠØ¨Øª Ù‡ÙŠØ¹Ù…Ù„ ÙƒÙ„ Ø­Ø§Ø¬Ø© ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹:
- ØªØ«Ø¨ÙŠØª Node.js Ù„Ùˆ Ù…Ø´ Ù…ÙˆØ¬ÙˆØ¯
- ØªØ«Ø¨ÙŠØª Ø§Ù„Ù€ packages
- Ø¥Ù†Ø´Ø§Ø¡ `.env` Ø¨Ù€ JWT_SECRET Ø¹Ø´ÙˆØ§Ø¦ÙŠ
- ØªØ´ØºÙŠÙ„ Ø§Ù„Ù€ migrations
- ØªØ´ØºÙŠÙ„ Ø§Ù„Ø³ÙŠØ±ÙØ± Ø¨Ù€ PM2

---

### Ø§Ù„Ø·Ø±ÙŠÙ‚Ø© Ù¢ â€” ÙŠØ¯ÙˆÙŠ (Ø£ÙŠ Ù†Ø¸Ø§Ù…)

```bash
cd server

# 1. ØªØ«Ø¨ÙŠØª Ø§Ù„Ù€ packages
npm install

# 2. Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯ Ø§Ù„Ø£ÙˆÙ„ (Ø¨ÙŠØ¹Ù…Ù„ .env + migrations)
npm run setup

# 3. ØªØ´ØºÙŠÙ„ Ø§Ù„Ø³ÙŠØ±ÙØ±
npm start
```

---

### Ø§Ù„Ø·Ø±ÙŠÙ‚Ø© Ù£ â€” Docker (Ø§Ù„Ø£Ø³Ù‡Ù„ Ù„Ù„Ù†Ø´Ø±)

```bash
cd server

# 1. Ø£Ù†Ø´Ø¦ .env
cp .env.example .env
# Ø§ÙØªØ­ .env ÙˆØºÙŠØ± JWT_SECRET Ù„Ù‚ÙŠÙ…Ø© Ø¹Ø´ÙˆØ§Ø¦ÙŠØ© Ø·ÙˆÙŠÙ„Ø©

# 2. Ø´ØºÙ‘Ù„
docker compose up -d

# 3. Ø´ÙˆÙ Ø§Ù„Ù€ logs
docker compose logs -f
```

---

### Ø§Ù„Ø·Ø±ÙŠÙ‚Ø© Ù¤ â€” Windows

```bat
cd server
deploy.bat
```

---

## ðŸ“± Ø¥Ø¹Ø¯Ø§Ø¯ ESP32

### 1. Ø«Ø¨Ù‘Øª Ø§Ù„Ù…ÙƒØªØ¨Ø§Øª (Arduino IDE â†’ Library Manager)
- `MFRC522` by GithubCommunity
- `Adafruit SSD1306`
- `Adafruit GFX Library`
- `ArduinoJson` by BenoÃ®t Blanchon

### 2. Ø¹Ø¯Ù‘Ù„ Ø§Ù„Ø¥Ø¹Ø¯Ø§Ø¯Ø§Øª ÙÙŠ Ø£ÙˆÙ„ Ø§Ù„Ù…Ù„Ù

```cpp
const char* WIFI_SSID     = "Ø§Ø³Ù…_Ø§Ù„Ø´Ø¨ÙƒØ©";
const char* WIFI_PASSWORD = "ÙƒÙ„Ù…Ø©_Ø§Ù„Ù…Ø±ÙˆØ±";
const char* SERVER_IP     = "192.168.1.XXX";  // â† IP Ø§Ù„Ø³ÙŠØ±ÙØ±
const int   SERVER_PORT   = 3000;
```

> Ù„Ù…Ø¹Ø±ÙØ© IP Ø§Ù„Ø³ÙŠØ±ÙØ±: Ø´ØºÙ‘Ù„ `deploy.sh` Ø£Ùˆ `npm start` â€” Ù‡ÙŠØ·Ø¨Ø¹ Ø§Ù„Ù€ IP ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹

### 3. Board Settings
- Board: **ESP32 Dev Module**
- Upload Speed: **115200**

---

## ðŸŒ Ø§Ù„ÙˆØµÙˆÙ„ Ù„Ù„ØªØ·Ø¨ÙŠÙ‚

Ø¨Ø¹Ø¯ ØªØ´ØºÙŠÙ„ Ø§Ù„Ø³ÙŠØ±ÙØ±ØŒ Ù‡ÙŠØ·Ø¨Ø¹ ÙÙŠ Ø§Ù„Ù€ terminal:

```
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  ðŸŽ“  Smart Attendance System  v2.0
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  Local  : http://localhost:3000
  Network: http://192.168.1.X:3000   â† Ø´ÙŠØ± Ø§Ù„Ù€ IP Ø¯Ø§ Ù„Ù„Ø·Ù„Ø§Ø¨
  QR code: http://192.168.1.X:3000/qr
```

**Ø§Ù„Ø·Ù„Ø§Ø¨:**  ÙŠÙØªØ­ÙˆØ§ Ø§Ù„Ù…ØªØµÙØ­ ÙˆÙŠÙƒØªØ¨ÙˆØ§ `http://192.168.1.X:3000`
**Ø£Ùˆ:** ÙŠØ³ÙƒØ§Ù†ÙˆØ§ QR Code Ù…Ù† `/qr`

---

## ðŸ‘¤ Ø§Ù„Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ø§ÙØªØ±Ø§Ø¶ÙŠØ© (Ø¨Ø¹Ø¯ `npm run seed`)

| Ø§Ù„Ø¯ÙˆØ± | Ø§Ù„Ø¥ÙŠÙ…ÙŠÙ„ | Ø§Ù„Ø¨Ø§Ø³ÙˆØ±Ø¯ |
|-------|---------|----------|
| Admin | `admin@university.edu` | `password123` |
| Ù…Ø¹ÙŠØ¯ | `ta1@university.edu` | `password123` |
| Ø·Ø§Ù„Ø¨ | `s001@university.edu` | `password123` |

> âš ï¸ ØºÙŠÙ‘Ø± Ø§Ù„Ø¨Ø§Ø³ÙˆØ±Ø¯Ø§Øª ÙÙˆØ± Ø§Ø³ØªØ®Ø¯Ø§Ù… Ø§Ù„Ù†Ø¸Ø§Ù… Ø¨Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø­Ù‚ÙŠÙ‚ÙŠØ©

---

## âš¡ Ø·Ø±ÙŠÙ‚Ø© Ø¹Ù…Ù„ Ø§Ù„Ù†Ø¸Ø§Ù…

```
1. Ø·Ø§Ù„Ø¨ ÙŠÙ…Ø± Ø£Ù…Ø§Ù… Ø§Ù„Ø¬Ù‡Ø§Ø²
   â†’ PIR ÙŠÙƒØªØ´Ù Ø§Ù„Ø­Ø±ÙƒØ©
   â†’ LED Ø£Ø­Ù…Ø± ÙŠØ¶ÙŠØ¡
   â†’ OLED ÙŠØ¹Ø±Ø¶ Ø§Ø³Ù… Ø§Ù„Ù€ WiFi ÙˆØ§Ù„Ø¨Ø§Ø³ÙˆØ±Ø¯ + countdown Ø¯Ù‚ÙŠÙ‚ØªÙŠÙ†
   â†’ ESP32 ÙŠØ¨Ù„Ù‘Øº Ø§Ù„Ø³ÙŠØ±ÙØ± Ø¨Ø­Ø¯Ø« "motion_detected"
   â†’ Ø§Ù„Ø³ÙŠØ±ÙØ± ÙŠØ¨Ø« Ù„ÙƒÙ„ Ø§Ù„Ù…Ø¹ÙŠØ¯ÙŠÙ†: "Ø¬Ù‡Ø§Ø² Ù…ÙØ¹Ù‘Ù„"

2. Ø§Ù„Ø·Ø§Ù„Ø¨ ÙŠØ³Ø­Ø¨ Ø§Ù„ÙÙˆÙ†
   â†’ ÙŠØªØµÙ„ Ø¨Ø§Ù„Ù€ WiFi
   â†’ ÙŠÙØªØ­ Ø§Ù„Ù…ØªØµÙØ­: http://192.168.1.X:3000
   â†’ ÙŠØ³Ø¬Ù‘Ù„ Ø¯Ø®ÙˆÙ„ Ø¨Ø¥ÙŠÙ…ÙŠÙ„ Ø§Ù„ÙƒÙ„ÙŠØ©
   â†’ ÙŠØ¶ØºØ· "Ø³Ø¬Ù‘Ù„ Ø­Ø¶ÙˆØ±ÙŠ"
   â†’ ÙŠØ¸Ù‡Ø± Ù„Ù„Ù…Ø¹ÙŠØ¯ ÙÙŠ Ø§Ù„Ø­Ø§Ù„

3. Ù„Ùˆ Ø¶Ø±Ø¨ Ø¨Ø·Ø§Ù‚Ø© RFID
   â†’ ESP32 ÙŠÙ‚Ø±Ø£ Ø§Ù„Ù€ UID
   â†’ ÙŠØ³Ø£Ù„ Ø§Ù„Ø³ÙŠØ±ÙØ±: Ù…Ù† ØµØ§Ø­Ø¨ Ø§Ù„ÙƒØ§Ø±Øª Ø¯Ø§ØŸ
   â†’ OLED ÙŠØ¹Ø±Ø¶: Ø§Ø³Ù…Ù‡ + Ù‡Ù„ Ø³Ø¬Ù‘Ù„ Ø£Ù… Ù„Ø§

4. Ø¨Ø¹Ø¯ Ø¯Ù‚ÙŠÙ‚ØªÙŠÙ†
   â†’ LED ÙŠØªÙØ´
   â†’ OLED ÙŠØ±Ø¬Ø¹ Ù„Ù€ standby
   â†’ Ø§Ù„Ù…Ø¹ÙŠØ¯ ÙŠØ´ÙˆÙ Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø­Ø§Ø¶Ø±ÙŠÙ† ÙˆØ§Ù„ØºØ§Ø¦Ø¨ÙŠÙ†

5. Ù„Ùˆ Ø§Ù„Ø·Ø§Ù„Ø¨ ÙƒØ§Ù† Ø¨ÙŠØ³ØªØ®Ø¯Ù… VPN Ø£Ùˆ Incognito
   â†’ ÙŠØªØ³Ø¬Ù‘Ù„ Ø§Ù„Ø­Ø¶ÙˆØ± Ø¨Ø´ÙƒÙ„ Ø¹Ø§Ø¯ÙŠ
   â†’ Ø§Ù„Ù…Ø¹ÙŠØ¯ ÙŠØ³ØªÙ‚Ø¨Ù„ ØªÙ†Ø¨ÙŠÙ‡ ÙÙˆØ±ÙŠ
   â†’ ÙŠØªØ³Ø¬Ù‘Ù„ ÙÙŠ Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª
```

---

## ðŸ” Ø§Ù„ØµÙ„Ø§Ø­ÙŠØ§Øª

| Ø§Ù„ØµÙ„Ø§Ø­ÙŠØ© | Ø·Ø§Ù„Ø¨ | Ù…Ø¹ÙŠØ¯ | Admin |
|----------|------|------|-------|
| ØªØ³Ø¬ÙŠÙ„ Ø­Ø¶ÙˆØ± | âœ… | - | - |
| Ø±ÙØ¹ ÙŠØ¯ | âœ… | - | - |
| ÙƒÙˆÙŠØ² | âœ… | - | - |
| Ø¥Ø±Ø³Ø§Ù„ Ø´ÙƒÙˆÙ‰ | âœ… | - | - |
| Ø¨Ø¯Ø¡/Ø¥Ù†Ù‡Ø§Ø¡ Ø¬Ù„Ø³Ø© | - | âœ… | âœ… |
| Ø±Ø¤ÙŠØ© Ø§Ù„Ø­Ø¶ÙˆØ± ÙˆØ§Ù„ØºÙŠØ§Ø¨ | - | âœ… | âœ… |
| Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ø£Ø³Ø¦Ù„Ø© | - | âœ… | âœ… |
| Ø¥Ù†Ø´Ø§Ø¡ ÙƒÙˆÙŠØ² | - | âœ… | âœ… |
| Ù‚Ø±Ø§Ø¡Ø© Ø§Ù„Ø´ÙƒØ§ÙˆÙ‰ | - | âœ… | âœ… |
| Ø¥Ø±Ø³Ø§Ù„ ÙÙŠØ¯Ø¨Ø§Ùƒ | - | âœ… | âœ… |
| Audit Log | - | - | âœ… |

---

## ðŸ—ƒï¸ Ø¥Ø¯Ø§Ø±Ø© Ù‚Ø§Ø¹Ø¯Ø© Ø§Ù„Ø¨ÙŠØ§Ù†Ø§Øª

```bash
# Ø­Ø§Ù„Ø© Ø§Ù„Ù€ migrations
npm run migrate:status

# ØªØ·Ø¨ÙŠÙ‚ migration Ø¬Ø¯ÙŠØ¯
npm run migrate

# rollback Ø¢Ø®Ø± batch
npm run migrate:down

# Ø¨ÙŠØ§Ù†Ø§Øª ØªØ¬Ø±ÙŠØ¨ÙŠØ©
npm run seed

# Ù†Ø³Ø®Ø© Ø§Ø­ØªÙŠØ§Ø·ÙŠØ© ÙŠØ¯ÙˆÙŠØ©
npm run backup

# Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ù†Ø³Ø® Ø§Ù„Ø§Ø­ØªÙŠØ§Ø·ÙŠØ©
npm run backup:list
```

Ø§Ù„Ù†Ø³Ø® Ø§Ù„Ø§Ø­ØªÙŠØ§Ø·ÙŠØ© ØªÙØ­ÙØ¸ ÙÙŠ `data/backups/` ÙˆØªÙØ¯Ø§Ø± ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹ (Ø§Ù„Ø£Ù‚Ø¯Ù… ÙŠÙØ­Ø°Ù).

---

## ðŸ–¥ï¸ PM2 â€” Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ø³ÙŠØ±ÙØ±

```bash
pm2 start ecosystem.config.js   # ØªØ´ØºÙŠÙ„
pm2 restart attendance           # Ø¥Ø¹Ø§Ø¯Ø© ØªØ´ØºÙŠÙ„
pm2 stop attendance              # Ø¥ÙŠÙ‚Ø§Ù
pm2 logs attendance              # Ø§Ù„Ù€ logs
pm2 monit                        # Ø¯Ø§Ø´Ø¨ÙˆØ±Ø¯
pm2 save && pm2 startup          # ØªØ´ØºÙŠÙ„ ØªÙ„Ù‚Ø§Ø¦ÙŠ Ø¹Ù†Ø¯ Ø§Ù„Ø¥Ù‚Ù„Ø§Ø¹
```

---

## ðŸŒ Ù…ØªØ·Ù„Ø¨Ø§Øª Ø§Ù„Ù†Ø´Ø±

| Ø§Ù„Ù…Ø·Ù„Ø¨ | Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ø¯Ù†Ù‰ |
|--------|-------------|
| Node.js | 18+ |
| RAM | 256 MB |
| Storage | 500 MB |
| Ø§Ù„Ø´Ø¨ÙƒØ© | Ù†ÙØ³ Ø§Ù„Ù€ WiFi Ù„Ù„Ù€ ESP32 ÙˆØ§Ù„Ø·Ù„Ø§Ø¨ ÙˆØ§Ù„Ø³ÙŠØ±ÙØ± |

**Ø£Ø¬Ù‡Ø²Ø© Ù…Ø¬Ø±Ù‘Ø¨Ø©:** Raspberry Pi 4, Ubuntu 22.04, Windows 11, macOS

---

## ðŸ” Ø­Ù„ Ø§Ù„Ù…Ø´Ø§ÙƒÙ„ Ø§Ù„Ø´Ø§Ø¦Ø¹Ø©

| Ø§Ù„Ù…Ø´ÙƒÙ„Ø© | Ø§Ù„Ø­Ù„ |
|---------|------|
| "WiFi FAIL" Ø¹Ù„Ù‰ Ø§Ù„Ù€ OLED | ØªØ­Ù‚Ù‚ Ù…Ù† WIFI_SSID Ùˆ WIFI_PASSWORD ÙÙŠ Ø§Ù„Ù€ .ino |
| Ø§Ù„Ø·Ù„Ø§Ø¨ Ù…Ø´ Ø¨ÙŠÙˆØµÙ„ÙˆØ§ Ù„Ù„Ù…ÙˆÙ‚Ø¹ | ØªØ£ÙƒØ¯ Ø¥Ù† Ø§Ù„Ø³ÙŠØ±ÙØ± ÙˆØ§Ù„Ø·Ù„Ø§Ø¨ Ø¹Ù„Ù‰ Ù†ÙØ³ Ø§Ù„Ù€ WiFi |
| RFID Ù…Ø´ Ø¨ÙŠÙ‚Ø±Ø£ | ØªØ£ÙƒØ¯ Ø£Ù† RST Ù…ØªÙˆØµÙ„ Ù„Ù€ GPIO 4 Ù…Ø´ 22 |
| OLED Ù…Ø´ Ø¨ØªØ´ØªØºÙ„ | ØªØ£ÙƒØ¯ Ø£Ù† SDA=21 SCL=22 ÙˆÙ…ÙˆØ¬ÙˆØ¯ Ø§Ù„Ù…ÙƒØªØ¨Ø© |
| "JWT_SECRET not set" | Ø§Ø¹Ù…Ù„ `.env` Ù…Ù† `.env.example` ÙˆØ­Ø· secret Ø·ÙˆÙŠÙ„ |
| Ø§Ù„Ù€ DB Ù…Ø´ Ø¨ØªØªØ¹Ù…Ù„ | Ø§Ø¹Ù…Ù„ `npm run migrate` ÙŠØ¯ÙˆÙŠØ§Ù‹ |

---

## ðŸ“¡ API Endpoints

```
GET  /health                    Ø­Ø§Ù„Ø© Ø§Ù„Ø³ÙŠØ±ÙØ±
GET  /qr                        QR Code ØµÙˆØ±Ø©
POST /api/register              ØªØ³Ø¬ÙŠÙ„ Ù…Ø³ØªØ®Ø¯Ù…
POST /api/login                 ØªØ³Ø¬ÙŠÙ„ Ø¯Ø®ÙˆÙ„
GET  /api/me                    Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ù…Ø³ØªØ®Ø¯Ù… Ø§Ù„Ø­Ø§Ù„ÙŠ
POST /api/rfid-scan             [ESP32] Ù‚Ø±Ø§Ø¡Ø© ÙƒØ§Ø±Øª
POST /api/device-event          [ESP32] Ø­Ø¯Ø« Ù…Ù† Ø§Ù„Ø¬Ù‡Ø§Ø²
POST /api/sessions/start        Ø¨Ø¯Ø¡ Ø¬Ù„Ø³Ø©
POST /api/sessions/end          Ø¥Ù†Ù‡Ø§Ø¡ Ø¬Ù„Ø³Ø©
GET  /api/sessions/active       Ø§Ù„Ø¬Ù„Ø³Ø© Ø§Ù„Ù†Ø´Ø·Ø©
POST /api/attendance/register   ØªØ³Ø¬ÙŠÙ„ Ø­Ø¶ÙˆØ±
GET  /api/attendance/:id        Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø­Ø¶ÙˆØ±
POST /api/raise-hand            Ø±ÙØ¹/Ø¥Ù†Ø²Ø§Ù„ Ø§Ù„ÙŠØ¯
GET  /api/raised-hands          Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø£ÙŠØ¯ÙŠ
POST /api/raised-hands/:id/respond Ø±Ø¯ Ø¹Ù„Ù‰ ÙŠØ¯
POST /api/quizzes               Ø¥Ù†Ø´Ø§Ø¡ ÙƒÙˆÙŠØ²
POST /api/quizzes/:id/toggle    ØªÙØ¹ÙŠÙ„/Ø¥ÙŠÙ‚Ø§Ù
POST /api/quizzes/:id/submit    Ø¥Ø¬Ø§Ø¨Ø© Ø§Ù„Ø·Ø§Ù„Ø¨
POST /api/complaints            Ø¥Ø±Ø³Ø§Ù„ Ø´ÙƒÙˆÙ‰
GET  /api/complaints            Ù‚Ø±Ø§Ø¡Ø© Ø§Ù„Ø´ÙƒØ§ÙˆÙ‰
POST /api/feedback              ÙÙŠØ¯Ø¨Ø§Ùƒ Ù„Ù„Ù…Ø·ÙˆØ±
GET  /api/stats/current         Ø¥Ø­ØµØ§Ø¦ÙŠØ§Øª Ø§Ù„Ø¬Ù„Ø³Ø©
GET  /api/stats/absence/:id     ØªÙ‚Ø±ÙŠØ± Ø§Ù„ØºÙŠØ§Ø¨
GET  /api/rfid/cards            Ù‚Ø§Ø¦Ù…Ø© Ø§Ù„Ø¨Ø·Ø§Ù‚Ø§Øª
GET  /api/audit                 Audit log (admin)
```

---

*Smart Attendance System v2.0 â€” Built with â¤ï¸*
