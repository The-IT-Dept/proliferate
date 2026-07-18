declare const process: {
  env: {
    EXPO_PUBLIC_PROLIFERATE_DEV_REFRESH_TOKEN?: string;
    EXPO_PUBLIC_PROLIFERATE_DEV_API_BASE_URL?: string;
  };
};
declare const __DEV__: boolean | undefined;

// The mobile app is cloud-only. It always talks to the single hosted control
// plane; there is no instance selector, so a shipped build cannot be pointed at
// anything else. This is the default for EVERY build, dev included — a dev-client
// build on a physical device must reach the hosted API, not the phone's loopback.
const CLOUD_API_BASE_URL = "https://proliferate.theitdept.au";

function resolveApiBaseUrl(): string {
  // Opt-in local override for a dev build only: set
  // EXPO_PUBLIC_PROLIFERATE_DEV_API_BASE_URL (e.g. http://<your-LAN-ip>:8000) to
  // point at a locally-running control plane. Absent, dev uses the hosted URL.
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    const devOverride = process.env.EXPO_PUBLIC_PROLIFERATE_DEV_API_BASE_URL?.trim();
    if (devOverride) return devOverride;
  }
  return CLOUD_API_BASE_URL;
}

export const mobileEnv = {
  apiBaseUrl: resolveApiBaseUrl(),
  redirectUri: "proliferate://auth/callback",
  devRefreshToken: typeof __DEV__ !== "undefined" && __DEV__
    ? process.env.EXPO_PUBLIC_PROLIFERATE_DEV_REFRESH_TOKEN?.trim() || null
    : null,
} as const;
