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
    entitlements: {
      // expo-notifications' own iOS sub-plugin (withNotificationsIOS) only
      // sets `aps-environment` when it's absent from the merged entitlements,
      // so this explicit value wins over its `mode` option/default - keeping
      // it here (rather than passed through the plugin config below) makes
      // it visible/greppable next to the rest of the ios block.
      //
      // "development" matches the Development-signed dev-client build this
      // feature needs first (`eas build --profile development` /
      // `development-simulator` - both set `developmentClient: true`, which
      // EAS signs with a Development provisioning profile). This MUST
      // change to "production" (or be branched per EAS build profile, the
      // way `IS_STAGING` branches bundle id) before a `production` /
      // `staging` / `staging-testflight` (App Store/TestFlight) submission
      // build: those sign with a Distribution profile, which requires the
      // "production" APNs environment - Apple rejects a mismatched value.
      "aps-environment": "development",
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
      "expo-notifications",
      {
        // Android notification-tray tint; matches the dark splash/theme
        // color used above. No custom small icon asset yet (falls back to
        // the app icon) - a dedicated white/transparent notification icon
        // is a follow-up design task, not required for delivery to work.
        color: "#181818",
        // Declared here (AndroidManifest default-channel meta-data) AND
        // created at runtime (`Notifications.setNotificationChannelAsync`
        // in `use-mobile-push-registration.ts`) - the manifest entry alone
        // doesn't create the channel, Android 8+ requires the runtime call;
        // this just tells the OS which channel id to fall back to for a
        // notification that doesn't name one explicitly.
        defaultChannel: "default",
      },
    ],
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
