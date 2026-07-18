import packageJson from "../../../../package.json";

declare const process: {
  env: {
    EXPO_PUBLIC_PROLIFERATE_ENVIRONMENT?: string;
    EXPO_PUBLIC_PROLIFERATE_POSTHOG_HOST?: string;
    EXPO_PUBLIC_PROLIFERATE_POSTHOG_KEY?: string;
    EXPO_PUBLIC_PROLIFERATE_POSTHOG_SESSION_REPLAY_ENABLED?: string;
    EXPO_PUBLIC_PROLIFERATE_RELEASE?: string;
    EXPO_PUBLIC_PROLIFERATE_TELEMETRY_DISABLED?: string;
  };
};
declare const __DEV__: boolean | undefined;

function envFlagEnabled(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

export interface MobileTelemetryConfig {
  environment: string;
  release: string;
  posthog: {
    enabled: boolean;
    apiKey: string | null;
    apiHost: string;
    sessionReplayEnabled: boolean;
  };
}

export function getMobileTelemetryConfig(): MobileTelemetryConfig {
  const posthogKey = process.env.EXPO_PUBLIC_PROLIFERATE_POSTHOG_KEY?.trim() || null;
  const telemetryDisabled = envFlagEnabled(
    process.env.EXPO_PUBLIC_PROLIFERATE_TELEMETRY_DISABLED,
    false,
  );

  return {
    environment:
      process.env.EXPO_PUBLIC_PROLIFERATE_ENVIRONMENT?.trim()
      || (typeof __DEV__ !== "undefined" && __DEV__ ? "development" : "production"),
    release:
      process.env.EXPO_PUBLIC_PROLIFERATE_RELEASE?.trim()
      // EAS build profiles are expected to set EXPO_PUBLIC_PROLIFERATE_RELEASE
      // to a canonical `proliferate-mobile@<semver>+<12-hex-sha>` string; this
      // fallback only fires in local dev and derives the version from the
      // package.json (kept in sync with app.config.ts) instead of a stale
      // hardcoded literal.
      || `proliferate-mobile@${packageJson.version}`,
    posthog: {
      enabled: !telemetryDisabled && posthogKey !== null,
      apiKey: posthogKey,
      apiHost:
        process.env.EXPO_PUBLIC_PROLIFERATE_POSTHOG_HOST?.trim()
        || "https://us.i.posthog.com",
      sessionReplayEnabled: envFlagEnabled(
        process.env.EXPO_PUBLIC_PROLIFERATE_POSTHOG_SESSION_REPLAY_ENABLED,
        false,
      ),
    },
  };
}
