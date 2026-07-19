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
  return { pathname: "/workspace/[id]", params: mobileWorkspaceRouteParams(workspaceId, options) };
}

/**
 * String-path form of `mobileWorkspaceHref`, for the one context with no
 * router instance available to resolve an `Href` through: `app/
 * +native-intent.ts`'s `redirectSystemPath`, which runs before the
 * router/providers mount and must return a plain path string. Shares
 * `mobileWorkspaceRouteParams` so the two never drift on param names.
 */
export function mobileWorkspacePath(
  workspaceId: string,
  options?: { sessionId?: string | null; requestId?: string | null },
): string {
  const { id, ...query } = mobileWorkspaceRouteParams(workspaceId, options);
  const search = new URLSearchParams(query).toString();
  return `/workspace/${encodeURIComponent(id)}${search ? `?${search}` : ""}`;
}

function mobileWorkspaceRouteParams(
  workspaceId: string,
  options?: { sessionId?: string | null; requestId?: string | null },
): Record<string, string> {
  const params: Record<string, string> = { id: workspaceId };
  if (options?.sessionId) {
    params.sessionId = options.sessionId;
  }
  if (options?.requestId) {
    params.interaction = options.requestId;
  }
  return params;
}
