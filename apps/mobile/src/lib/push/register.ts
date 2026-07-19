import {
  buildRegisterPushDeviceBody,
  pushDeviceRegisterUrl,
  pushDeviceUnregisterUrl,
  type MobilePushPlatform,
} from "./push-devices-request";

/**
 * `fetch`-based register/unregister calls against the push-device routes
 * (server contract on `feat/mobile-push-server` — not deployed to the
 * hosted control plane yet; a human-gated k8s deploy is Task 7). Modeled on
 * `src/lib/integrations/telemetry/client-daily-activity.ts`'s pattern (a
 * raw authenticated `fetch` against `mobileEnv.apiBaseUrl`, not the
 * generated `@proliferate/cloud-sdk` client — these routes aren't in that
 * client's generated surface since the server branch that defines them
 * hasn't merged).
 *
 * Both functions resolve to a `boolean` (never throw, never reject) — a
 * 404 (routes not deployed yet), any other non-2xx, or a network failure
 * all collapse to `false`. This is deliberate: registration/unregistration
 * is best-effort background plumbing, not something that should crash the
 * caller or retry-storm the (currently 404ing) endpoint. The caller
 * (`use-mobile-push-registration.ts`) attempts once per session/token and
 * doesn't loop on a `false` result.
 */

export interface RegisterMobilePushDeviceInput {
  apiBaseUrl: string;
  accessToken: string;
  expoPushToken: string;
  platform: MobilePushPlatform;
}

export async function registerMobilePushDevice(
  input: RegisterMobilePushDeviceInput,
): Promise<boolean> {
  try {
    const response = await fetch(pushDeviceRegisterUrl(input.apiBaseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(buildRegisterPushDeviceBody(input.expoPushToken, input.platform)),
    });
    if (!response.ok) {
      warnPushDeviceFailure("register", response.status);
      return false;
    }
    return true;
  } catch (error) {
    warnPushDeviceFailure("register", error);
    return false;
  }
}

export interface UnregisterMobilePushDeviceInput {
  apiBaseUrl: string;
  accessToken: string;
  expoPushToken: string;
}

export async function unregisterMobilePushDevice(
  input: UnregisterMobilePushDeviceInput,
): Promise<boolean> {
  try {
    const response = await fetch(pushDeviceUnregisterUrl(input.apiBaseUrl, input.expoPushToken), {
      method: "DELETE",
      headers: {
        authorization: `Bearer ${input.accessToken}`,
      },
    });
    if (!response.ok) {
      warnPushDeviceFailure("unregister", response.status);
      return false;
    }
    return true;
  } catch (error) {
    warnPushDeviceFailure("unregister", error);
    return false;
  }
}

function warnPushDeviceFailure(action: "register" | "unregister", detail: unknown): void {
  if (typeof __DEV__ !== "undefined" && __DEV__) {
    console.warn(`[push] ${action} push device failed`, detail);
  }
}
