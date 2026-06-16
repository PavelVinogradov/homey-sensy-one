'use strict';

const Homey = require('homey');
const { Client } = require('../../lib/esphome-client');

const ENV_MAP = {
  bme688_temperature: 'measure_temperature',
  bme688_humidity: 'measure_humidity',
  'ltr390_ambient_light__lux_': 'measure_luminance',
  all_targets_count: 'measure_target_count',
  'scd40_co____concentration': 'measure_co2',
  'bme688_co____equivalent': 'measure_co2_equivalent',
};
const PRESENCE_ENTITY = 'any_presence';
const LED_ENTITY = 'ws2812___led';
const BUZZER_ENTITY = 'mlt8530___buzzer';
const BUZZER_PITCH_ENTITY = 'mlt8530_buzzer_pitch';
const BUZZER_VOLUME_ENTITY = 'mlt8530_buzzer_volume';

// Signal definitions: array of [pitchHz, volumeFraction, durationMs, pauseAfterMs]
const SIGNALS = {
  short_beep:  [[2700, 0.8,  80, 0]],
  double_beep: [[2700, 0.8,  80, 100], [2700, 0.8, 80, 0]],
  triple_beep: [[2700, 0.8,  80, 100], [2700, 0.8, 80, 100], [2700, 0.8, 80, 0]],
  long_beep:   [[2700, 0.8, 600, 0]],
  alert:       [[3200, 1.0,  60,  60], [3200, 1.0,  60,  60], [3200, 1.0,  60,  60], [3200, 1.0, 60, 0]],
  success:     [[2000, 0.7, 120, 80],  [2700, 0.7, 120, 80],  [3500, 0.9, 200, 0]],
  warning:     [[3500, 0.9, 150, 80],  [2700, 0.7, 150, 80],  [1800, 0.6, 250, 0]],
};

// Convert Homey hue (0-1) + saturation (0-1) + brightness (0-1) → RGB (0-1 each)
function hsvToRgb(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return [v, t, p];
    case 1: return [q, v, p];
    case 2: return [p, v, t];
    case 3: return [p, q, v];
    case 4: return [t, p, v];
    case 5: return [v, p, q];
  }
}

// Convert RGB (0-1) → Homey hue (0-1), saturation (0-1)
function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d !== 0) {
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h, s, v: max };
}

class S1ProDevice extends Homey.Device {
  async onInit() {
    this.log('S1 Pro device init', this.getName());

    this._presenceState = null;
    this._targetCount = null;
    this._keyToObjectId = new Map();
    this._updateEntity = null;
    this._ledEntity = null;
    this._buzzerEntity = null;
    this._buzzerPitchEntity = null;
    this._buzzerVolumeEntity = null;
    this._singleTargetEntity = null;
    this._reconnectAttempts = 0;
    this._reconnectTimer = null;
    this._destroyed = false;

    this._targetCountTrigger = this.homey.flow.getDeviceTriggerCard('target_count_changed');
    this._targetCountBecameTrigger = this.homey.flow.getDeviceTriggerCard('target_count_became');
    this._targetCountCondition = this.homey.flow.getConditionCard('target_count_condition');

    this._targetCountBecameTrigger.registerRunListener(({ device, count }, state) => {
      return state.count === count;
    });

    this._targetCountCondition.registerRunListener(({ device, operator, count }) => {
      const current = device._targetCount || 0;
      switch (operator) {
        case 'lt':  return current < count;
        case 'lte': return current <= count;
        case 'eq':  return current === count;
        case 'gte': return current >= count;
        case 'gt':  return current > count;
        default:    return false;
      }
    });

    const caps = [
      'alarm_motion',
      'measure_temperature',
      'measure_humidity',
      'measure_luminance',
      'measure_target_count',
      'measure_co2',
      'measure_co2_equivalent',
      'onoff',
      'dim',
      'light_hue',
      'light_saturation',
      'light_mode',
    ];
    for (const cap of caps) {
      if (!this.hasCapability(cap)) {
        await this.addCapability(cap).catch((e) => this.error(`addCapability ${cap}`, e));
      }
    }

    // LED capability listeners
    this.registerCapabilityListener('onoff', (value) => this._ledSetOnOff(value));
    this.registerCapabilityListener('dim', (value) => this._ledSetBrightness(value));
    this.registerCapabilityListener('light_hue', (value) => this._ledSetColor({ hue: value }));
    this.registerCapabilityListener('light_saturation', (value) => this._ledSetColor({ saturation: value }));

    // Flow action: buzzer signal
    this.homey.flow.getActionCard('play_sound_signal')
      .registerRunListener(async ({ device, signal }) => {
        await device._playSignal(signal);
      });

    // Flow action: LED off
    this.homey.flow.getActionCard('led_turn_off')
      .registerRunListener(async ({ device }) => {
        device._ledSetOnOff(false);
        await device.setCapabilityValue('onoff', false).catch(() => {});
      });

    // Flow actions: firmware
    this.homey.flow.getActionCard('install_firmware_update')
      .registerRunListener(async () => {
        if (!this._updateEntity) throw new Error('Update entity not available');
        this._updateEntity.install();
      });

    this.homey.flow.getActionCard('check_firmware_update')
      .registerRunListener(async () => {
        if (!this._updateEntity) throw new Error('Update entity not available');
        this._updateEntity.check();
      });

    await this._connect();
  }

