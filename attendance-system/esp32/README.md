# ESP32 Firmware

This folder holds the device code that runs on the classroom gateway (ESP32 + MFRC522 + PIR + SSD1306). It talks to the Node.js server over HTTP.

## Hardware wiring (summary)
- MFRC522: SDA=GPIO5, SCK=GPIO18, MOSI=GPIO23, MISO=GPIO19, RST=GPIO4, 3.3V, GND
- HC-SR501 PIR: VCC=5V, OUT=GPIO27, GND
- SSD1306 OLED: SDA=GPIO21, SCL=GPIO22, VCC=3.3V, GND
- Status LED: GPIO26 -> 220-ohm -> GND

## Configure before flashing
1) Open `attendance_esp32.ino`.
2) Set WiFi credentials: `WIFI_SSID` and `WIFI_PASSWORD`.
3) Point the device to your backend: update `SERVER_IP` and `SERVER_PORT` (defaults are 192.168.1.100:3000). Use an IP reachable by the ESP32.
4) Optional: tune heartbeat/timeout constants near the top if your network is slow.

## Flashing steps
- Board: select **ESP32 Dev Module** (or your variant) in Arduino IDE.
- Libraries needed: `WiFi.h` (built-in), `HTTPClient.h` (built-in), `MFRC522`, `Adafruit SSD1306`, `Adafruit GFX`. Install missing ones via Library Manager.
- Connect the board over USB, choose the correct COM port, then Upload.

## How it links to the server
- POST `/api/rfid-scan` sends card UID; server responds with user info and triggers UI/Socket.io events.
- POST `/api/device-event` pushes motion/heartbeat events.
- The web app served from `server/public/` shows live device and attendance status; keep the server and ESP32 on the same LAN.

## Quick test
1) Start the backend: `cd server && npm install && npm run setup && npm start`.
2) Set `SERVER_IP` in the sketch to the backend host IP shown at startup.
3) After flashing, open the serial monitor (115200) to confirm WiFi + API responses.
