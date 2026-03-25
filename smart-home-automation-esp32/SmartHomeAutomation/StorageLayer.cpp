#include "StorageLayer.h"

#include <ArduinoJson.h>
#include <vector>

#include "Config.h"

namespace {
String keyFor(const char *prefix, size_t index) {
  String key(prefix);
  key += String(index);
  return key;
}
}  // namespace

bool StorageLayer::begin() {
  if (!ioMutex_) {
    ioMutex_ = xSemaphoreCreateMutex();
  }
  if (!ioMutex_) {
    return false;
  }
  if (!LittleFS.begin(true)) {
    return false;
  }
  if (!lock()) {
    return false;
  }
  const bool ok = preferences_.begin(PREF_NAMESPACE, false);
  unlock();
  return ok;
}

Preferences *StorageLayer::prefs() { return &preferences_; }

void StorageLayer::loadRuntime(SystemRuntime *runtime) {
  if (!runtime) {
    return;
  }
  if (!lock()) {
    return;
  }
  runtime->interlockEnabled = preferences_.getBool("interlock", false);
  runtime->energyTrackingEnabled = preferences_.getBool("energy_en", false);
  for (size_t i = 0; i < RELAY_COUNT; ++i) {
    uint8_t mode = preferences_.getUChar(keyFor("m", i).c_str(), static_cast<uint8_t>(RelayMode::AUTO));
    uint8_t state = preferences_.getUChar(keyFor("rs", i).c_str(), static_cast<uint8_t>(RelayState::OFF));
    uint8_t source = preferences_.getUChar(keyFor("src", i).c_str(), static_cast<uint8_t>(ControlSource::NONE));
    if (mode > static_cast<uint8_t>(RelayMode::AUTO)) {
      mode = static_cast<uint8_t>(RelayMode::AUTO);
    }
    if (state > static_cast<uint8_t>(RelayState::ON)) {
      state = static_cast<uint8_t>(RelayState::OFF);
    }
    if (source > static_cast<uint8_t>(ControlSource::MANUAL)) {
      source = static_cast<uint8_t>(ControlSource::NONE);
    }
    runtime->relays[i].manualMode = static_cast<RelayMode>(mode);
    runtime->relays[i].appliedState = static_cast<RelayState>(state);
    runtime->relays[i].appliedSource = static_cast<ControlSource>(source);
    runtime->relays[i].timer.active = preferences_.getBool(keyFor("ta", i).c_str(), false);
    runtime->relays[i].timer.endEpoch = preferences_.getULong64(keyFor("te", i).c_str(), 0);
    uint8_t target = preferences_.getUChar(keyFor("tt", i).c_str(), static_cast<uint8_t>(RelayState::OFF));
    if (target > static_cast<uint8_t>(RelayState::ON)) {
      target = static_cast<uint8_t>(RelayState::OFF);
    }
    runtime->relays[i].timer.targetState = static_cast<RelayState>(target);
    uint8_t previousState =
        preferences_.getUChar(keyFor("tps", i).c_str(), static_cast<uint8_t>(RelayState::OFF));
    if (previousState > static_cast<uint8_t>(RelayState::ON)) {
      previousState = static_cast<uint8_t>(RelayState::OFF);
    }
    runtime->relays[i].timer.previousState = static_cast<RelayState>(previousState);
    uint8_t previousManual =
        preferences_.getUChar(keyFor("tpm", i).c_str(), static_cast<uint8_t>(RelayMode::AUTO));
    if (previousManual > static_cast<uint8_t>(RelayMode::AUTO)) {
      previousManual = static_cast<uint8_t>(RelayMode::AUTO);
    }
    runtime->relays[i].timer.previousManualMode = static_cast<RelayMode>(previousManual);
    runtime->relays[i].timer.durationMinutes = preferences_.getUInt(keyFor("tdm", i).c_str(), 0);
    runtime->relays[i].timer.restorePending = preferences_.getBool(keyFor("trp", i).c_str(), false);
    runtime->relays[i].autoHoldUntilEpoch = preferences_.getULong64(keyFor("ah", i).c_str(), 0);
    runtime->relays[i].energyTrackingActive = false;
    runtime->relays[i].energyStartEpoch = 0;
    runtime->relays[i].stats.timerUses = preferences_.getUInt(keyFor("tu", i).c_str(), 0);
    runtime->relays[i].stats.totalTimerMinutes = preferences_.getUInt(keyFor("tm", i).c_str(), 0);
    runtime->relays[i].stats.accumulatedOnSeconds = preferences_.getULong64(keyFor("os", i).c_str(), 0);
    runtime->relays[i].stats.lastOnEpoch = preferences_.getULong64(keyFor("lo", i).c_str(), 0);
    runtime->relays[i].stats.totalEnergyWh = preferences_.getFloat(keyFor("ewt", i).c_str(), 0.0f);
    runtime->relays[i].stats.lastEnergyWh = preferences_.getFloat(keyFor("ewl", i).c_str(), 0.0f);
  }
  unlock();
}

