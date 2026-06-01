'use strict';

module.exports = [
  {
    method: 'GET',
    path: '/devices',
    fn: async ({ homey }) => {
      return homey.app.getS1ProDevices();
    },
  },
];
