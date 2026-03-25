#include "ControlEngine.h"

#include <ArduinoJson.h>
#include <limits.h>

#include "Config.h"
#include "Utils.h"

void ControlEngine::begin(SystemRuntime *runtime, StorageLayer *storage, TimeKeeper *timeKeeper, SemaphoreHandle_t stateMutex) {
  runtime_ = runtime;
  storage_ = storage;
  timeKeeper_ = timeKeeper;
  stateMutex_ = stateMutex;

  // Configure relay outputs and PIR inputs once at boot.
  for (size_t i = 0; i < RELAY_COUNT; ++i) {
    pinMode(RELAY_CONFIG[i].relayPin, OUTPUT);
    digitalWrite(RELAY_CONFIG[i].relayPin, LOW);
  }
  for (size_t i = 0; i < PIR_COUNT; ++i) {
    pinMode(PIR_CONFIG[i].pin, INPUT);
  }

  withLock([&]() {
    const uint64_t nowEpoch = nowEpochLocked();
    for (size_t i = 0; i < RELAY_COUNT; ++i) {
      RelayRuntime &relay = runtime_->relays[i];
      // If a relay was restored ON from flash, restart its open ON window.
      if (relay.appliedState == RelayState::ON && relay.stats.lastOnEpoch == 0) {
        relay.stats.lastOnEpoch = nowEpoch;
      }
    }
  });

  refreshOutputs();
}

void ControlEngine::setEventCallback(EventCallback callback) { eventCallback_ = callback; }

void ControlEngine::tickFast() {
  withLock([&]() {
    const uint64_t nowEpoch = nowEpochLocked();
    runtime_->dayPhase = timeKeeper_->currentDayPhase();
    runtime_->timeValid = timeKeeper_->hasValidTime();

    processPirInputsLocked(nowEpoch);

    Decision decisions[RELAY_COUNT];
    for (size_t i = 0; i < RELAY_COUNT; ++i) {
      decisions[i] = evaluateRelayLocked(i, nowEpoch);
    }
    if (runtime_->interlockEnabled) {
      applyInterlockLocked(&decisions[0], &decisions[1]);
    }
    applyDecisionsLocked(decisions, nowEpoch);
  });
}

void ControlEngine::tickHousekeeping() {
  withLock([&]() {
    const uint64_t nowEpoch = nowEpochLocked();
    if (timeKeeper_->hasValidTime()) {
      const uint32_t dayToken = timeKeeper_->currentDayToken();
      if (dayToken != 0 && dayToken != storage_->loadLastCleanupDay()) {
        storage_->cleanupDaily(nowEpoch);
        storage_->persistLastCleanupDay(dayToken);
        publishEventLocked("TIMER", "storage.cleanup", "Daily log cleanup complete.", -1, false);
      }
    }

    // Persist ON-duration stats infrequently to reduce flash wear.
    if (timeKeeper_->hasValidTime() && (lastStatsFlushEpoch_ == 0 || nowEpoch >= lastStatsFlushEpoch_ + STATS_FLUSH_INTERVAL_SECONDS)) {
      lastStatsFlushEpoch_ = nowEpoch;
      for (size_t i = 0; i < RELAY_COUNT; ++i) {
        RelayRuntime &relay = runtime_->relays[i];
        if (relay.appliedState == RelayState::ON && relay.stats.lastOnEpoch > 0 && nowEpoch > relay.stats.lastOnEpoch) {
          relay.stats.accumulatedOnSeconds += (nowEpoch - relay.stats.lastOnEpoch);
          relay.stats.lastOnEpoch = nowEpoch;
          storage_->persistRelayStats(i, relay.stats);
        }
      }
    }
  });
}

void ControlEngine::refreshOutputs() {
  withLock([&]() {
    for (size_t i = 0; i < RELAY_COUNT; ++i) {
      digitalWrite(RELAY_CONFIG[i].relayPin, runtime_->relays[i].appliedState == RelayState::ON ? HIGH : LOW);
    }
  });
}

