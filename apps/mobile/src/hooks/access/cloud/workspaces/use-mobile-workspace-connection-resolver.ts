import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getCloudWorkspace } from "@proliferate/cloud-sdk";
import { cloudWorkspaceKey, useCloudClient } from "@proliferate/cloud-sdk-react";
import type { AnyHarnessResolvedConnection } from "@anyharness/sdk-react";

import { resolveMobileCloudSandboxWorkspaceConnection } from "../../../../lib/access/anyharness/cloud-sandbox-runtime";
import { useMobileAuth } from "../../../../providers/MobileAuthProvider";

/**
 * Builds the `resolveConnection` callback `AnyHarnessWorkspace`
 * (`@anyharness/sdk-react`) needs: given a workspaceId, resolve (fetching and
 * caching the `CloudWorkspaceDetail` if needed) the cloud gateway connection
 * `{runtimeUrl, authToken, anyharnessWorkspaceId, webSocketAuthTransport}`.
 *
 * Mirrors product-client's `useResolveWorkspaceConnection`, but mobile is
 * cloud-only (IA §3 row 3: "runtime picker … collapsed — cloud fixed"), so
 * there is no local/SSH/materialization branching — every workspaceId here is
 * a cloud workspace id, resolved the same way the existing chat hooks already
 * resolve one via `getMobileCloudSandboxAnyHarnessClient`
 * (`lib/access/anyharness/cloud-sandbox-runtime.ts`).
 */
export function useMobileWorkspaceConnectionResolver(): (
  workspaceId: string,
) => Promise<AnyHarnessResolvedConnection> {
  const queryClient = useQueryClient();
  const cloudClient = useCloudClient();
  const { accessToken } = useMobileAuth();

  return useCallback(
    async (workspaceId: string) => {
      const workspace = await queryClient.fetchQuery({
        queryKey: cloudWorkspaceKey(workspaceId),
        queryFn: () => getCloudWorkspace(workspaceId, cloudClient),
      });
      if (!workspace) {
        throw new Error("Workspace not found.");
      }
      return resolveMobileCloudSandboxWorkspaceConnection({
        workspace,
        productToken: accessToken,
        client: cloudClient,
      });
    },
    [accessToken, cloudClient, queryClient],
  );
}
