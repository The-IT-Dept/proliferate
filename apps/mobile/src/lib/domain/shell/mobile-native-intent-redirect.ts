import {
  GITHUB_APP_CALLBACK_SOURCE,
  isMobileGitHubAppCallbackUrl,
} from "../../access/cloud/auth/mobile-github-app-callback";
import { mobileWorkspaceLinkFromUrl } from "./mobile-deep-link";
import { mobileWorkspacePath } from "./mobile-workspace-route";

/**
 * Pure resolver behind `app/+native-intent.ts`'s `redirectSystemPath` - kept
 * here (not inline in that file) so it can be unit-tested directly: Expo
 * Router calls `redirectSystemPath` before the router/providers mount, so
 * that file itself can't depend on React or a query client, and `app/**`
 * isn't in vitest's `include` glob (`vitest.config.ts`).
 *
 * Rewrites the two URL shapes that aren't expressible as Expo Router file
 * routes (see `mobile-deep-link.ts`'s doc comment for why) to an in-app
 * path:
 *  - the GitHub App callback (`proliferate://settings/environments?
 *    source=github_app_callback`) -> `/settings?source=github_app_callback`.
 *    The query-invalidation side effect the old handler ran inline now lives
 *    in `useMobileGithubAppCallbackRefresh` (Settings tab), since this
 *    function has no query client to invalidate through - it only rewrites
 *    the path, keeping the `source` marker for that hook to key off of.
 *  - workspace push-notification links (`proliferate://workspaces/{id}`,
 *    `https://<host>/(cloud/)workspaces/{id}`) -> `/workspace/{id}`.
 *
 * Every other URL (plain https universal links that already match a file
 * route, or anything unrecognized) passes through unchanged - never
 * rewritten to `null`/empty, since Expo Router treats a falsy return as "no
 * redirection, stay on the current path," which would silently drop it.
 */
export function resolveMobileNativeIntentPath(path: string): string {
  if (isMobileGitHubAppCallbackUrl(path)) {
    return `/settings?source=${GITHUB_APP_CALLBACK_SOURCE}`;
  }

  const link = mobileWorkspaceLinkFromUrl(path);
  if (link) {
    return mobileWorkspacePath(link.workspaceId, {
      sessionId: link.sessionId,
      requestId: link.requestId,
    });
  }

  return path;
}
