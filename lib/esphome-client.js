'use strict';

// Override the library's frameHelper and plaintextFrameHelper with patched
// versions before the library loads them. Node's module cache ensures the
// library picks up our versions when it does require('./frameHelper') etc.
const Module = require('module');
const path = require('path');
const libUtils = path.dirname(require.resolve('@2colors/esphome-native-api/lib/utils/frameHelper'));

// Pre-populate the cache with our patched/extended implementations
const inject = (file, localFile) => {
  const full = path.join(libUtils, file);
  require.cache[full] = { id: full, filename: full, loaded: true, exports: require(localFile) };
};
inject('messages.js', './messages');
inject('frameHelper.js', './frameHelper');
inject('plaintextFrameHelper.js', './plaintextFrameHelper');

// Register Update entity so the client emits it as newEntity
const entitiesModule = require('@2colors/esphome-native-api/lib/entities');
entitiesModule.Entities['Update'] = require('./UpdateEntity');

const { Client } = require('@2colors/esphome-native-api');
module.exports = { Client };