bool ControlEngine::setManualMode(size_t relayIndex, RelayMode mode, String *error) {
  if (relayIndex >= RELAY_COUNT) {
    if (error) *error = "Invalid relay index.";
    return false;
  }

  bool accepted = false;
  withLock([&]() {
    // Manual control is valid only while at least one web client is connected.
    if (runtime_->connectedClients == 0) {
      if (error) *error = "Manual control requires an active web client.";
      publishEventLocked("ERROR", "manual.blocked", "Manual command rejected in AUTO mode.", static_cast<int>(relayIndex), true);
      return;
    }

    RelayRuntime &relay = runtime_->relays[relayIndex];

    // Night mode overrides conflicting manual ON requests.
    if (mode == RelayMode::ON && !canTurnOnLocked()) {
      if (error) *error = "Night mode blocks ON actions.";
      publishEventLocked("ERROR", "manual.blocked", "Manual ON blocked by night mode.", static_cast<int>(relayIndex), true);
      return;
    }

    // Manual ON/OFF should immediately override any running timer.
    if (mode != RelayMode::AUTO && relay.timer.active) {
      relay.timer.active = false;
      relay.timer.endEpoch = 0;
      relay.timer.targetState = RelayState::OFF;
      relay.timer.durationMinutes = 0;
      relay.timer.restorePending = false;
      storage_->persistTimer(relayIndex, relay.timer);
      publishEventLocked("TIMER", "timer.canceled", "Timer canceled by manual override.", static_cast<int>(relayIndex), true);
    }

    relay.manualMode = mode;
    storage_->persistManualMode(relayIndex, mode);
    publishEventLocked("TIMER",
                       "manual.changed",
                       "Manual mode set to " + String(relayModeToText(mode)) + ".",
                       static_cast<int>(relayIndex),
                       true);
    accepted = true;
  });
  return accepted;
}

bool ControlEngine::setTimer(size_t relayIndex, uint32_t durationMinutes, RelayState targetState, String *error) {
  if (relayIndex >= RELAY_COUNT) {
    if (error) *error = "Invalid relay index.";
    return false;
  }
  if (durationMinutes == 0) {
    if (error) *error = "Duration must be at least 1 minute.";
    return false;
  }

  bool accepted = false;
  withLock([&]() {
    RelayRuntime &relay = runtime_->relays[relayIndex];
    const uint64_t nowEpoch = nowEpochLocked();

    // Timer is a Manual/Web-mode feature and should not start in AUTO (no clients).
    if (runtime_->connectedClients == 0) {
      if (error) *error = "Timer can start only while a web client is connected.";
      publishEventLocked("ERROR", "timer.blocked", "Timer rejected in AUTO mode (no clients).", static_cast<int>(relayIndex), true);
      return;
    }
    if (!timeKeeper_->hasValidTime()) {
      if (error) *error = "Sync time first (open web page to send device time).";
      publishEventLocked("ERROR", "timer.blocked", "Timer rejected because device time is not valid.", static_cast<int>(relayIndex), true);
      return;
    }

    // Per requirements: timer can only be created while relay is in manual ON/OFF mode.
    if (relay.manualMode == RelayMode::AUTO) {
      if (error) *error = "Set relay to manual ON/OFF before starting a timer.";
      publishEventLocked("ERROR", "timer.blocked", "Timer requires manual ON/OFF mode first.", static_cast<int>(relayIndex), true);
      return;
    }

    if (targetState == RelayState::ON && !canTurnOnLocked()) {
      if (error) *error = "Night mode blocks ON timers.";
      publishEventLocked("ERROR", "timer.blocked", "Timer ON request blocked by night mode.", static_cast<int>(relayIndex), true);
      return;
    }

    TimerPlan plan{};
    plan.active = true;
    plan.targetState = targetState;
    plan.previousState = relay.appliedState;
    plan.previousManualMode = relay.manualMode;
    plan.durationMinutes = durationMinutes;
    plan.restorePending = false;
    plan.endEpoch = nowEpoch + static_cast<uint64_t>(durationMinutes) * 60ULL;
    relay.timer = plan;

    // Allow timer logic to control output while it is active.
    relay.manualMode = RelayMode::AUTO;

    relay.stats.timerUses += 1;
    if (relay.stats.totalTimerMinutes > (UINT32_MAX - durationMinutes)) {
      relay.stats.totalTimerMinutes = UINT32_MAX;
    } else {
      relay.stats.totalTimerMinutes += durationMinutes;
    }

    storage_->persistTimer(relayIndex, plan);
    storage_->persistManualMode(relayIndex, relay.manualMode);
    storage_->persistRelayStats(relayIndex, relay.stats);

    publishEventLocked("TIMER",
                       "timer.started",
                       "Timer started for " + String(durationMinutes) + " minute(s), target " +
                           String(relayStateToText(targetState)) + ".",
                       static_cast<int>(relayIndex),
                       true);
    accepted = true;
  });
  return accepted;
}

