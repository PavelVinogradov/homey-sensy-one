Sensy One

Adds support for the Sensy-One S1 Pro Multi Sense (ESPHome-based mmWave
presence and environmental sensor) to Homey.

Features:
- Presence detection (mmWave radar)
- Multi-target count (0-3 people) with flow triggers/conditions
- Temperature, humidity, light level
- CO2 / CO2-equivalent sensors (if SCD40 add-on installed)
- WS2812B LED control (on/off, brightness, color)
- Buzzer sound signals via flow actions
- Firmware update check/install
- Pairing via mDNS discovery or manual IP address
- Zone editor available as an app settings page

Setup:
1. Flash and connect your S1 Pro to Wi-Fi using the on-device captive portal.
2. Add the device in Homey - it will be discovered automatically via mDNS,
   or enter its IP address manually.
3. Sensor values and controls appear as device capabilities, ready for use
   in Homey flows.
