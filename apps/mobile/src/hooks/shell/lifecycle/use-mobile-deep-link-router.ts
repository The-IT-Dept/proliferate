import { useEffect, useRef } from "react";
import { Linking } from "react-native";

import { useQueryClient } from "@tanstack/react-query";
import { githubAppRootKey, repositoriesKey, useCloudClient } from "@proliferate/cloud-sdk-react";
import type { useRouter } from "expo-router";

import { isMobileGitHubAppCallbackUrl } from "../../../lib/access/cloud/auth/mobile-github-app-callback";
import { mobileWorkspaceLinkFromUrl } from "../../../lib/domain/shell/mobile-deep-link";
import { mobileWorkspaceHref } from "../../../lib/domain/shell/mobile-workspace-route";

/**
 * Resolves incoming `Linking` URLs (cold-start `getInitialURL` + warm `url`
 * events) to a router navigation, replacing `useMobileShellNavigation`'s
 * `applyWorkspaceLink`/`applyGitHubAppCallback` effects.
 *
 * Two URL shapes still can't be expressed as Expo Router file routes and
 * need this imperative bridge instead of automatic route matching:
 *  - the GitHub App callback (`proliferate://settings/environments?
 *    source=github_app_callback`) - not a real screen, just a signal to
 *    invalidate GitHub App queries and land on the Settings tab;
 *  - workspace push-notification links (`proliferate://workspaces/{id}`,
 *    `https://<host>/(cloud/)workspaces/{id}`) - see `mobile-deep-link.ts`
 *    for why these don't map onto the file tree directly.
 *
 * `ready` should be `true` only once the authenticated (tabs) area is
 * actually mounted (`Stack.Protected guard={stage === "tabs"}`) - pushing
 * `workspace/[id]` or replacing to `/settings` before then would target
 * screens that aren't in the active protected set yet.
 * `Linking.getInitialURL()` stays valid for the whole app launch (it's not
 * consumed on first read), so deferring the whole effect until `ready`
 * loses nothing versus the old code's "capture immediately, apply once
 * authenticated" split.
 */
export function useMobileDeepLinkRouter(router: ReturnType<typeof useRouter>, ready: boolean): void {
  const queryClient = useQueryClient();
  const cloudClient = useCloudClient();
  const handledUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!ready) {
      return;
    }

    function handle(url: string | null) {
      if (!url || handledUrlRef.current === url) {
        return;
      }

      if (isMobileGitHubAppCallbackUrl(url)) {
        handledUrlRef.current = url;
        void queryClient.invalidateQueries({ queryKey: githubAppRootKey(cloudClient.baseUrl) });
        void queryClient.invalidateQueries({ queryKey: repositoriesKey() });
        router.replace("/settings");
        return;
      }

      const link = mobileWorkspaceLinkFromUrl(url);
      if (link) {
        handledUrlRef.current = url;
        router.push(
          mobileWorkspaceHref(link.workspaceId, {
            sessionId: link.sessionId,
            requestId: link.requestId,
          }),
        );
      }
    }

    void Linking.getInitialURL().then(handle);
    const subscription = Linking.addEventListener("url", ({ url }) => handle(url));
    return () => subscription.remove();
  }, [cloudClient.baseUrl, queryClient, ready, router]);
}