bool ControlEngine::cancelTimer(size_t relayIndex) {
  if (relayIndex >= RELAY_COUNT) {
    return false;
  }
  bool canceled = false;
  withLock([&]() {
    RelayRuntime &relay = runtime_->relays[relayIndex];
    if (!relay.timer.active && !relay.timer.restorePending) {
      return;
    }
    relay.timer.active = false;
    relay.timer.endEpoch = 0;
    relay.timer.durationMinutes = 0;
    relay.timer.targetState = RelayState::OFF;
    relay.timer.restorePending = false;
    storage_->persistTimer(relayIndex, relay.timer);
    publishEventLocked("TIMER", "timer.canceled", "Timer canceled.", static_cast<int>(relayIndex), true);
    canceled = true;
  });
  return canceled;
}

void ControlEngine::setInterlock(bool enabled) {
  withLock([&]() {
    runtime_->interlockEnabled = enabled;
    storage_->persistInterlock(enabled);
    publishEventLocked("TIMER",
                       "interlock.changed",
                       String("Interlock ") + (enabled ? "enabled." : "disabled."),
                       -1,
                       true);
  });
}

void ControlEngine::updateConnectedClients(uint16_t clients) {
  withLock([&]() {
    const bool oldManualWeb = runtime_->connectedClients > 0;
    const bool newManualWeb = clients > 0;
    runtime_->connectedClients = clients;

    // Requirement: when no client is connected, system must run in automatic PIR mode.
    if (!newManualWeb) {
      for (size_t i = 0; i < RELAY_COUNT; ++i) {
        RelayRuntime &relay = runtime_->relays[i];
        if (relay.manualMode != RelayMode::AUTO) {
          relay.manualMode = RelayMode::AUTO;
          storage_->persistManualMode(i, relay.manualMode);
          publishEventLocked("TIMER",
                             "manual.auto_reset",
                             String(RELAY_CONFIG[i].name) + " switched to AUTO because all clients disconnected.",
                             static_cast<int>(i),
                             true);
        }
      }
    }

    if (oldManualWeb != newManualWeb) {
      publishEventLocked("TIMER",
                         "mode.changed",
                         newManualWeb ? "System entered MANUAL/WEB mode." : "System entered AUTO/PIR mode.",
                         -1,
                         false);
    }
  });
}

