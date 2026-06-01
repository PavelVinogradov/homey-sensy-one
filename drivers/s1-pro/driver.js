'use strict';

const Homey = require('homey');

class S1ProDriver extends Homey.Driver {
  async onInit() {
    this.log('S1 Pro driver init');
    this._manualCandidates = [];
  }

  /**
   * Build a device descriptor from an mDNS discovery result.
   * The discovery system feeds these into the pair `list_devices` view.
   */
  _deviceFromDiscovery(discoveryResult) {
    const txt = discoveryResult.txt || {};
    const mac = (txt.mac || discoveryResult.id || '').toLowerCase();
    const name = txt.friendly_name || discoveryResult.name || 'S1 Pro Multi Sense';
    return {
      name,
      data: { id: mac || `${discoveryResult.address}:${discoveryResult.port}` },
      store: {
        host: discoveryResult.address,
        port: 6053,
      },
      settings: {
        host: discoveryResult.address,
        port: 6053,
        password: '',
      },
    };
  }

  async onPair(session) {
    session.setHandler('list_devices', async () => {
      const strategy = this.getDiscoveryStrategy();
      const results = strategy.getDiscoveryResults();
      const discovered = Object.values(results).map((r) => this._deviceFromDiscovery(r));
      return [...discovered, ...this._manualCandidates];
    });

    session.setHandler('manual_add', async ({ host, port, password }) => {
      if (!host) throw new Error('Host required');
      const p = Number(port) || 6053;
      return {
        name: `S1 Pro @ ${host}`,
        data: { id: `manual:${host}:${p}` },
        store: { host, port: p },
        settings: { host, port: p, password: password || '' },
      };
    });
  }

  onRepair(session, device) {
    // Pre-fill current settings into the repair view
    session.setHandler('getSettings', async () => ({
      host: device.getSetting('host') || '',
      port: device.getSetting('port') || 6053,
    }));

    session.setHandler('repair', async ({ host, port, password }) => {
      if (!host) throw new Error('Host required');
      const p = Number(port) || 6053;
      const pw = password || '';

      // Test connection before saving
      const { Client } = require('../../lib/esphome-client');
      const client = new Client({
        host, port: p, password: pw,
        clientInfo: 'homey-s1pro-repair',
        reconnect: false,
        initializeListEntities: false,
        initializeSubscribeStates: false,
      });

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          client.disconnect().catch(() => {});
          reject(new Error(`Cannot connect to ${host}:${p}`));
        }, 8000);
        client.on('connected', () => {
          clearTimeout(timeout);
          client.disconnect().catch(() => {});
          resolve();
        });
        client.on('error', (err) => {
          clearTimeout(timeout);
          reject(new Error(err && err.message ? err.message : String(err)));
        });
        client.connect().catch(reject);
      });

      await device.setSettings({ host, port: p, password: pw });
      await device.reconnect();
      return true;
    });
  }
}

module.exports = S1ProDriver;
