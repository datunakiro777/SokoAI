const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('tflitepart');
config.resolver.assetExts.push('fungiinfo');

module.exports = config;