String ControlEngine::buildStateJson() const {
  String payload = "{}";
  withLock([&]() {
    DynamicJsonDocument doc(2200);
    const uint64_t nowEpoch = nowEpochLocked();
    doc["type"] = "state_snapshot";
    doc["ts"] = nowEpoch;
    doc["dayPhase"] = dayPhaseToText(runtime_->dayPhase);
    doc["timeValid"] = runtime_->timeValid;
    doc["connectedClients"] = runtime_->connectedClients;
    doc["systemMode"] = runtime_->connectedClients > 0 ? "MANUAL_WEB" : "AUTO_PIR";
    doc["interlock"] = runtime_->interlockEnabled;
    JsonArray relays = doc.createNestedArray("relays");
    for (size_t i = 0; i < RELAY_COUNT; ++i) {
      JsonObject relay = relays.createNestedObject();
      const RelayRuntime &r = runtime_->relays[i];
      const uint64_t onSeconds = effectiveOnSecondsLocked(r, nowEpoch);
      const float powerWh = (RELAY_CONFIG[i].ratedPowerWatts * static_cast<float>(onSeconds)) / 3600.0f;
      relay["index"] = i;
      relay["name"] = RELAY_CONFIG[i].name;
      relay["state"] = relayStateToText(r.appliedState);
      relay["source"] = sourceToText(r.appliedSource);
      relay["manualMode"] = relayModeToText(r.manualMode);
      relay["timerActive"] = r.timer.active;
      relay["timerEnd"] = r.timer.endEpoch;
      relay["timerTarget"] = relayStateToText(r.timer.targetState);
      relay["timerMinutes"] = r.timer.durationMinutes;
      relay["autoHoldUntil"] = r.autoHoldUntilEpoch;
      relay["timerUses"] = r.stats.timerUses;
      relay["totalTimerMinutes"] = r.stats.totalTimerMinutes;
      relay["onSeconds"] = onSeconds;
      relay["powerWh"] = powerWh;
      relay["powerW"] = RELAY_CONFIG[i].ratedPowerWatts;
    }
    JsonArray pirs = doc.createNestedArray("pirs");
    for (size_t i = 0; i < PIR_COUNT; ++i) {
      JsonObject pir = pirs.createNestedObject();
      const PirRuntime &p = runtime_->pirs[i];
      pir["index"] = i;
      pir["name"] = PIR_CONFIG[i].name;
      pir["value"] = p.stableValue;
      pir["lastTrigger"] = p.lastTriggerEpoch;
    }
    serializeJson(doc, payload);
  });
  return payload;
}

String ControlEngine::buildTimerJson(size_t relayIndex) const {
  if (relayIndex >= RELAY_COUNT) {
    return "{}";
  }
  String payload = "{}";
  withLock([&]() {
    DynamicJsonDocument doc(384);
    const RelayRuntime &relay = runtime_->relays[relayIndex];
    doc["type"] = "timer_status";
    doc["channel"] = relayIndex;
    doc["active"] = relay.timer.active;
    doc["endEpoch"] = relay.timer.endEpoch;
    doc["target"] = relayStateToText(relay.timer.targetState);
    doc["minutes"] = relay.timer.durationMinutes;
    serializeJson(doc, payload);
  });
  return payload;
}

uint64_t ControlEngine::nowEpochLocked() const {
  uint64_t epoch = timeKeeper_->nowEpoch();
  if (epoch == 0) {
    epoch = millis() / 1000ULL;
  }
  return epoch;
}

bool ControlEngine::canTurnOnLocked() const {
  if (!timeKeeper_->hasValidTime()) {
    return true;
  }
  return runtime_->dayPhase == DayPhase::DAY;
}

