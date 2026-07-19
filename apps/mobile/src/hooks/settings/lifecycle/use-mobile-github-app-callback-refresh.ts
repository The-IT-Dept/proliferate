import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { githubAppRootKey, repositoriesKey, useCloudClient } from "@proliferate/cloud-sdk-react";

import { GITHUB_APP_CALLBACK_SOURCE } from "../../../lib/access/cloud/auth/mobile-github-app-callback";

/**
 * Settings-tab counterpart to `app/+native-intent.ts`'s GitHub-App-callback
 * redirect. `redirectSystemPath` rewrites the OS-level callback URL
 * (`proliferate://settings/environments?source=github_app_callback`) to
 * `/settings?source=github_app_callback` - a plain path rewrite, since that
 * function runs before the router/providers mount and has no query client
 * to invalidate through. This hook does the actual data-refresh once the
 * Settings screen is mounted with that param present (cold start or warm
 * return alike), then replaces it away so re-visiting Settings, or just
 * backgrounding/foregrounding the app, doesn't re-invalidate on every mount.
 */
export function useMobileGithubAppCallbackRefresh(): void {
  const { source } = useLocalSearchParams<{ source?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const cloudClient = useCloudClient();

  useEffect(() => {
    if (source !== GITHUB_APP_CALLBACK_SOURCE) {
      return;
    }
    void queryClient.invalidateQueries({ queryKey: githubAppRootKey(cloudClient.baseUrl) });
    void queryClient.invalidateQueries({ queryKey: repositoriesKey() });
    router.replace("/settings");
  }, [cloudClient.baseUrl, queryClient, router, source]);
}
