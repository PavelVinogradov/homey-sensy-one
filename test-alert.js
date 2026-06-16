'use strict';

const { Client } = require('./lib/esphome-client');

const HOST = process.argv[2] || '192.168.1.169';
const PORT = 6053;

const SVC_ARG = { BOOL: 0, INT: 1, FLOAT: 2, STRING: 3 };

const ALERTS = [
  {
    title: 'Hello from Homey',
    message: 'Basic text alert — plain message, no sound.',
    sound: false,
  },
  {
    title: 'Air Quality OK',
    message: 'CO₂ within normal range. Ventilation not needed.',
    sound: false,
  },
  {
    title: '⚠ High CO₂',
    message: 'CO₂ above 1200 ppm. Please open a window!',
    sound: true,
  },
  {
    title: 'Reminder',
    message: 'This is a timed reminder message. Duration: 15 s.',
    sound: false,
  },
  {
    title: 'Homey Flow',
    message: 'Triggered by automation. Alert will auto-dismiss.',
    sound: false,
  },
];

const DURATION = 15;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  const client = new Client({
    host: HOST,
    port: PORT,
    password: '',
    clientInfo: 'homey-alert-test',
    reconnect: false,
    initializeDeviceInfo: true,
    initializeListEntities: true,
    initializeSubscribeStates: false,
  });

  const services = {};

  client.connection.on('message.ListEntitiesServicesResponse', (svc) => {
    services[svc.name] = svc.key;
    console.log(`  service: ${svc.name} key=${svc.key}`);
  });

  await new Promise((resolve, reject) => {
    client.on('error', reject);
    client.on('initialized', resolve);
    client.connect();
  });

  console.log(`Connected to ${HOST}:${PORT}`);
  console.log('Services:', services);

  const showKey = services['show_display_alert'];
  if (!showKey) throw new Error('show_display_alert service not found');

  for (let i = 0; i < ALERTS.length; i++) {
    const { title, message, sound } = ALERTS[i];
    console.log(`\n[${i + 1}/${ALERTS.length}] "${title}"`);
    console.log(`        "${message}"`);
    console.log(`        sound=${sound} duration=${DURATION}s`);

    client.connection.executeServiceService({
      key: showKey,
      args: [
        { type: SVC_ARG.STRING, value: title },
        { type: SVC_ARG.STRING, value: message },
        { type: SVC_ARG.INT,    value: DURATION },
        { type: SVC_ARG.BOOL,   value: sound },
        { type: SVC_ARG.INT,    value: sound ? 1000 : 0 },
      ],
    });

    if (i < ALERTS.length - 1) {
      console.log(`  waiting ${DURATION}s...`);
      await sleep(DURATION * 1000);
    }
  }

  console.log('\nAll alerts sent. Disconnecting.');
  client.disconnect();
}

run().catch((e) => { console.error(e); process.exit(1); });
