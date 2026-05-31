'use strict';

// Override the library's frameHelper and plaintextFrameHelper with patched
// versions before the library loads them. Node's module cache ensures the
// library picks up our versions when it does require('./frameHelper') etc.
const Module = require('module');
const path = require('path');
const libUtils = path.dirname(require.resolve('@2colors/esphome-native-api/lib/utils/frameHelper'));

// Pre-populate the cache with our patched implementations
require.cache[path.join(libUtils, 'frameHelper.js')] = {
  id: path.join(libUtils, 'frameHelper.js'),
  filename: path.join(libUtils, 'frameHelper.js'),
  loaded: true,
  exports: require('./frameHelper'),
};
require.cache[path.join(libUtils, 'plaintextFrameHelper.js')] = {
  id: path.join(libUtils, 'plaintextFrameHelper.js'),
  filename: path.join(libUtils, 'plaintextFrameHelper.js'),
  loaded: true,
  exports: require('./plaintextFrameHelper'),
};

const { Client } = require('@2colors/esphome-native-api');
module.exports = { Client };
