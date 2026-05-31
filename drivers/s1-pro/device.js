'use strict';

const Homey = require('homey');
const { Client } = require('../../lib/esphome-client');

// Entity object_ids we surface to Homey capabilities.
const ENV_MAP = {
  bme688_temperature: 'measure_temperature',
  bme688_humidity: 'measure_humidity',
  'ltr390_ambient_light__lux_': 'measure_luminance',
};
const PRESENCE_ENTITY = 'any_presence';

class S1ProDevice extends Homey.Device {
  async onInit() {
    this.log('S1 Pro device init', this.getName());

    this._presenceState = null;
    this._keyToObjectId = new Map();
    this._reconnectAttempts = 0;
    this._reconnectTimer = null;
    this._destroyed = false;

    for (const cap of ['alarm_motion', 'measure_temperature', 'measure_humidity', 'measure_luminance']) {
      if (!this.hasCapability(cap)) {
        await this.addCapability(cap).catch((e) => this.error(`addCapability ${cap}`, e));
      }
    }

    await this._connect();
  }

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
      initializeListEntities: true,
      initializeSubscribeStates: true,
    });

    this._client = client;

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
    }
  }

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