void StorageLayer::persistManualMode(size_t relayIndex, RelayMode mode) {
  if (!lock()) {
    return;
  }
  preferences_.putUChar(keyFor("m", relayIndex).c_str(), static_cast<uint8_t>(mode));
  unlock();
}

void StorageLayer::persistRelayState(size_t relayIndex, RelayState state, ControlSource source) {
  if (!lock()) {
    return;
  }
  preferences_.putUChar(keyFor("rs", relayIndex).c_str(), static_cast<uint8_t>(state));
  preferences_.putUChar(keyFor("src", relayIndex).c_str(), static_cast<uint8_t>(source));
  unlock();
}

void StorageLayer::persistTimer(size_t relayIndex, const TimerPlan &plan) {
  if (!lock()) {
    return;
  }
  preferences_.putBool(keyFor("ta", relayIndex).c_str(), plan.active);
  preferences_.putULong64(keyFor("te", relayIndex).c_str(), plan.endEpoch);
  preferences_.putUChar(keyFor("tt", relayIndex).c_str(), static_cast<uint8_t>(plan.targetState));
  preferences_.putUChar(keyFor("tps", relayIndex).c_str(), static_cast<uint8_t>(plan.previousState));
  preferences_.putUChar(keyFor("tpm", relayIndex).c_str(), static_cast<uint8_t>(plan.previousManualMode));
  preferences_.putUInt(keyFor("tdm", relayIndex).c_str(), plan.durationMinutes);
  preferences_.putBool(keyFor("trp", relayIndex).c_str(), plan.restorePending);
  unlock();
}

void StorageLayer::persistRelayStats(size_t relayIndex, const RelayStats &stats) {
  if (!lock()) {
    return;
  }
  preferences_.putUInt(keyFor("tu", relayIndex).c_str(), stats.timerUses);
  preferences_.putUInt(keyFor("tm", relayIndex).c_str(), stats.totalTimerMinutes);
  preferences_.putULong64(keyFor("os", relayIndex).c_str(), stats.accumulatedOnSeconds);
  preferences_.putULong64(keyFor("lo", relayIndex).c_str(), stats.lastOnEpoch);
  unlock();
}

void StorageLayer::persistRelayEnergyStats(size_t relayIndex, float totalEnergyWh, float lastEnergyWh) {
  if (!lock()) {
    return;
  }
  preferences_.putFloat(keyFor("ewt", relayIndex).c_str(), totalEnergyWh);
  preferences_.putFloat(keyFor("ewl", relayIndex).c_str(), lastEnergyWh);
  unlock();
}

void StorageLayer::persistInterlock(bool enabled) {
  if (!lock()) {
    return;
  }
  preferences_.putBool("interlock", enabled);
  unlock();
}

void StorageLayer::persistEnergyTrackingEnabled(bool enabled) {
  if (!lock()) {
    return;
  }
  preferences_.putBool("energy_en", enabled);
  unlock();
}

void StorageLayer::persistLastCleanupDay(uint32_t dayToken) {
  if (!lock()) {
    return;
  }
  preferences_.putUInt("cleanup_day", dayToken);
  unlock();
}

uint32_t StorageLayer::loadLastCleanupDay() const {
  if (!lock()) {
    return 0;
  }
  const uint32_t day = preferences_.getUInt("cleanup_day", 0);
  unlock();
  return day;
}

void StorageLayer::appendEvent(uint64_t epoch, const String &type, const String &message, int channel) {
  if (!lock()) {
    return;
  }
  DynamicJsonDocument doc(384);
  doc["ts"] = epoch;
  doc["type"] = type;
  doc["msg"] = message;
  if (channel >= 0) {
    doc["channel"] = channel;
  }
  String line;
  serializeJson(doc, line);
  appendLine(FILE_LOGS, line);
  trimFileBySize(FILE_LOGS, LOG_MAX_BYTES);
  unlock();
}

void StorageLayer::appendPending(const String &jsonLine) {
  if (!lock()) {
    return;
  }
  appendLine(FILE_PENDING, jsonLine);
  trimFileBySize(FILE_PENDING, PENDING_MAX_BYTES);
  unlock();
}

void StorageLayer::appendEventJson(const String &jsonLine) {
  if (!lock()) {
    return;
  }
  appendLine(FILE_LOGS, jsonLine);
  trimFileBySize(FILE_LOGS, LOG_MAX_BYTES);
  unlock();
}

