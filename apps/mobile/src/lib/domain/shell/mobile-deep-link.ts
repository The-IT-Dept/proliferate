/**
 * Parses a Proliferate workspace deep link — either the custom-scheme form
 * (`proliferate://workspaces/{id}`, matching `desktopWorkspaceDeepLink` /
 * `mobileWorkspaceDeepLink` in `cloud/sdk/src/client/deep-links.ts`) or the
 * web universal-link form (`https://<host>/cloud/workspaces/{id}` or
 * `https://<host>/workspaces/{id}`). Also accepts the singular `workspace`
 * host used by the IA's deep-link table
 * (`proliferate://workspace/{id}?interaction={requestId}`), since both
 * spellings reach the same route. Returns `null` for anything else
 * (malformed URLs, other custom-scheme routes like auth/GitHub-App
 * callbacks) — the decoder never invents a destination.
 *
 * This is the one piece of `mobile-shell-navigation.ts`'s hand-rolled parser
 * kept after the Expo Router migration: none of these URL shapes are
 * expressible as Expo Router file routes (the app's canonical internal route
 * is `app/workspace/[id]`, singular, and `path/segments/like/this` don't
 * match a "workspaces" plural file tree without route-tree ambiguity), so a
 * `Linking` listener still needs a tiny mapping from URL to
 * `{ workspaceId, sessionId, requestId }` before handing off to
 * `router.push(mobileWorkspaceHref(...))`. Everything else the old parser's
 * module used to own (account summary, route-subtitle strings, AsyncStorage
 * persistence of the last-viewed route/chat) is gone: route state now lives
 * entirely in the URL, not in a parallel hand-rolled store.
 */
export interface MobileWorkspaceDeepLink {
  workspaceId: string;
  sessionId: string | null;
  /**
   * The `?interaction={requestId}` query param (IA §"Deep links & push"):
   * `proliferate://workspaces/{id}?interaction={requestId}`. Routed to the
   * workspace; scrolling the transcript to the interaction card is a later
   * group's concern.
   */
  requestId: string | null;
}

export function mobileWorkspaceLinkFromUrl(url: string | null): MobileWorkspaceDeepLink | null {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    const rawParts = parsed.pathname.split("/").filter(Boolean);
    const parts = parsed.protocol === "proliferate:"
      ? [parsed.hostname, ...rawParts]
      : rawParts;
    const workspaceIndex =
      parts[0] === "cloud" && parts[1] === "workspaces"
        ? 1
        : parts[0] === "workspaces" || parts[0] === "workspace"
          ? 0
          : -1;
    const workspaceId = workspaceIndex >= 0 ? parts[workspaceIndex + 1] : null;
    if (!workspaceId) {
      return null;
    }
    const sessionPathKind = parts[workspaceIndex + 2];
    const sessionId =
      sessionPathKind === "chats" || sessionPathKind === "sessions"
        ? parts[workspaceIndex + 3] ?? null
        : parsed.searchParams.get("sessionId");
    const requestId = parsed.searchParams.get("interaction");
    return {
      workspaceId: decodeURIComponent(workspaceId),
      sessionId: sessionId ? decodeURIComponent(sessionId) : null,
      requestId: requestId || null,
    };
  } catch {
    return null;
  }
}
