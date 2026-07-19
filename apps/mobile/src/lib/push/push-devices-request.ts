/**
 * Pure request-shape builders for the push-device register/unregister routes
 * (server contract, `feat/mobile-push-server` — not yet deployed, see
 * `register.ts`'s doc comment):
 *
 *   POST   /users/me/push-devices              { expoPushToken, platform }
 *   DELETE /users/me/push-devices/{expoPushToken}
 *
 * Verified against the actual server models on that branch
 * (`server/proliferate/auth/profile_api.py`): `PushDeviceRegisterRequest`
 * uses `extra="forbid"`, so the POST body must be exactly
 * `{expoPushToken, platform}` — no extra fields — and `platform` is
 * `Literal["ios", "android"]`.
 *
 * Kept separate from `register.ts` (which does the actual `fetch`) so the
 * URL/body shape is unit-tested without touching the network.
 */

export type MobilePushPlatform = "ios" | "android";

export interface RegisterPushDeviceBody {
  expoPushToken: string;
  platform: MobilePushPlatform;
}

export function pushDeviceRegisterUrl(apiBaseUrl: string): string {
  return `${trimTrailingSlash(apiBaseUrl)}/users/me/push-devices`;
}

export function pushDeviceUnregisterUrl(apiBaseUrl: string, expoPushToken: string): string {
  return `${trimTrailingSlash(apiBaseUrl)}/users/me/push-devices/${encodeURIComponent(expoPushToken)}`;
}

export function buildRegisterPushDeviceBody(
  expoPushToken: string,
  platform: MobilePushPlatform,
): RegisterPushDeviceBody {
  return { expoPushToken, platform };
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/u, "");
}
