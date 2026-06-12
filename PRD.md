# Sensy One — Homey App PRD

## Overview

Homey app (SDK v3) for the Sensy-One product line. Enables pairing and control of Sensy-One devices directly from Homey, without Home Assistant. First driver: S1 Pro Multi Sense (mmWave presence + environmental sensor).

## Problem

Sensy-One S1 Pro ships with native Home Assistant integration via ESPHome. Homey has no ESPHome support and no Sensy-One driver — the device is invisible to Homey users.

## Goals

- Add S1 Pro to Homey via mDNS auto-discovery or manual IP entry.
- Surface presence detection and environmental sensors as Homey capabilities.
- Enable presence-triggered Homey Flows (lights, alarms, scenes).
- Lay foundation for future Sensy-One devices under one app.

## Out of Scope (v1)

Zone configuration, buzzer/LED control, OTA firmware updates, BLE proxy, SCD40 add-on, zone editor UI.

---

## Device: S1 Pro Multi Sense

**Hardware:** ESP32-C3, Hi-Link LD2450 mmWave radar, Bosch BME688, Lite-On LTR-390UV, WS2812B LED, MLT-8530 buzzer. Optional: Sensirion SCD40.

**Firmware:** ESPHome v1.2.19 (`Sensy-One.S1 Pro Multi Sense`). Exposes:
- Native API — TCP 6053, protobuf, push state updates, no password by default.
- Web server — HTTP 80.
- mDNS — `_esphomelib._tcp`, TXT `project_name=Sensy-One.S1 Pro Multi Sense`.

**Setup:** Device onboards via captive portal AP "I am Sensy!" (`http://192.168.4.1`). After WiFi join, Homey app connects by IP.

---

## Homey Capabilities — v1

| Homey Capability | ESPHome Entity | Notes |
|---|---|---|
| `alarm_motion` | `any_presence` (BinarySensor) | Presence from LD2450 radar |
| `measure_temperature` | `bme688_temperature` | BME688 |
| `measure_humidity` | `bme688_humidity` | BME688 |
| `measure_luminance` | `ltr390_ambient_light__lux_` | LTR-390UV |

## Planned Capabilities — v2+

| Homey Capability | ESPHome Entity |
|---|---|
| `measure_co2` | `scd40_co____concentration` (SCD40 add-on) |
| `measure_pressure` | `bme688_pressure` |
| `alarm_movement` | `any_movement` |
| `measure_iaq` (custom) | `bme688_iaq` |
| `measure_voc` (custom) | `bme688_voc_equivalent` |
| `measure_ultraviolet` (custom) | `ltr390_uv_index` |
| `measure_target_count` (custom) | `all_targets_count` |
| `alarm_zone_1/2/3` (custom) | `zone_1/2/3_presence` |

---

## Pairing Flow

1. User opens Homey app → Add Device → Sensy One → S1 Pro Multi Sense.
2. **Start view** — choose discovery or manual IP.
3. **Discovery** — lists devices found via mDNS `_esphomelib._tcp` filtered by `project_name`. Tap device → added.
4. **Manual** — enter IP (default port 6053, optional API password) → `Homey.createDevice()` → done.
5. Settings (post-pair): host, port, password editable. Change triggers reconnect.

---

## Architecture

```
net.nixdev.s1pro/
├── app.json              SDK v3 manifest, discovery block, driver capabilities
├── app.js                Homey.App (minimal)
├── drivers/s1-pro/
│   ├── driver.js         onPair: mDNS list + manual_add handler
│   ├── device.js         ESPHome Client, state → capability mapping, reconnect
│   └── pair/
│       ├── start.html    Entry: discover vs manual choice
│       └── manual.html   IP/port/password form → Homey.createDevice()
├── patches/              patch-package fix for @2colors/esphome-native-api
└── locales/en.json
```

**Key dependency:** `@2colors/esphome-native-api` — ESPHome native API client. Patched via `patch-package` to handle unknown message types (ESPHome 2026.x sends message ID 116 which the library doesn't recognise; unpatched version closes the connection, dropping all state updates).

**Reconnect:** Exponential backoff 2s→60s. `onDiscoveryAddressChanged` follows DHCP changes. `setUnavailable` on disconnect, `setAvailable` on reconnect.

---

## Future Drivers (same app)

Additional Sensy-One hardware goes under new `drivers/` entries. Shared ESPHome client logic can be extracted to `lib/esphome-device.js` base class when second driver is added.
