#include "TimeKeeper.h"

#include <cstring>
#include <sys/time.h>
#include <WiFi.h>
#include <time.h>

#include "Config.h"

namespace {
constexpr char NTP_SERVER_1[] = "pool.ntp.org";
constexpr char NTP_SERVER_2[] = "time.nist.gov";
constexpr char TZ_RULE[] = "EET-2EEST,M4.5.5/0,M10.5.4/0";
constexpr uint32_t NTP_RETRY_MS = 45 * 1000;
constexpr uint32_t PERSIST_INTERVAL_SECONDS = 600;
}  // namespace

void TimeKeeper::begin(Preferences *prefs) {
  prefs_ = prefs;
  setenv("TZ", TZ_RULE, 1);
  tzset();
  configTime(0, 0, NTP_SERVER_1, NTP_SERVER_2);

  if (prefs_) {
    const uint64_t storedEpoch = prefs_->getULong64("last_epoch", 0);
    if (storedEpoch > 1700000000ULL) {
      setEpoch(storedEpoch);
      lastPersistedEpoch_ = storedEpoch;
    }
  }
}

bool TimeKeeper::syncFromClient(uint64_t epochSeconds) {
  if (epochSeconds < 1700000000ULL) {
    return false;
  }
  setEpoch(epochSeconds);
  persistEpoch(epochSeconds);
  return true;
}

bool TimeKeeper::syncFromHms(int hour, int minute, int second) {
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    return false;
  }

  uint64_t reference = nowEpoch();
  if (reference < 1700000000ULL && prefs_) {
    reference = prefs_->getULong64("last_epoch", 0);
  }
  if (reference < 1700000000ULL) {
    // Fallback date anchor when only HH:MM:SS is supplied on a brand-new device.
    reference = 1704067200ULL + (millis() / 1000ULL);  // 2024-01-01 00:00:00 UTC + uptime
  }

  struct tm info;
  if (!buildTimeStruct(reference, &info)) {
    return false;
  }
  info.tm_hour = hour;
  info.tm_min = minute;
  info.tm_sec = second;
  info.tm_isdst = -1;

  const time_t raw = mktime(&info);
  if (raw <= 0) {
    return false;
  }

  setEpoch(static_cast<uint64_t>(raw));
  persistEpoch(static_cast<uint64_t>(raw));
  return true;
}

bool TimeKeeper::syncFromDateTime(int year, int month, int day, int hour, int minute, int second) {
  if (year < 2024 || month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 ||
      minute > 59 || second < 0 || second > 59) {
    return false;
  }

  struct tm info;
  memset(&info, 0, sizeof(info));
  info.tm_year = year - 1900;
  info.tm_mon = month - 1;
  info.tm_mday = day;
  info.tm_hour = hour;
  info.tm_min = minute;
  info.tm_sec = second;
  info.tm_isdst = -1;

  const time_t raw = mktime(&info);
  if (raw <= 0) {
    return false;
  }
  setEpoch(static_cast<uint64_t>(raw));
  persistEpoch(static_cast<uint64_t>(raw));
  return true;
}

bool TimeKeeper::trySyncFromNtp() {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }
  const uint32_t nowMs = millis();
  if (nowMs - lastNtpAttemptMs_ < NTP_RETRY_MS) {
    return false;
  }
  lastNtpAttemptMs_ = nowMs;

  struct tm localTm;
  if (!getLocalTime(&localTm, 1500)) {
    return false;
  }
  const time_t raw = mktime(&localTm);
  if (raw <= 0) {
    return false;
  }
  setEpoch(static_cast<uint64_t>(raw));
  persistEpoch(static_cast<uint64_t>(raw));
  return true;
}

uint64_t TimeKeeper::nowEpoch() const {
  if (!timeValid_) {
    return 0;
  }
  const uint32_t elapsedMs = millis() - baseMillis_;
  return baseEpoch_ + (elapsedMs / 1000ULL);
}

bool TimeKeeper::hasValidTime() const { return timeValid_; }

DayPhase TimeKeeper::currentDayPhase() const {
  if (!timeValid_) {
    return DayPhase::DAY;
  }
  struct tm info;
  if (!buildTimeStruct(nowEpoch(), &info)) {
    return DayPhase::DAY;
  }
  if (info.tm_hour >= DAY_START_HOUR && info.tm_hour < NIGHT_START_HOUR) {
    return DayPhase::DAY;
  }
  return DayPhase::NIGHT;
}

uint32_t TimeKeeper::currentDayToken() const {
  if (!timeValid_) {
    return 0;
  }
  struct tm info;
  if (!buildTimeStruct(nowEpoch(), &info)) {
    return 0;
  }
  return static_cast<uint32_t>((info.tm_year + 1900) * 10000 + (info.tm_mon + 1) * 100 + info.tm_mday);
}

void TimeKeeper::maybePersistSyncPoint() {
  if (!timeValid_) {
    return;
  }
  const uint64_t epoch = nowEpoch();
  if (epoch < 1700000000ULL) {
    return;
  }
  if (lastPersistedEpoch_ != 0 && (epoch - lastPersistedEpoch_) < PERSIST_INTERVAL_SECONDS) {
    return;
  }
  persistEpoch(epoch);
}

void TimeKeeper::setEpoch(uint64_t epochSeconds) {
  baseEpoch_ = epochSeconds;
  baseMillis_ = millis();
  timeValid_ = true;

  // Keep ESP32 system clock aligned so standard time helpers stay consistent.
  struct timeval tv;
  tv.tv_sec = static_cast<time_t>(epochSeconds);
  tv.tv_usec = 0;
  settimeofday(&tv, nullptr);
}

void TimeKeeper::persistEpoch(uint64_t epochSeconds) {
  if (!prefs_ || epochSeconds < 1700000000ULL) {
    return;
  }
  prefs_->putULong64("last_epoch", epochSeconds);
  lastPersistedEpoch_ = epochSeconds;
}

bool TimeKeeper::buildTimeStruct(uint64_t epochSeconds, struct tm *out) const {
  if (!out) {
    return false;
  }
  time_t raw = static_cast<time_t>(epochSeconds);
  struct tm temp;
#if defined(ESP32)
  if (!localtime_r(&raw, &temp)) {
    return false;
  }
#else
  temp = *localtime(&raw);
#endif
  *out = temp;
  return true;
}
