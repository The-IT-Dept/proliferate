import type { Href } from "expo-router";

/**
 * Builds the `router.push`/`router.replace` target for the pushed workspace
 * shell (`app/workspace/[id].tsx`), given the same fields the old
 * `MobileCloudChat`-drilling `onOpenChat` callback used to carry directly as
 * JS state. Expo Router navigation only carries string route params, so
 * opening a workspace is now "navigate to this id" rather than "hand the
 * next screen a pre-built object" - the destination route re-derives
 * everything else (title, repo, branch, live status) from
 * `useCloudWorkspace(id)`, same as it already had to for a slow/stale
 * `MobileCloudChat.
 *
 * Pure and tested so the query-param names (`sessionId`, `interaction`) stay
 * in one place, matching what `app/workspace/[id].tsx` reads back out.
 */
export function mobileWorkspaceHref(
  workspaceId: string,
  options?: { sessionId?: string | null; requestId?: string | null },
): Href {
  const params: Record<string, string> = { id: workspaceId };
  if (options?.sessionId) {
    params.sessionId = options.sessionId;
  }
  if (options?.requestId) {
    params.interaction = options.requestId;
  }
  return { pathname: "/workspace/[id]", params };
}
