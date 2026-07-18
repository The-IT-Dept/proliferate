// Staging vs production identity is selected via APP_VARIANT, which the EAS
// build/submit profiles set (see eas.json). Default (unset) = production.
//
// This is plain JS rather than app.config.ts on purpose: eas-cli's TypeScript
// config loader throws "Cannot read properties of undefined (reading
// 'CommonJS')" on this toolchain (Node 23 + eas-cli 21). Expo/EAS load a .js
// config directly with no transpile step, so this is toolchain-proof. The
// config is static enough that losing config-file type-checking is acceptable.
const IS_STAGING = process.env.APP_VARIANT === "staging";

const BUNDLE_ID = IS_STAGING ? "au.theitdept.proliferate.staging" : "au.theitdept.proliferate";

/** @param {{ config: import("expo/config").ExpoConfig }} ctx @returns {import("expo/config").ExpoConfig} */
module.exports = ({ config }) => ({
  ...config,
  name: IS_STAGING ? "Proliferate Staging" : "Proliferate",
  slug: "proliferate-mobile",
  version: "0.1.1",
  scheme: IS_STAGING ? "proliferate-staging" : "proliferate",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  // New Architecture (Fabric) is mandatory and always-on as of SDK 55; the
  // `newArchEnabled` opt-in config key was removed.
  assetBundlePatterns: ["**/*"],
  // The top-level `splash` config was removed in SDK 56; splash configuration
  // now lives entirely in the `expo-splash-screen` plugin below.
  ios: {
    bundleIdentifier: BUNDLE_ID,
    buildNumber: "29",
    supportsTablet: true,
    usesAppleSignIn: true,
    associatedDomains: ["applinks:proliferate.theitdept.au"],
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: BUNDLE_ID,
    versionCode: 2,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#181818",
    },
    // edge-to-edge is always-on as of SDK 55 (the `edgeToEdgeEnabled` config key
    // was removed); no explicit opt-in is needed.
    predictiveBackGestureEnabled: false,
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          { scheme: "https", host: "proliferate.theitdept.au", pathPrefix: "/workspaces/" },
          { scheme: "https", host: "proliferate.theitdept.au", pathPrefix: "/cloud/workspaces/" },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [
    "expo-router",
    "expo-apple-authentication",
    "expo-localization",
    "expo-secure-store",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#181818",
        image: "./assets/splash-icon.png",
        imageWidth: 160,
        resizeMode: "contain",
        dark: { backgroundColor: "#181818", image: "./assets/splash-icon.png" },
      },
    ],
  ],
  extra: {
    // EAS project @nicko170/proliferate-mobile (created via `eas init`).
    eas: {
      projectId: "6c98e003-79bc-4cb9-b83f-91de81b098cb",
    },
  },
  owner: "nicko170",
});