  // ── LED helpers ──────────────────────────────────────────────────────────

  _ledSetOnOff(on) {
    if (!this._ledEntity) return;
    this._ledEntity.command({ state: on });
  }

  _ledSetBrightness(brightness) {
    if (!this._ledEntity) return;
    // brightness controls both master brightness and color brightness
    this._ledEntity.command({ state: true, brightness, colorBrightness: 1 });
  }

  _ledSetColor({ hue, saturation } = {}) {
    if (!this._ledEntity) return;
    const h = hue !== undefined ? hue : this.getCapabilityValue('light_hue') || 0;
    const s = saturation !== undefined ? saturation : this.getCapabilityValue('light_saturation') || 1;
    const v = this.getCapabilityValue('dim') || 1;
    const [r, g, b] = hsvToRgb(h, s, v);
    this._ledEntity.command({ state: true, red: r, green: g, blue: b, colorBrightness: 1, brightness: v });
  }

  _onLedState(state) {
    if (!state) return;
    // Sync Homey caps from device state
    const on = state.state === true;
    this.setCapabilityValue('onoff', on).catch(() => {});

    if (state.brightness != null) {
      this.setCapabilityValue('dim', state.brightness).catch(() => {});
    }

    if (state.red != null && state.green != null && state.blue != null) {
      const { h, s } = rgbToHsv(state.red, state.green, state.blue);
      this.setCapabilityValue('light_hue', h).catch(() => {});
      this.setCapabilityValue('light_saturation', s).catch(() => {});
    }

    // WS2812B is RGB-only, always color mode
    this.setCapabilityValue('light_mode', 'color').catch(() => {});
  }

  // ── Connection ───────────────────────────────────────────────────────────

  async _connect() {
    if (this._destroyed) return;
    const settings = this.getSettings();
    const store = this.getStore();
    const host = settings.host || store.host;
    const port = Number(settings.port || store.port || 6053);
    const password = settings.password || '';

    if (!host) {
      this.error('No host configured');
      await this.setUnavailable('No host configured').catch(() => {});
      return;
    }

    this.log(`Connecting to ${host}:${port}`);
    const client = new Client({
      host,
      port,
      password,
      clientInfo: 'homey-s1pro',
      reconnect: false,
      initializeDeviceInfo: true,
      initializeListEntities: true,
      initializeSubscribeStates: true,
    });

    this._client = client;
    if (client.connection && typeof client.connection.setMaxListeners === 'function') {
      client.connection.setMaxListeners(150);
    }

    client.on('deviceInfo', (info) => {
      const version = info.projectVersion || info.esphomeVersion || '';
      if (version) this.setSettings({ firmware_current: version }).catch(() => {});
    });

    client.on('connected', () => {
      this.log('Native API connected');
      this._reconnectAttempts = 0;
      this.setAvailable().catch(() => {});
    });

    client.on('disconnected', () => {
      this.log('Native API disconnected');
      this.setUnavailable('Disconnected from device').catch(() => {});
      this._scheduleReconnect();
    });

    client.on('error', (err) => {
      this.error('Client error', err && err.message ? err.message : err);
    });

    client.on('newEntity', (entity) => this._onEntity(entity));

    try {
      await client.connect();
    } catch (err) {
      this.error('Connect failed', err && err.message ? err.message : err);
      this._scheduleReconnect();
    }
  }

  _onEntity(entity) {
    const cfg = entity.config || {};
    const objectId = cfg.objectId || cfg.object_id;
    const key = cfg.key;
    if (!objectId || key == null) return;
    this._keyToObjectId.set(key, objectId);

    if (entity.type === 'Update') {
      this._updateEntity = entity;
      entity.on('state', (state) => this._onUpdateState(state));
      this.log('Update entity found:', cfg.name);
      setTimeout(() => { if (this._updateEntity) this._updateEntity.check(); }, 5000);
      return;
    }

    if (entity.type === 'Light' && objectId === LED_ENTITY) {
      this._ledEntity = entity;
      entity.on('state', (state) => this._onLedState(state));
      this.log('LED entity found:', cfg.name);
      return;
    }

    if (entity.type === 'Switch' && objectId === BUZZER_ENTITY) {
      this._buzzerEntity = entity;
      return;
    }

    if (entity.type === 'Switch' && objectId === 'radar___single_target') {
      this._singleTargetEntity = entity;
      entity.on('state', (s) => {
        if (s == null) return;
        this.setSettings({ radar_single_target: s.state === true }).catch(() => {});
      });
      return;
    }

    if (entity.type === 'Number' && objectId === BUZZER_PITCH_ENTITY) {
      this._buzzerPitchEntity = entity;
      return;
    }

    if (entity.type === 'Number' && objectId === BUZZER_VOLUME_ENTITY) {
      this._buzzerVolumeEntity = entity;
      return;
    }

    if (typeof entity.on === 'function') {
      entity.on('state', (state) => this._onState(objectId, state));
    }
  }

