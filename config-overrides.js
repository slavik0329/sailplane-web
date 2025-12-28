const webpack = require('webpack');

module.exports = function override(config) {
  // Add polyfills for Node.js core modules
  config.resolve.fallback = {
    ...config.resolve.fallback,
    path: require.resolve('path-browserify'),
    stream: require.resolve('stream-browserify'),
    crypto: require.resolve('crypto-browserify'),
    os: require.resolve('os-browserify/browser'),
    buffer: require.resolve('buffer'),
    process: require.resolve('process/browser'),
    assert: require.resolve('assert'),
    util: require.resolve('util'),
    url: require.resolve('url'),
    string_decoder: require.resolve('string_decoder'),
    events: require.resolve('events'),
    http: false,
    https: false,
    zlib: false,
    fs: false,
    net: false,
    tls: false,
    child_process: false,
  };

  // Add plugins for global polyfills
  config.plugins = [
    ...config.plugins,
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser',
    }),
  ];

  // Ignore source-map warnings from dependencies
  config.ignoreWarnings = [/Failed to parse source map/];

  return config;
};
