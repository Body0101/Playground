# 🎓 Smart Attendance System v2.0

نظام حضور ذكي متكامل — ESP32 + RFID + حساس حركة + تطبيق ويب للطلاب والمعيدين.

---

## 📦 هيكل المشروع

```
attendance-system/
├── esp32/
│   └── attendance_esp32.ino      ← كود Arduino للـ ESP32
└── server/
    ├── server.js                  ← Backend (Express + Socket.io)
    ├── package.json
    ├── ecosystem.config.js        ← PM2 config
    ├── docker-compose.yml         ← Docker deployment
    ├── Dockerfile
    ├── nginx.conf                 ← Reverse proxy
    ├── deploy.sh                  ← Linux/Pi auto-deploy
    ├── deploy.bat                 ← Windows auto-deploy
    ├── .env.example
    ├── db/
    │   ├── index.js               ← SQLite connection singleton
    │   ├── migrate.js             ← Migration runner
    │   ├── store.js               ← Repository facade
    │   ├── seed.js                ← Demo data
    │   ├── backup.js              ← Hot backup + rotation
    │   ├── migrations/
    │   │   ├── 001_initial_schema.js
    │   │   ├── 002_indexes.js
    │   │   └── 003_triggers.js
    │   └── repositories/
    │       ├── UserRepository.js
    │       ├── SessionRepository.js
    │       ├── AttendanceRepository.js
    │       ├── QuizRepository.js
    │       └── misc.js            ← Hand, Complaint, Audit
    ├── scripts/
    │   └── setup.js               ← First-run wizard
    └── public/
        └── index.html             ← Frontend SPA
```

---

## 🔧 الأجهزة المطلوبة

| الجهاز | الوصف |
|--------|-------|
| ESP32 Dev Board | وحدة التحكم |
| MFRC522 | قارئ RFID (SPI) |
| HC-SR501 | حساس حركة PIR |
| SSD1306 OLED 128×64 | شاشة عرض (I2C) |
| LED أحمر + 220Ω | مؤشر الحالة |

---

## 🔌 التوصيلات

```
MFRC522  →  ESP32
  SDA    →  GPIO 5
  SCK    →  GPIO 18
  MOSI   →  GPIO 23
  MISO   →  GPIO 19
  RST    →  GPIO 4   ← مهم: مش GPIO 22
  3.3V   →  3.3V
  GND    →  GND

HC-SR501 →  ESP32
  VCC    →  5V
  OUT    →  GPIO 27
  GND    →  GND

SSD1306  →  ESP32
  SDA    →  GPIO 21
  SCL    →  GPIO 22
  VCC    →  3.3V
  GND    →  GND

LED الأحمر
  (+)    →  GPIO 26 → مقاومة 220Ω → GND
```

---

## 🚀 تشغيل السيرفر

### الطريقة ١ — أسرع طريقة (Linux / Raspberry Pi)

```bash
cd server
chmod +x deploy.sh
./deploy.sh
```

السكريبت هيعمل كل حاجة تلقائياً:
- تثبيت Node.js لو مش موجود
- تثبيت الـ packages
- إنشاء `.env` بـ JWT_SECRET عشوائي
- تشغيل الـ migrations
- تشغيل السيرفر بـ PM2

---

### الطريقة ٢ — يدوي (أي نظام)

```bash
cd server

# 1. تثبيت الـ packages
npm install

# 2. الإعداد الأول (بيعمل .env + migrations)
npm run setup

# 3. تشغيل السيرفر
npm start
```

---

### الطريقة ٣ — Docker (الأسهل للنشر)

```bash
cd server

# 1. أنشئ .env
cp .env.example .env
# افتح .env وغير JWT_SECRET لقيمة عشوائية طويلة

# 2. شغّل
docker compose up -d

# 3. شوف الـ logs
docker compose logs -f
```

---

### الطريقة ٤ — Windows

```bat
cd server
deploy.bat
```

---

## 📱 إعداد ESP32

### 1. ثبّت المكتبات (Arduino IDE → Library Manager)
- `MFRC522` by GithubCommunity
- `Adafruit SSD1306`
- `Adafruit GFX Library`
- `ArduinoJson` by Benoît Blanchon

### 2. عدّل الإعدادات في أول الملف

```cpp
const char* WIFI_SSID     = "اسم_الشبكة";
const char* WIFI_PASSWORD = "كلمة_المرور";
const char* SERVER_IP     = "192.168.1.XXX";  // ← IP السيرفر
const int   SERVER_PORT   = 3000;
```

> لمعرفة IP السيرفر: شغّل `deploy.sh` أو `npm start` — هيطبع الـ IP تلقائياً

### 3. Board Settings
- Board: **ESP32 Dev Module**
- Upload Speed: **115200**

---

## 🌐 الوصول للتطبيق

بعد تشغيل السيرفر، هيطبع في الـ terminal:

```
══════════════════════════════════════════════════════
  🎓  Smart Attendance System  v2.0
══════════════════════════════════════════════════════
  Local  : http://localhost:3000
  Network: http://192.168.1.X:3000   ← شير الـ IP دا للطلاب
  QR code: http://192.168.1.X:3000/qr
```

**الطلاب:**  يفتحوا المتصفح ويكتبوا `http://192.168.1.X:3000`
**أو:** يسكانوا QR Code من `/qr`

---

## 👤 الحسابات الافتراضية (بعد `npm run seed`)

| الدور | الإيميل | الباسورد |
|-------|---------|----------|
| Admin | `admin@university.edu` | `password123` |
| معيد | `ta1@university.edu` | `password123` |
| طالب | `s001@university.edu` | `password123` |

