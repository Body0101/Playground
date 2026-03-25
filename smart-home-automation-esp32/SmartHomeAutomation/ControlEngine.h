#pragma once

#include <Arduino.h>
#include <functional>

#include "StorageLayer.h"
#include "SystemTypes.h"
#include "TimeKeeper.h"

class ControlEngine {
 public:
  using EventCallback = std::function<void(const String &eventJson, bool bufferIfOffline)>;

  void begin(SystemRuntime *runtime, StorageLayer *storage, TimeKeeper *timeKeeper, SemaphoreHandle_t stateMutex);
  void setEventCallback(EventCallback callback);

  void tickFast();
  void tickHousekeeping();
  void refreshOutputs();

  bool setManualMode(size_t relayIndex, RelayMode mode, String *error);
  bool setTimer(size_t relayIndex, uint32_t durationMinutes, RelayState targetState, String *error);
  bool cancelTimer(size_t relayIndex);
  void setInterlock(bool enabled);
  void updateConnectedClients(uint16_t clients);

  String buildStateJson() const;
  String buildTimerJson(size_t relayIndex) const;

 private:
  struct Decision {
    RelayState state;
    ControlSource source;
  };

  void publishEventLocked(const String &logType,
                          const String &eventName,
                          const String &msg,
                          int channel,
                          bool bufferIfOffline) const;
  uint64_t nowEpochLocked() const;
  bool canTurnOnLocked() const;
  void processPirInputsLocked(uint64_t nowEpoch);
  Decision evaluateRelayLocked(size_t relayIndex, uint64_t nowEpoch);
  void applyInterlockLocked(Decision *d0, Decision *d1);
  void applyDecisionsLocked(const Decision decisions[RELAY_COUNT], uint64_t nowEpoch);
  uint64_t effectiveOnSecondsLocked(const RelayRuntime &relay, uint64_t nowEpoch) const;
  void closeActiveOnWindowLocked(RelayRuntime &relay, uint64_t nowEpoch);
  bool withLock(const std::function<void()> &fn) const;
  static uint8_t sourcePriority(ControlSource source);

  SystemRuntime *runtime_ = nullptr;
  StorageLayer *storage_ = nullptr;
  TimeKeeper *timeKeeper_ = nullptr;
  SemaphoreHandle_t stateMutex_ = nullptr;
  EventCallback eventCallback_;
  uint64_t lastStatsFlushEpoch_ = 0;
};
