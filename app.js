'use strict';

const Homey = require('homey');

class S1ProApp extends Homey.App {
  async onInit() {
    this.log('Sensy-One S1 Pro app started');
  }

  // Called by api.js
  getS1ProDevices() {
    const driver = this.homey.drivers.getDriver('s1-pro');
    return driver.getDevices().map((d) => ({
      id: d.getData().id,
      name: d.getName(),
      ip: d.getSettings().host || '',
    })).filter((d) => d.ip);
  }
}

module.exports = S1ProApp;