> ⚠️ غيّر الباسوردات فور استخدام النظام بالبيانات الحقيقية

---

## ⚡ طريقة عمل النظام

```
1. طالب يمر أمام الجهاز
   → PIR يكتشف الحركة
   → LED أحمر يضيء
   → OLED يعرض اسم الـ WiFi والباسورد + countdown دقيقتين
   → ESP32 يبلّغ السيرفر بحدث "motion_detected"
   → السيرفر يبث لكل المعيدين: "جهاز مفعّل"

2. الطالب يسحب الفون
   → يتصل بالـ WiFi
   → يفتح المتصفح: http://192.168.1.X:3000
   → يسجّل دخول بإيميل الكلية
   → يضغط "سجّل حضوري"
   → يظهر للمعيد في الحال

3. لو ضرب بطاقة RFID
   → ESP32 يقرأ الـ UID
   → يسأل السيرفر: من صاحب الكارت دا؟
   → OLED يعرض: اسمه + هل سجّل أم لا

4. بعد دقيقتين
   → LED يتفش
   → OLED يرجع لـ standby
   → المعيد يشوف قائمة الحاضرين والغائبين

5. لو الطالب كان بيستخدم VPN أو Incognito
   → يتسجّل الحضور بشكل عادي
   → المعيد يستقبل تنبيه فوري
   → يتسجّل في قاعدة البيانات
```

---

## 🔐 الصلاحيات

| الصلاحية | طالب | معيد | Admin |
|----------|------|------|-------|
| تسجيل حضور | ✅ | - | - |
| رفع يد | ✅ | - | - |
| كويز | ✅ | - | - |
| إرسال شكوى | ✅ | - | - |
| بدء/إنهاء جلسة | - | ✅ | ✅ |
| رؤية الحضور والغياب | - | ✅ | ✅ |
| إدارة الأسئلة | - | ✅ | ✅ |
| إنشاء كويز | - | ✅ | ✅ |
| قراءة الشكاوى | - | ✅ | ✅ |
| إرسال فيدباك | - | ✅ | ✅ |
| Audit Log | - | - | ✅ |

---

## 🗃️ إدارة قاعدة البيانات

```bash
# حالة الـ migrations
npm run migrate:status

# تطبيق migration جديد
npm run migrate

# rollback آخر batch
npm run migrate:down

# بيانات تجريبية
npm run seed

# نسخة احتياطية يدوية
npm run backup

# قائمة النسخ الاحتياطية
npm run backup:list
```

النسخ الاحتياطية تُحفظ في `data/backups/` وتُدار تلقائياً (الأقدم يُحذف).

---

## 🖥️ PM2 — إدارة السيرفر

```bash
pm2 start ecosystem.config.js   # تشغيل
pm2 restart attendance           # إعادة تشغيل
pm2 stop attendance              # إيقاف
pm2 logs attendance              # الـ logs
pm2 monit                        # داشبورد
pm2 save && pm2 startup          # تشغيل تلقائي عند الإقلاع
```

---

## 🌍 متطلبات النشر

| المطلب | الحد الأدنى |
|--------|-------------|
| Node.js | 18+ |
| RAM | 256 MB |
| Storage | 500 MB |
| الشبكة | نفس الـ WiFi للـ ESP32 والطلاب والسيرفر |

**أجهزة مجرّبة:** Raspberry Pi 4, Ubuntu 22.04, Windows 11, macOS

---

## 🔍 حل المشاكل الشائعة

| المشكلة | الحل |
|---------|------|
| "WiFi FAIL" على الـ OLED | تحقق من WIFI_SSID و WIFI_PASSWORD في الـ .ino |
| الطلاب مش بيوصلوا للموقع | تأكد إن السيرفر والطلاب على نفس الـ WiFi |
| RFID مش بيقرأ | تأكد أن RST متوصل لـ GPIO 4 مش 22 |
| OLED مش بتشتغل | تأكد أن SDA=21 SCL=22 وموجود المكتبة |
| "JWT_SECRET not set" | اعمل `.env` من `.env.example` وحط secret طويل |
| الـ DB مش بتتعمل | اعمل `npm run migrate` يدوياً |

---

## 📡 API Endpoints

```
GET  /health                    حالة السيرفر
GET  /qr                        QR Code صورة
POST /api/register              تسجيل مستخدم
POST /api/login                 تسجيل دخول
GET  /api/me                    بيانات المستخدم الحالي
POST /api/rfid-scan             [ESP32] قراءة كارت
POST /api/device-event          [ESP32] حدث من الجهاز
POST /api/sessions/start        بدء جلسة
POST /api/sessions/end          إنهاء جلسة
GET  /api/sessions/active       الجلسة النشطة
POST /api/attendance/register   تسجيل حضور
GET  /api/attendance/:id        قائمة الحضور
POST /api/raise-hand            رفع/إنزال اليد
GET  /api/raised-hands          قائمة الأيدي
POST /api/raised-hands/:id/respond رد على يد
POST /api/quizzes               إنشاء كويز
POST /api/quizzes/:id/toggle    تفعيل/إيقاف
POST /api/quizzes/:id/submit    إجابة الطالب
POST /api/complaints            إرسال شكوى
GET  /api/complaints            قراءة الشكاوى
POST /api/feedback              فيدباك للمطور
GET  /api/stats/current         إحصائيات الجلسة
GET  /api/stats/absence/:id     تقرير الغياب
GET  /api/rfid/cards            قائمة البطاقات
GET  /api/audit                 Audit log (admin)
```

---

*Smart Attendance System v2.0 — Built with ❤️*
