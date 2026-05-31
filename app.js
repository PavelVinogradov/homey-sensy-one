'use strict';

const Homey = require('homey');

class S1ProApp extends Homey.App {
  async onInit() {
    this.log('Sensy-One S1 Pro app started');
  }
}

module.exports = S1ProApp;