void ControlEngine::processPirInputsLocked(uint64_t nowEpoch) {
  const bool pirAllowed = runtime_->connectedClients == 0;

  for (size_t i = 0; i < PIR_COUNT; ++i) {
    PirRuntime &pir = runtime_->pirs[i];
    const bool raw = digitalRead(PIR_CONFIG[i].pin) == HIGH;
    if (raw != pir.rawValue) {
      pir.rawValue = raw;
      pir.lastChangeMs = millis();
    }

    const bool debouncePassed = (millis() - pir.lastChangeMs) >= PIR_DEBOUNCE_MS;
    if (!debouncePassed || pir.stableValue == pir.rawValue) {
      continue;
    }

    pir.stableValue = pir.rawValue;
    if (!pir.stableValue) {
      continue;
    }

    // Automatic mode only: ignore PIR while web clients are connected.
    if (!pirAllowed) {
      continue;
    }
    if (!canTurnOnLocked()) {
      publishEventLocked("ERROR", "pir.blocked", "Motion ignored by night mode.", static_cast<int>(i), true);
      continue;
    }

    pir.lastTriggerEpoch = nowEpoch;
    for (size_t relayIndex = 0; relayIndex < RELAY_COUNT; ++relayIndex) {
      if ((PIR_CONFIG[i].relayMask & (1 << relayIndex)) == 0) {
        continue;
      }
      RelayRuntime &relay = runtime_->relays[relayIndex];
      relay.autoHoldUntilEpoch = max(relay.autoHoldUntilEpoch, nowEpoch + PIR_HOLD_SECONDS);
    }
    publishEventLocked("TIMER",
                       "pir.motion",
                       String("Motion detected on ") + PIR_CONFIG[i].name + ".",
                       static_cast<int>(i),
                       true);
  }
}

ControlEngine::Decision ControlEngine::evaluateRelayLocked(size_t relayIndex, uint64_t nowEpoch) {
  RelayRuntime &relay = runtime_->relays[relayIndex];

  if (relay.timer.active && nowEpoch >= relay.timer.endEpoch) {
    relay.timer.active = false;
    relay.timer.endEpoch = 0;
    relay.timer.targetState = RelayState::OFF;
    relay.timer.durationMinutes = 0;
    relay.timer.restorePending = true;

    // Timer lifecycle requirement: return to AUTO at timer end.
    relay.manualMode = RelayMode::AUTO;

    storage_->persistTimer(relayIndex, relay.timer);
    storage_->persistManualMode(relayIndex, relay.manualMode);
    publishEventLocked("TIMER", "timer.ended", "Timer ended, restoring previous state.", static_cast<int>(relayIndex), true);
  }

  Decision out{};
  out.state = RelayState::OFF;
  out.source = ControlSource::NONE;

  // Apply one-shot restoration from saved pre-timer state.
  if (relay.timer.restorePending) {
    out.state = relay.timer.previousState;
    out.source = ControlSource::TIMER;
    relay.timer.restorePending = false;
    storage_->persistTimer(relayIndex, relay.timer);
    return out;
  }

  const bool manualWebMode = runtime_->connectedClients > 0;

  // Manual has highest priority, but only in Manual/Web mode.
  if (manualWebMode && relay.manualMode == RelayMode::ON) {
    out.state = RelayState::ON;
    out.source = ControlSource::MANUAL;
  } else if (manualWebMode && relay.manualMode == RelayMode::OFF) {
    out.state = RelayState::OFF;
    out.source = ControlSource::MANUAL;
  } else if (relay.timer.active) {
    out.state = relay.timer.targetState;
    out.source = ControlSource::TIMER;
  } else if (nowEpoch < relay.autoHoldUntilEpoch) {
    out.state = RelayState::ON;
    out.source = ControlSource::PIR;
  }

  // Day/Night safety may force OFF for conflicting ON decisions.
  if (out.state == RelayState::ON && !canTurnOnLocked()) {
    out.state = RelayState::OFF;
    if (out.source != ControlSource::MANUAL) {
      out.source = ControlSource::NONE;
    }
  }
  return out;
}

void ControlEngine::applyInterlockLocked(Decision *d0, Decision *d1) {
  if (!d0 || !d1) {
    return;
  }
  if (d0->state != RelayState::ON || d1->state != RelayState::ON) {
    return;
  }

  const uint8_t p0 = sourcePriority(d0->source);
  const uint8_t p1 = sourcePriority(d1->source);
  if (p0 > p1) {
    d1->state = RelayState::OFF;
    d1->source = ControlSource::NONE;
    return;
  }
  if (p1 > p0) {
    d0->state = RelayState::OFF;
    d0->source = ControlSource::NONE;
    return;
  }

  // If equal priority, keep the relay that was already ON.
  if (runtime_->relays[0].appliedState == RelayState::ON && runtime_->relays[1].appliedState == RelayState::OFF) {
    d1->state = RelayState::OFF;
    d1->source = ControlSource::NONE;
  } else {
    d0->state = RelayState::OFF;
    d0->source = ControlSource::NONE;
  }
}

