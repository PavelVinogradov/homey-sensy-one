'use strict';

const { pb } = require('./messages');
const Base = require('@2colors/esphome-native-api/lib/entities/Base');

// UpdateStateResponse fields:
//   bool in_progress, bool has_progress, float progress
//   string current_version, string latest_version
//   string title, string release_summary, string release_url

class Update extends Base {
  constructor(data) {
    super(data);
  }

  static commandService(connection, { key, command }) {
    if (!connection) throw new Error('connection is not attached');
    const msg = new pb.UpdateCommandRequest();
    msg.setKey(key);
    msg.setCommand(command);
    connection.sendCommandMessage(msg);
  }

  command(data) {
    this.constructor.commandService(this.connection, { ...data, key: this.config.key });
  }

  // Trigger firmware install
  install() {
    this.command({ command: 1 }); // UPDATE_COMMAND_UPDATE = 1
  }

  // Re-check for available update
  check() {
    this.command({ command: 2 }); // UPDATE_COMMAND_CHECK = 2
  }
}

module.exports = Update;
