/*
 * ╔══════════════════════════════════════════════════════════╗
 * ║         Smart Attendance System — ESP32 Firmware         ║
 * ╠══════════════════════════════════════════════════════════╣
 * ║  Hardware                                                ║
 * ║    • ESP32 Dev Board                                     ║
 * ║    • MFRC522  RFID  (SPI)                                ║
 * ║    • HC-SR501 PIR   → GPIO 27                            ║
 * ║    • SSD1306  OLED  128×64 (I2C)                         ║
 * ║    • Red LED        → GPIO 26 (+ 220Ω to GND)           ║
 * ╠══════════════════════════════════════════════════════════╣
 * ║  Wiring                                                  ║
 * ║    RFID  SDA→5  SCK→18  MOSI→23  MISO→19  RST→4         ║
 * ║    OLED  SDA→21  SCL→22                                  ║
 * ║    PIR   OUT→27                                          ║
 * ║    LED   +→26 (220Ω) → GND                              ║
 * ╠══════════════════════════════════════════════════════════╣
 * ║  Required Arduino Libraries (Library Manager)            ║
 * ║    • MFRC522 by GithubCommunity                          ║
 * ║    • Adafruit SSD1306                                    ║
 * ║    • Adafruit GFX Library                                ║
 * ║    • ArduinoJson by Benoît Blanchon                      ║
 * ╚══════════════════════════════════════════════════════════╝
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ArduinoJson.h>

// ════════════════════════════════════════════════════════
//  ★  CONFIG — EDIT THESE BEFORE UPLOADING  ★
// ════════════════════════════════════════════════════════

// WiFi (must match the network students will connect to)
const char* WIFI_SSID     = "YOUR_WIFI_SSID";       // ← اسم الشبكة
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";   // ← كلمة المرور

// Server — IP of the machine running npm start
// Run deploy.sh / deploy.bat to see your IP automatically
const char* SERVER_IP   = "192.168.1.100";          // ← IP السيرفر
const int   SERVER_PORT = 3000;

// What to show on the OLED for students
// (can differ from actual WiFi creds if using a hotspot with a simple password)
const char* DISPLAY_SSID = "YOUR_WIFI_SSID";
const char* DISPLAY_PASS = "YOUR_WIFI_PASSWORD";

// ════════════════════════════════════════════════════════
//  PIN MAP
// ════════════════════════════════════════════════════════
#define PIR_PIN      27   // HC-SR501
#define LED_RED      26   // Status LED
#define RFID_SS       5   // RFID SDA/CS
#define RFID_RST      4   // RFID RST  (NOT GPIO22 — that's OLED SCL)
// RFID SCK=18 MOSI=23 MISO=19  (default ESP32 SPI)
// OLED SDA=21 SCL=22            (default ESP32 I2C)

// ════════════════════════════════════════════════════════
//  OLED
// ════════════════════════════════════════════════════════
#define SCREEN_W   128
#define SCREEN_H    64
#define OLED_ADDR 0x3C

// ════════════════════════════════════════════════════════
//  TIMING
// ════════════════════════════════════════════════════════
const uint32_t WINDOW_MS      = 120000UL;  // 2 min registration window
const uint32_t PIR_COOLDOWN   =   5000UL;  // 5 s between activations
const uint32_t MSG_SHOW_MS    =   4000UL;  // card result display time
const uint32_t HEARTBEAT_MS   =  30000UL;  // ping server every 30 s
const uint32_t WIFI_RETRY_MS  =  10000UL;  // reconnect attempt interval

// ════════════════════════════════════════════════════════
//  OBJECTS
// ════════════════════════════════════════════════════════
MFRC522          rfid(RFID_SS, RFID_RST);
Adafruit_SSD1306 oled(SCREEN_W, SCREEN_H, &Wire, -1);

// ════════════════════════════════════════════════════════
//  STATE
// ════════════════════════════════════════════════════════
bool     active        = false;
uint32_t activeStart   = 0;
uint32_t lastPir       = 0;
uint32_t lastHeartbeat = 0;
uint32_t lastCountDraw = 0;
String   lastUID       = "";

// ════════════════════════════════════════════════════════
//  SERVER URL helper
// ════════════════════════════════════════════════════════
String serverUrl(const char* endpoint) {
  return String("http://") + SERVER_IP + ":" + SERVER_PORT + endpoint;
}

// ════════════════════════════════════════════════════════
//  SETUP
// ════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\n[BOOT] Smart Attendance System");

  // GPIO
  pinMode(PIR_PIN, INPUT);
  pinMode(LED_RED, OUTPUT);
  digitalWrite(LED_RED, LOW);

  // I2C + OLED
  Wire.begin(21, 22);
  if (!oled.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println("[ERR] OLED not found — check wiring");
  }
  drawBoot("Starting...");

  // SPI + RFID
  SPI.begin(18, 19, 23, RFID_SS);
  rfid.PCD_Init();
  delay(50);
  Serial.print("[RFID] Version: 0x");
  Serial.println(rfid.PCD_ReadRegister(MFRC522::VersionReg), HEX);

  connectWiFi();
}

// ════════════════════════════════════════════════════════
//  LOOP
// ════════════════════════════════════════════════════════
void loop() {
  uint32_t now = millis();

  // WiFi watchdog
  if (WiFi.status() != WL_CONNECTED && (now - lastHeartbeat > WIFI_RETRY_MS)) {
    Serial.println("[WiFi] Lost — reconnecting...");
    WiFi.reconnect();
    lastHeartbeat = now;
    return;
  }

  // Heartbeat
  if (now - lastHeartbeat >= HEARTBEAT_MS) {
    lastHeartbeat = now;
    postEvent("heartbeat");
  }

  // PIR
  if (digitalRead(PIR_PIN) == HIGH) {
    if (!active && (now - lastPir >= PIR_COOLDOWN)) {
      lastPir = now;
      activateWindow();
    }
  }

  // Active window
  if (active) {
    uint32_t elapsed = now - activeStart;

    if (elapsed < WINDOW_MS) {
      // Update countdown every second
      if (now - lastCountDraw >= 1000) {
        lastCountDraw = now;
        int rem = (WINDOW_MS - elapsed) / 1000;
        drawNetworkInfo(rem);
      }

      // RFID scan
      if (rfid.PICC_IsNewCardPresent() && rfid.PICC_ReadCardSerial()) {
        String uid = readUID();
        if (uid != lastUID) {
          lastUID = uid;
          processCard(uid);
        }
        rfid.PICC_HaltA();
        rfid.PCD_StopCrypto1();
        delay(1200);
        lastUID = "";
      }

    } else {
      deactivateWindow();
    }
  }

  delay(30);
}

// ════════════════════════════════════════════════════════
//  WIFI
// ════════════════════════════════════════════════════════
void connectWiFi() {
  drawMsg("WiFi", WIFI_SSID, "Connecting...", "");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries++ < 40) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] " + WiFi.localIP().toString());
    drawMsg("WiFi OK", WiFi.localIP().toString(), "Ready!", "");
    delay(2000);
    drawStandby();
  } else {
    Serial.println("\n[WiFi] FAILED");
    drawMsg("WiFi FAIL", "Check SSID &", "password", "Restarting...");
    delay(4000);
    ESP.restart();
  }
}

// ════════════════════════════════════════════════════════
//  WINDOW ACTIVATE / DEACTIVATE
// ════════════════════════════════════════════════════════
void activateWindow() {
  active      = true;
  activeStart = millis();
  lastCountDraw = millis();

  digitalWrite(LED_RED, HIGH);
  Serial.println("[PIR] Motion → Window open");
  postEvent("motion_detected");
  drawNetworkInfo(WINDOW_MS / 1000);
}

void deactivateWindow() {
  active = false;
  digitalWrite(LED_RED, LOW);
  Serial.println("[SYS] Window closed");
  postEvent("session_timeout");
  drawMsg("Time Up!", "Registration", "Closed", "");
  delay(3000);
  drawStandby();
}

// ════════════════════════════════════════════════════════
//  RFID
// ════════════════════════════════════════════════════════
String readUID() {
  String uid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(rfid.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  Serial.println("[RFID] " + uid);
  return uid;
}

void processCard(const String& uid) {
  if (WiFi.status() != WL_CONNECTED) {
    drawMsg("No WiFi!", uid, "Cannot check", "");
    delay(MSG_SHOW_MS);
    drawNetworkInfo(getRem());
    return;
  }

  drawMsg("Checking...", uid.substring(0,8), "", "");

  HTTPClient http;
  http.begin(serverUrl("/api/rfid-scan"));
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  StaticJsonDocument<128> req;
  req["uid"] = uid;
  String body;
  serializeJson(req, body);

  int code = http.POST(body);

  if (code == 200) {
    String raw = http.getString();
    StaticJsonDocument<512> resp;
    if (!deserializeJson(resp, raw)) {
      bool found      = resp["found"]      | false;
      bool registered = resp["registered"] | false;
      const char* name = resp["name"]      | "Unknown";

      if (found) {
        if (registered) {
          // Already checked in — show their name
          drawMsg("Already", "Registered:", name, "");
        } else {
          // Found but not checked in yet
          drawMsg("Not Reg!", name, "Open browser", "to check in");
        }
      } else {
        // Card not in system at all
        drawMsg("Unknown", "Card UID:", uid.substring(0,8), "Not in system");
      }
    }
  } else {
    Serial.println("[HTTP] Error: " + String(code));
    drawMsg("Error " + String(code), "Server issue", "Try again", "");
  }

  http.end();
  delay(MSG_SHOW_MS);
  drawNetworkInfo(getRem());
}

// ════════════════════════════════════════════════════════
//  HTTP helpers
// ════════════════════════════════════════════════════════
void postEvent(const char* event) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(serverUrl("/api/device-event"));
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(3000);

  StaticJsonDocument<128> doc;
  doc["event"]    = event;
  doc["deviceIp"] = WiFi.localIP().toString();

  String body;
  serializeJson(doc, body);
  http.POST(body);
  http.end();
}

int getRem() {
  if (!active) return 0;
  long r = (long)(WINDOW_MS) - (long)(millis() - activeStart);
  return r > 0 ? (int)(r / 1000) : 0;
}

// ════════════════════════════════════════════════════════
//  DISPLAY helpers
// ════════════════════════════════════════════════════════
void drawBoot(const char* msg) {
  oled.clearDisplay();
  oled.setTextColor(WHITE);
  oled.setTextSize(2);
  oled.setCursor(10, 8);  oled.println("Attend");
  oled.setCursor(10, 28); oled.println("System");
  oled.setTextSize(1);
  oled.setCursor(20, 52); oled.println(msg);
  oled.display();
}

void drawStandby() {
  oled.clearDisplay();
  oled.setTextColor(WHITE);
  oled.drawRect(0, 0, 128, 64, WHITE);
  oled.setTextSize(1);
  oled.setCursor(22, 8);  oled.println("SYSTEM READY");
  oled.drawLine(4, 18, 124, 18, WHITE);
  oled.setCursor(18, 26); oled.println("Waiting for");
  oled.setCursor(25, 36); oled.println("motion...");
  oled.setCursor(4, 52);
  if (WiFi.status() == WL_CONNECTED)
    oled.println("IP: " + WiFi.localIP().toString());
  else
    oled.println("WiFi: disconnected");
  oled.display();
}

void drawNetworkInfo(int sec) {
  int m = sec / 60, s = sec % 60;

  oled.clearDisplay();
  oled.setTextColor(WHITE);

  // Header bar
  oled.fillRect(0, 0, 128, 13, WHITE);
  oled.setTextColor(BLACK);
  oled.setTextSize(1);
  oled.setCursor(8, 3); oled.println("  ATTENDANCE OPEN  ");
  oled.setTextColor(WHITE);

  // WiFi name
  oled.setCursor(0, 16); oled.println("Network:");
  oled.setCursor(4, 25);
  String ssid = String(DISPLAY_SSID);
  oled.println(ssid.length() > 19 ? ssid.substring(0,17) + ".." : ssid);

  // Password
  oled.setCursor(0, 36); oled.println("Password:");
  oled.setCursor(4, 45);
  String pw = String(DISPLAY_PASS);
  oled.println(pw.length() > 19 ? pw.substring(0,17) + ".." : pw);

  // Progress bar
  oled.drawRect(0, 57, 128, 7, WHITE);
  int bar = map(sec, 0, (int)(WINDOW_MS/1000), 0, 124);
  if (bar > 0) oled.fillRect(2, 59, bar, 3, WHITE);

  // Countdown in top-right
  oled.fillRect(90, 2, 36, 10, WHITE); // clear bg
  oled.setTextColor(BLACK);
  oled.setCursor(92, 3);
  if (m < 10) oled.print('0'); oled.print(m);
  oled.print(':');
  if (s < 10) oled.print('0'); oled.print(s);
  oled.setTextColor(WHITE);

  oled.display();
}

void drawMsg(String l1, String l2, String l3, String l4) {
  oled.clearDisplay();
  oled.setTextColor(WHITE);
  oled.setTextSize(1);
  oled.setCursor(0,  4); oled.println(l1);
  oled.setCursor(0, 18); oled.println(l2);
  oled.setCursor(0, 32); oled.println(l3);
  oled.setCursor(0, 46); oled.println(l4);
  oled.display();
}
