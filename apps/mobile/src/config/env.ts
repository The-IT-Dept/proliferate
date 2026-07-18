declare const process: {
  env: {
    EXPO_PUBLIC_PROLIFERATE_DEV_REFRESH_TOKEN?: string;
  };
};
declare const __DEV__: boolean | undefined;

// The mobile app is cloud-only. It always talks to the single hosted control
// plane; there is no instance selector and no env-driven base-URL override, so
// a shipped build cannot be pointed at anything else.
const CLOUD_API_BASE_URL = "https://proliferate.theitdept.au";

// Local development override only. A dev build (`__DEV__`) talks to the API
// running on the loopback dev server; production/preview builds always use the
// hosted cloud URL above.
const DEV_API_BASE_URL = "http://127.0.0.1:8000";

function resolveApiBaseUrl(): string {
  if (typeof __DEV__ !== "undefined" && __DEV__) return DEV_API_BASE_URL;
  return CLOUD_API_BASE_URL;
}

export const mobileEnv = {
  apiBaseUrl: resolveApiBaseUrl(),
  redirectUri: "proliferate://auth/callback",
  devRefreshToken: typeof __DEV__ !== "undefined" && __DEV__
    ? process.env.EXPO_PUBLIC_PROLIFERATE_DEV_REFRESH_TOKEN?.trim() || null
    : null,
} as const;