void ControlEngine::applyDecisionsLocked(const Decision decisions[RELAY_COUNT], uint64_t nowEpoch) {
  for (size_t i = 0; i < RELAY_COUNT; ++i) {
    RelayRuntime &relay = runtime_->relays[i];
    const RelayState oldState = relay.appliedState;
    const ControlSource oldSource = relay.appliedSource;

    relay.appliedState = decisions[i].state;
    relay.appliedSource = decisions[i].source;

    if (oldState == relay.appliedState && oldSource == relay.appliedSource) {
      if (relay.appliedState == RelayState::ON && relay.stats.lastOnEpoch == 0) {
        relay.stats.lastOnEpoch = nowEpoch;
      }
      continue;
    }

    if (oldState == RelayState::ON) {
      closeActiveOnWindowLocked(relay, nowEpoch);
    }
    if (relay.appliedState == RelayState::ON) {
      relay.stats.lastOnEpoch = nowEpoch;
    }

    digitalWrite(RELAY_CONFIG[i].relayPin, relay.appliedState == RelayState::ON ? HIGH : LOW);
    storage_->persistRelayState(i, relay.appliedState, relay.appliedSource);
    storage_->persistRelayStats(i, relay.stats);

    publishEventLocked(relay.appliedState == RelayState::ON ? "ON" : "OFF",
                       "relay.changed",
                       String(RELAY_CONFIG[i].name) + " -> " + relayStateToText(relay.appliedState) +
                           " via " + sourceToText(relay.appliedSource) + ".",
                       static_cast<int>(i),
                       true);
  }
}

void ControlEngine::publishEventLocked(const String &logType,
                                       const String &eventName,
                                       const String &msg,
                                       int channel,
                                       bool bufferIfOffline) const {
  if (!eventCallback_) {
    return;
  }
  DynamicJsonDocument doc(448);
  doc["type"] = logType;   // ON, OFF, TIMER, ERROR
  doc["event"] = eventName;
  doc["msg"] = msg;
  doc["ts"] = nowEpochLocked();
  if (channel >= 0) {
    doc["channel"] = channel;
  }
  String line;
  serializeJson(doc, line);
  eventCallback_(line, bufferIfOffline);
}

uint64_t ControlEngine::effectiveOnSecondsLocked(const RelayRuntime &relay, uint64_t nowEpoch) const {
  uint64_t total = relay.stats.accumulatedOnSeconds;
  if (relay.appliedState == RelayState::ON && relay.stats.lastOnEpoch > 0 && nowEpoch > relay.stats.lastOnEpoch) {
    total += (nowEpoch - relay.stats.lastOnEpoch);
  }
  return total;
}

void ControlEngine::closeActiveOnWindowLocked(RelayRuntime &relay, uint64_t nowEpoch) {
  if (relay.stats.lastOnEpoch > 0 && nowEpoch > relay.stats.lastOnEpoch) {
    relay.stats.accumulatedOnSeconds += (nowEpoch - relay.stats.lastOnEpoch);
  }
  relay.stats.lastOnEpoch = 0;
}

bool ControlEngine::withLock(const std::function<void()> &fn) const {
  if (!fn || !stateMutex_) {
    return false;
  }
  if (xSemaphoreTake(stateMutex_, pdMS_TO_TICKS(80)) != pdTRUE) {
    return false;
  }
  fn();
  xSemaphoreGive(stateMutex_);
  return true;
}

uint8_t ControlEngine::sourcePriority(ControlSource source) {
  switch (source) {
    case ControlSource::MANUAL:
      return 3;
    case ControlSource::TIMER:
      return 2;
    case ControlSource::PIR:
      return 1;
    default:
      return 0;
  }
}
