#pragma once

#include <Arduino.h>
#include <Preferences.h>
#include "SystemTypes.h"

class TimeKeeper {
 public:
  void begin(Preferences *prefs);
  bool syncFromClient(uint64_t epochSeconds);
  bool syncFromHms(int hour, int minute, int second);
  bool syncFromDateTime(int year, int month, int day, int hour, int minute, int second);
  bool trySyncFromNtp();
  uint64_t nowEpoch() const;
  bool hasValidTime() const;
  DayPhase currentDayPhase() const;
  uint32_t currentDayToken() const;
  void maybePersistSyncPoint();

 private:
  void persistEpoch(uint64_t epochSeconds);
  void setEpoch(uint64_t epochSeconds);
  bool buildTimeStruct(uint64_t epochSeconds, struct tm *out) const;

  Preferences *prefs_ = nullptr;
  uint64_t baseEpoch_ = 0;
  uint32_t baseMillis_ = 0;
  bool timeValid_ = false;
  uint32_t lastNtpAttemptMs_ = 0;
  uint64_t lastPersistedEpoch_ = 0;
};
