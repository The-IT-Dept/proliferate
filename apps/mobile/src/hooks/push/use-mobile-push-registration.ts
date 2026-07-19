import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";

import type { MobileAuthState } from "../../providers/MobileAuthProvider";
import { mobileEnv } from "../../config/env";
import { registerMobilePushDevice, unregisterMobilePushDevice } from "../../lib/push/register";
import type { MobilePushPlatform } from "../../lib/push/push-devices-request";

/**
 * Push subsystem Task 6 — device-only glue, not unit tested (needs the
 * native expo-notifications module + expo-constants' embedded manifest, and
 * exercises real timers/effects). The pure pieces it calls through to
 * (`registerMobilePushDevice`/`unregisterMobilePushDevice`,
 * `../../lib/push/register.ts` and its `push-devices-request.ts` builders)
 * are unit-tested directly.
 *
 * Requests notification permission and registers the device's Expo push
 * token once per `accessToken` (`attemptedAccessTokenRef` is a one-shot
 * latch, not a retry loop) — so the server's current 404 (the
 * `feat/mobile-push-server` routes aren't deployed to the hosted control
 * plane yet, k8s Task 7) is logged once via `registerMobilePushDevice`'s
 * own tolerant `false` return and left alone, rather than retried on every
 * render/app-active cycle. `registeredDeviceRef` only holds a value once
 * the POST is known to have actually succeeded, so sign-out only fires the
 * DELETE for a device the server actually has on file (a no-op today,
 * since nothing succeeds yet).
 */
export function useMobilePushRegistration(input: {
  authState: MobileAuthState;
  accessToken: string | null;
}): void {
  const { authState, accessToken } = input;
  const attemptedAccessTokenRef = useRef<string | null>(null);
  const registeredDeviceRef = useRef<{ accessToken: string; expoPushToken: string } | null>(null);

  // Android 8+ requires a channel to exist before a notification can be
  // shown through it; the config-plugin's `defaultChannel` (app.config.js)
  // only declares which channel id the manifest falls back to — it doesn't
  // create the channel itself. Cheap and idempotent, so it runs unconditional
  // of auth state.
  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }
    void Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }, []);

  useEffect(() => {
    const platform = mobilePushPlatform();
    // "active" and "needs_github" both carry a real accessToken
    // (MobileAuthProvider's applySession sets one before choosing between
    // them) — mirrors MobileTelemetryProvider's identify-whenever-there's-a-
    // user posture rather than gating strictly on the fully-onboarded
    // "active" stage.
    const isAuthenticated =
      Boolean(accessToken) && (authState === "active" || authState === "needs_github");
    if (!platform || !isAuthenticated || !accessToken) {
      return;
    }
    if (attemptedAccessTokenRef.current === accessToken) {
      return;
    }
    attemptedAccessTokenRef.current = accessToken;

    let cancelled = false;
    void (async () => {
      try {
        const existing = await Notifications.getPermissionsAsync();
        const granted = existing.granted
          ? true
          : (await Notifications.requestPermissionsAsync()).granted;
        if (!granted || cancelled) {
          return;
        }

        const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
        if (!projectId) {
          warnPushRegistration("no EAS projectId in app config extra.eas");
          return;
        }

        const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({ projectId });
        if (cancelled) {
          return;
        }

        const registered = await registerMobilePushDevice({
          apiBaseUrl: mobileEnv.apiBaseUrl,
          accessToken,
          expoPushToken,
          platform,
        });
        if (registered && !cancelled) {
          registeredDeviceRef.current = { accessToken, expoPushToken };
        }
      } catch (error) {
        warnPushRegistration(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authState, accessToken]);

  useEffect(() => {
    if (authState !== "signed_out" || !registeredDeviceRef.current) {
      return;
    }
    const device = registeredDeviceRef.current;
    registeredDeviceRef.current = null;
    void unregisterMobilePushDevice({
      apiBaseUrl: mobileEnv.apiBaseUrl,
      accessToken: device.accessToken,
      expoPushToken: device.expoPushToken,
    });
  }, [authState]);
}

function mobilePushPlatform(): MobilePushPlatform | null {
  return Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : null;
}

function warnPushRegistration(detail: unknown): void {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.warn("[push] registration attempt failed", detail);
  }
}
