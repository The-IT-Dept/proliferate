import { mobileWorkspaceLinkFromUrl } from "../domain/shell/mobile-deep-link";

/**
 * Decodes a tapped push notification into the same
 * `{workspaceId, sessionId, requestId}` shape `mobileWorkspaceLinkFromUrl`
 * produces for a `proliferate://workspace/{id}?interaction={requestId}`
 * link — because that's exactly the destination a push notification tap
 * means (IA "Deep links & push"). Two input shapes, matching the two
 * places a caller might get one from:
 *
 *  - the Expo push notification's `data` object, `{workspaceId, sessionId,
 *    requestId, kind}` (verified against the server's
 *    `build_expo_payload`, `feat/mobile-push-server` branch,
 *    `server/proliferate/server/cloud/push/delivery.py`) — what
 *    `handler.ts`'s `addNotificationResponseReceivedListener`/
 *    `getLastNotificationResponseAsync` actually hands back
 *    (`response.notification.request.content.data`);
 *  - a deep-link URL string, delegated to `mobileWorkspaceLinkFromUrl`
 *    (not reimplemented here) for symmetry with every other entry point
 *    into the same route (native-intent, universal links).
 *
 * Anything else — `null`/`undefined`, a non-object/non-string, a data
 * object missing a string `workspaceId`, a malformed or unrelated URL —
 * returns `null`. This decoder never invents a destination, matching
 * `mobileWorkspaceLinkFromUrl`'s own contract.
 */
export interface PushDeepLink {
  workspaceId: string;
  sessionId: string | null;
  requestId: string | null;
}

export function parsePushDeepLink(input: unknown): PushDeepLink | null {
  if (typeof input === "string") {
    const link = mobileWorkspaceLinkFromUrl(input);
    return link ? { workspaceId: link.workspaceId, sessionId: link.sessionId, requestId: link.requestId } : null;
  }

  if (!isRecord(input)) {
    return null;
  }

  const workspaceId = typeof input.workspaceId === "string" ? input.workspaceId : null;
  if (!workspaceId) {
    return null;
  }

  return {
    workspaceId,
    sessionId: typeof input.sessionId === "string" ? input.sessionId : null,
    requestId: typeof input.requestId === "string" ? input.requestId : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
