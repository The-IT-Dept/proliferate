import { type ReactNode } from "react";

import { useMobilePushRegistration } from "../hooks/push/use-mobile-push-registration";
import { useMobilePushDeepLinkHandler } from "../lib/push/handler";
import { useMobileAuth } from "./MobileAuthProvider";

/**
 * Push subsystem Task 6 — mounts registration (request permission, get the
 * Expo push token, `POST /users/me/push-devices`, `DELETE` on sign-out) and
 * tap-routing (deep-link into the pending interaction) at the app root.
 * Modeled on `MobileTelemetryProvider`'s shape: a thin provider that reads
 * `useMobileAuth()` and drives device-only hooks off it, mounted below
 * `MobileAuthProvider` in `app/_layout.tsx`.
 *
 * Both hooks are internally gated on having a real `accessToken` — the tap
 * handler additionally takes that as an explicit `enabled` input so a
 * notification tap that somehow arrives signed-out doesn't attempt to
 * navigate into the tab-protected workspace route.
 */
export function MobilePushProvider({ children }: { children: ReactNode }) {
  const { authState, accessToken } = useMobileAuth();
  useMobilePushRegistration({ authState, accessToken });
  useMobilePushDeepLinkHandler({ enabled: Boolean(accessToken) });
  return children;
}
