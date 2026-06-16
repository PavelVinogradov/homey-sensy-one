# CommSensyOne for Homey

Homey app (`net.nixdev.sensyone`) for [Sensy-One](https://sensy-one.com) sensors: **S1 Pro Multi Sense** (mmWave presence) and **AirDot** (air quality).

> **AS-IS.** This is a personal project, not an official Sensy-One product. No guarantees of correctness, stability, or continued maintenance. Use at your own risk.

---

## Supported Devices

### S1 Pro Multi Sense
mmWave radar presence sensor with environmental monitoring.

**Capabilities**
- Presence detection (`alarm_motion`)
- Target count (up to 3 simultaneous targets)
- Temperature, humidity, luminance
- CO₂ (SCD40), CO₂ equivalent (BME688)
- RGB LED control
- Buzzer (flow actions: short beep, double beep, alert, success, warning, …)

**Configurable settings** (synced bidirectionally with device)
- Single target mode — track 1 target vs up to 3
- Flip Y axis — for upside-down mounting
- Detection range — 0–1800 cm
- Presence clear delay — 0–3600 s hold-off after targets disappear

### AirDot
Indoor air quality monitor with display.

**Capabilities**
- Temperature, humidity, luminance
- CO₂, pressure
- PM1, PM2.5, PM4, PM10
- VOC index, NOx index

**Flow actions**
- Show display alert (title, message, duration, optional sound)
- Clear display alert
- Check / install firmware update

---

## Requirements

- Homey Pro (local LAN access)
- Sensy-One device on the same network
- ESPHome native API enabled on the device (default: port 6053, no password)

---

## Installation

Not published to the Homey App Store. Install via Homey CLI:

```bash
npm install -g homey
homey app install
```

---

## Settings

All settings screens are grouped:

| Group | Fields |
|---|---|
| Device connection | IP address / hostname, Native API port, API password |
| Device firmware | Current version, Latest version |
| Device settings *(S1 Pro only)* | Radar mode, flip axis, detection range, presence delay |

Firmware versions are populated automatically on connect. "Latest version" is fetched from the GitHub release manifest at connect time.

---

## Flow Cards

### S1 Pro
| Type | Card |
|---|---|
| Trigger | Target count changed |
| Trigger | Target count became N |
| Condition | Target count comparison |
| Action | Play sound signal |
| Action | Turn off LED |
| Action | Check firmware update |
| Action | Install firmware update |

### AirDot
| Type | Card |
|---|---|
| Action | Show display alert |
| Action | Clear display alert |
| Action | Check firmware update |
| Action | Install firmware update |

---

## Connection

Uses the [ESPHome Native API](https://esphome.io/components/api.html) (TCP port 6053, protobuf) via [`@2colors/esphome-native-api`](https://www.npmjs.com/package/@2colors/esphome-native-api). Supports mDNS discovery and manual IP entry. Reconnects automatically with exponential backoff.

---

## License

MIT. No warranty. See [LICENSE](LICENSE).
