# ESP32 Smart Home Automation (2 Relays + 3 PIR)

This project delivers a conflict-safe smart home controller for ESP32 with:

- AP + STA Wi-Fi operation
- Automatic mode when no web clients are connected
- Manual/web mode with priority conflict resolution
- WebSocket live updates and offline notification buffering
- Persistent settings (Preferences) + logs (LittleFS)
- FreeRTOS split tasks + watchdog safety

## 1) Folder Layout

```
smart-home-automation-esp32/
  README.md
  SmartHomeAutomation/
    SmartHomeAutomation.ino
    Config.h
    SystemTypes.h
    Utils.h
    TimeKeeper.h/.cpp
    StorageLayer.h/.cpp
    ControlEngine.h/.cpp
    WebPortal.h/.cpp
    data/
      index.html
```

## 2) Dependencies

Install these Arduino libraries:

- `ArduinoJson`
- `WebSockets` by Markus Sattler
- `LittleFS` (ships with ESP32 core)
- `Preferences` (ships with ESP32 core)

Board package: `esp32` (Arduino core for ESP32).

## 3) Pin Mapping (default)

Set in `SmartHomeAutomation/Config.h`:

- Relays:
  - Relay A -> GPIO26
  - Relay B -> GPIO27
- PIR:
  - PIR A -> GPIO32 (Relay A)
  - PIR B -> GPIO33 (Relay B)
  - PIR C -> GPIO25 (Relay A + Relay B)

Adjust pin numbers and sensor mapping as needed.

## 4) Build + Upload Steps

1. Open `SmartHomeAutomation/SmartHomeAutomation.ino` in Arduino IDE.
2. Choose your ESP32 board and COM port.
3. Upload filesystem first (LittleFS upload tool) so `/index.html` is available.
4. Upload firmware.
5. Connect to AP `ESP32-SmartHome` (password `SmartHome123`) or your STA network (if configured).
6. Open `http://192.168.4.1` (AP mode default).

## 5) Core Logic

### Modes

- **Automatic mode**: `connectedClients == 0`
  - PIR triggers can extend relay hold windows by 5 minutes.
- **Web/manual mode**: at least one active client
  - PIR triggers are ignored.
  - Manual and timer controls remain active.

### Priority and Conflict Rules

Priority is enforced per relay:

`MANUAL > TIMER > PIR`

Additional safety rules:

- Night blocks ON actions (day window = 06:00-18:00).
- Interlock (optional): if both relays would be ON, one is forced OFF.

### Timer Lifecycle Optimization

Timers store only:

- `active`
- `targetState`
- `endEpoch`

No continuous flash writes for remaining time. Remaining time is computed from current epoch.

### Persistence

- **Preferences**:
  - manual mode per relay
  - timer plans
  - relay state/source
  - interlock setting
  - last cleanup marker
- **LittleFS**:
  - event log file (`/logs.jsonl`)
  - pending notifications buffer (`/pending.jsonl`)

Daily cleanup keeps recent data (`LOG_RETENTION_DAYS`) and trims file size caps.

## 6) Time Synchronization

Time sources:

1. NTP (when STA is connected)
2. Client `time_sync` WebSocket packet on each connect

When time updates, timer remaining time naturally re-aligns because end timestamps are absolute.

## 7) WebSocket Contract

### Client -> ESP32

- `{"type":"time_sync","epoch":1710000000}`
- `{"type":"set_manual","channel":0,"mode":"ON|OFF|AUTO"}`
- `{"type":"set_timer","channel":1,"durationSec":300,"target":"ON|OFF"}`
- `{"type":"cancel_timer","channel":1}`
- `{"type":"set_interlock","enabled":true}`
- `{"type":"get_state"}`

### ESP32 -> Client

- `state_snapshot`
- `command_ack`
- `relay.changed`
- `pir.motion`
- `timer.started`
- `timer.ended`
- `manual.changed`
- `interlock.changed`
- connectivity + storage events

## 8) FreeRTOS + Watchdog

- **Core 1 task**: PIR processing + control evaluation + relay actuation
- **Core 0 task**: Web server + WebSocket + queue handling + housekeeping

Task watchdog is enabled to auto-reset on hangs.

## 9) Notes for Real Deployment

- Use opto-isolated relay module and proper power rails.
- Validate relay active HIGH/LOW logic for your hardware and invert writes if needed.
- Replace demo AP credentials before production.
- Consider HTTPS proxy gateway if exposing beyond local network.
