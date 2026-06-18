const nodeExternals = require('webpack-node-externals');
const nodeModules = require('./node-modules.cjs');
const problematicDeps = require('./problematic-deps.cjs');

function createMinimalExternals(importType) {
  importType = importType || 'commonjs';

  var externals = [
    ...nodeModules,
    ...problematicDeps,
  ];

  // source-map-support 在 webpack bundle 中 tree-shake 有问题，
  // 必须用函数形式确保匹配
  externals.push(function(_ref, callback) {
    var request = _ref.request;
    if (/^source-map-support/.test(request)) {
      return callback(null, 'commonjs ' + request);
    }
    callback();
  });

  return externals;
}

module.exports = createMinimalExternals;