  _onState(objectId, state) {
    if (state == null) return;
    const value = state.state;

    if (objectId === PRESENCE_ENTITY) {
      const present = value === true || value === 1;
      if (this._presenceState === present) return;
      this._presenceState = present;
      this.setCapabilityValue('alarm_motion', present).catch((e) =>
        this.error('setCapabilityValue alarm_motion', e && e.message ? e.message : e),
      );
      return;
    }

    const cap = ENV_MAP[objectId];
    if (cap && typeof value === 'number' && !Number.isNaN(value)) {
      this.setCapabilityValue(cap, value).catch((e) =>
        this.error(`setCapabilityValue ${cap}`, e && e.message ? e.message : e),
      );

      if (objectId === 'all_targets_count' && value !== this._targetCount) {
        this._targetCount = value;
        this._targetCountTrigger.trigger(this, { count: value }).catch((e) =>
          this.error('trigger target_count_changed', e && e.message ? e.message : e),
        );
        this._targetCountBecameTrigger.trigger(this, {}, { count: value }).catch((e) =>
          this.error('trigger target_count_became', e && e.message ? e.message : e),
        );
      }
    }
  }

  _onUpdateState(state) {
    if (!state || state.missingState) return;
    const current = state.currentVersion || '';
    const latest = state.latestVersion || '';
    const hasUpdate = latest && current && latest !== current && !state.inProgress;
    this.log(`Firmware: current=${current} latest=${latest} updateAvailable=${hasUpdate}`);
    const update = {};
    if (current) update.firmware_current = current;
    if (latest) update.firmware_latest = latest;
    if (Object.keys(update).length) this.setSettings(update).catch(() => {});
  }

  // ── Buzzer ────────────────────────────────────────────────────────────────

  async _playSignal(signalId) {
    const steps = SIGNALS[signalId];
    if (!steps) throw new Error(`Unknown signal: ${signalId}`);
    if (!this._buzzerEntity) throw new Error('Buzzer entity not available');

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    for (const [pitch, volume, duration, pause] of steps) {
      if (this._buzzerPitchEntity) this._buzzerPitchEntity.command({ state: pitch });
      if (this._buzzerVolumeEntity) this._buzzerVolumeEntity.command({ state: volume });
      this._buzzerEntity.command({ state: true });
      await sleep(duration);
      this._buzzerEntity.command({ state: false });
      if (pause > 0) await sleep(pause);
    }
  }

  // ── Reconnect ─────────────────────────────────────────────────────────────

  _scheduleReconnect() {
    if (this._destroyed) return;
    if (this._reconnectTimer) return;
    const delay = Math.min(60000, 2000 * Math.pow(2, this._reconnectAttempts));
    this._reconnectAttempts += 1;
    this.log(`Reconnect in ${delay}ms (attempt ${this._reconnectAttempts})`);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._connect().catch((e) => this.error('reconnect', e && e.message ? e.message : e));
    }, delay);
  }

  async reconnect() {
    try {
      if (this._client) await this._client.disconnect().catch(() => {});
    } finally {
      this._client = null;
      this._reconnectAttempts = 0;
      await this._connect();
    }
  }

  async onSettings({ newSettings, changedKeys }) {
    if (changedKeys.includes('radar_single_target')) {
      if (this._singleTargetEntity) {
        this._singleTargetEntity.command({ state: newSettings.radar_single_target });
      } else {
        throw new Error('Radar not connected — connect device first');
      }
    }
    if (changedKeys.some((k) => ['host', 'port', 'password'].includes(k))) {
      this.log('Connection settings changed, reconnecting');
      setImmediate(() => this.reconnect().catch((e) => this.error('reconnect on settings', e)));
    }
  }

  async onDiscoveryAvailable(discoveryResult) {
    const host = discoveryResult.address;
    const cur = this.getSettings();
    if (host && host !== cur.host) {
      await this.setSettings({ host });
    }
  }

  async onDiscoveryAddressChanged(discoveryResult) {
    await this.setSettings({ host: discoveryResult.address });
    await this.reconnect();
  }

  async onDeleted() {
    this._destroyed = true;
    if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
    if (this._client) await this._client.disconnect().catch(() => {});
  }
}

module.exports = S1ProDevice;
