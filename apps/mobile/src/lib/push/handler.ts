import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";

import { parsePushDeepLink } from "./parse-push-deep-link";
import { mobileWorkspaceHref } from "../domain/shell/mobile-workspace-route";

/**
 * Push subsystem Task 6 — foreground presentation + tap routing. Device-only
 * glue, not unit tested (needs the native expo-notifications module + a live
 * Expo Router instance); `parsePushDeepLink` (the data -> link decode) and
 * `mobileWorkspaceHref` (the route-param builder) are both unit-tested
 * elsewhere and reused verbatim here — no ad hoc URL/path building.
 *
 * `setNotificationHandler` is called at module scope (like
 * `app/_layout.tsx`'s telemetry bootstrap) so it's registered before the
 * router/providers mount and before any notification could arrive — a
 * notification received while the app is foregrounded still shows as a
 * banner/list entry (mirrors the OS default for a backgrounded app) rather
 * than being silently swallowed.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/**
 * Routes a tapped push notification to its workspace via the EXISTING
 * deep-link path — `mobileWorkspaceHref` is the same href builder
 * `mobileWorkspacePath`/`resolveMobileNativeIntentPath` use for every other
 * entry point into `/workspace/[id]` (native-intent redirects, universal
 * links), so this doesn't hand-roll a second route-building scheme.
 *
 * `Notifications.useLastNotificationResponse()` is expo-notifications' own
 * blessed hook for "the most recent tap, cold-start or warm" — it covers
 * `getLastNotificationResponseAsync` (cold start) and
 * `addNotificationResponseReceivedListener` (background/foreground tap) in
 * one subscription, and already dedupes by notification identifier
 * (`determineNextResponse`), so this hook is not a second/competing
 * notifications listener — expo-notifications requires exactly one
 * subscription for "the last tap," and this is it. It is unrelated to (and
 * does not touch) the `Linking`/native-intent listener Group E1 already
 * consolidated to a single handler for URL-based deep links.
 */
export function useMobilePushDeepLinkHandler(input: { enabled: boolean }): void {
  const router = useRouter();
  const response = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!input.enabled || !response) {
      return;
    }
    const link = parsePushDeepLink(response.notification.request.content.data);
    if (!link) {
      return;
    }
    router.push(
      mobileWorkspaceHref(link.workspaceId, {
        sessionId: link.sessionId,
        requestId: link.requestId,
      }),
    );
  }, [input.enabled, response, router]);
}