String StorageLayer::readRecentLogsJson(uint16_t limit) const {
  if (!lock()) {
    return "[]";
  }
  if (limit == 0) {
    limit = 1;
  }
  if (limit > LOG_FETCH_MAX_ITEMS) {
    limit = LOG_FETCH_MAX_ITEMS;
  }
  File file = LittleFS.open(FILE_LOGS, FILE_READ);
  if (!file) {
    unlock();
    return "[]";
  }

  std::vector<String> ring;
  ring.reserve(limit);
  while (file.available()) {
    String line = file.readStringUntil('\n');
    line.trim();
    if (line.isEmpty()) {
      continue;
    }
    ring.push_back(line);
    if (ring.size() > limit) {
      ring.erase(ring.begin());
    }
  }
  file.close();

  String json = "[";
  for (size_t i = 0; i < ring.size(); ++i) {
    if (i > 0) {
      json += ",";
    }
    json += ring[i];
  }
  json += "]";
  unlock();
  return json;
}

void StorageLayer::flushPending(const std::function<void(const String &line)> &sender) {
  if (!lock()) {
    return;
  }
  File input = LittleFS.open(FILE_PENDING, FILE_READ);
  if (!input) {
    unlock();
    return;
  }
  while (input.available()) {
    String line = input.readStringUntil('\n');
    line.trim();
    if (line.isEmpty()) {
      continue;
    }
    sender(line);
  }
  input.close();
  LittleFS.remove(FILE_PENDING);
  unlock();
}

void StorageLayer::cleanupDaily(uint64_t nowEpoch) {
  if (!lock()) {
    return;
  }
  const uint64_t retentionSeconds = static_cast<uint64_t>(LOG_RETENTION_DAYS) * 86400ULL;
  uint64_t minEpoch = 0;
  if (nowEpoch > retentionSeconds) {
    minEpoch = nowEpoch - retentionSeconds;
  }
  compactByAge(FILE_LOGS, minEpoch);
  compactByAge(FILE_PENDING, minEpoch);
  trimFileBySize(FILE_LOGS, LOG_MAX_BYTES);
  trimFileBySize(FILE_PENDING, PENDING_MAX_BYTES);
  unlock();
}

void StorageLayer::appendLine(const char *path, const String &line) const {
  File file = LittleFS.open(path, FILE_APPEND);
  if (!file) {
    file = LittleFS.open(path, FILE_WRITE);
  }
  if (!file) {
    return;
  }
  file.println(line);
  file.close();
}

void StorageLayer::trimFileBySize(const char *path, uint32_t maxBytes) const {
  File file = LittleFS.open(path, FILE_READ);
  if (!file) {
    return;
  }
  const size_t currentSize = file.size();
  if (currentSize <= maxBytes) {
    file.close();
    return;
  }

  std::vector<String> lines;
  lines.reserve(80);
  const uint32_t target = static_cast<uint32_t>(maxBytes * 0.7f);
  while (file.available()) {
    String line = file.readStringUntil('\n');
    line.trim();
    if (!line.isEmpty()) {
      lines.push_back(line);
    }
  }
  file.close();

  size_t bytes = 0;
  size_t start = lines.size();
  while (start > 0) {
    const size_t lineBytes = lines[start - 1].length() + 1;
    if (bytes + lineBytes > target && start < lines.size()) {
      break;
    }
    bytes += lineBytes;
    --start;
  }

  File output = LittleFS.open(path, FILE_WRITE);
  if (!output) {
    return;
  }
  for (size_t i = start; i < lines.size(); ++i) {
    output.println(lines[i]);
  }
  output.close();
}

bool StorageLayer::parseEpochFromLine(const String &line, uint64_t *epochOut) const {
  if (!epochOut || line.isEmpty()) {
    return false;
  }
  DynamicJsonDocument doc(256);
  DeserializationError err = deserializeJson(doc, line);
  if (err) {
    return false;
  }
  if (!doc["ts"].is<uint64_t>()) {
    return false;
  }
  *epochOut = doc["ts"].as<uint64_t>();
  return true;
}

void StorageLayer::compactByAge(const char *path, uint64_t minEpochToKeep) const {
  File input = LittleFS.open(path, FILE_READ);
  if (!input) {
    return;
  }

  std::vector<String> keptLines;
  keptLines.reserve(120);
  while (input.available()) {
    String line = input.readStringUntil('\n');
    line.trim();
    if (line.isEmpty()) {
      continue;
    }
    uint64_t epoch = 0;
    if (!parseEpochFromLine(line, &epoch) || epoch >= minEpochToKeep) {
      keptLines.push_back(line);
    }
  }
  input.close();

  File output = LittleFS.open(path, FILE_WRITE);
  if (!output) {
    return;
  }
  for (const String &line : keptLines) {
    output.println(line);
  }
  output.close();
}

bool StorageLayer::lock() const {
  if (!ioMutex_) {
    return false;
  }
  return xSemaphoreTake(ioMutex_, pdMS_TO_TICKS(120)) == pdTRUE;
}

void StorageLayer::unlock() const {
  if (ioMutex_) {
    xSemaphoreGive(ioMutex_);
  }
}
