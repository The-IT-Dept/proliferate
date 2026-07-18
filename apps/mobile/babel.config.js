// Explicit babel config for Expo Router. Before expo-router this app had no
// babel.config.js at all: @expo/metro-config's loadBabelConfig falls back to
// `babel-preset-expo` when no config file is present in the project root, so
// the app already built correctly without one. This file makes that config
// explicit (Expo Router projects conventionally have one) without changing
// behavior.
//
// react-native-reanimated/plugin is NOT listed here by hand. babel-preset-expo
// auto-detects react-native-reanimated (see configs/expo.js in that package)
// and appends its babel plugin as the LAST plugin in the composed preset
// automatically, which is what "must be last" requires. Adding it again here
// would double-apply the plugin.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
