/**
 * Displayed in Settings' footer. Kept as a single hand-maintained constant
 * (rather than reading it off `expo-constants` at runtime) because
 * `expo-constants` isn't a direct dependency of this app and adding one
 * mid-build is out of scope here — see `apps/mobile/package.json`'s
 * `"version"` and `apps/mobile/app.config.js`'s `version`, which this MUST
 * be kept in sync with (both were "0.1.1" as of this writing; the footer
 * previously hardcoded the stale "0.1.0").
 */
export const MOBILE_APP_VERSION = "0.1.1";
