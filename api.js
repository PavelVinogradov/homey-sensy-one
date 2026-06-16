'use strict';

module.exports = [
  {
    method: 'GET',
    path: '/devices',
    fn: async ({ homey }) => {
      return homey.app.getS1ProDevices();
    },
  },
  {
    method: 'POST',
    path: '/device/:id/host',
    fn: async ({ homey, params, body }) => {
      const driver = homey.drivers.getDriver('airdot');
      const devices = driver.getDevices();
      const device = devices.find((d) => d.getData().id === params.id || d.getName() === params.id);
      if (!device) throw new Error(`Device not found: ${params.id}`);
      await device.setSettings({ host: body.host, port: Number(body.port) || 6053 });
      await device.reconnect();
      return { ok: true, host: body.host };
    },
  },
];
