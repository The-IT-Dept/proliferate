import {
  anyHarnessAgentLaunchOptionsPrefixKey,
  anyHarnessAgentGatewayModelsPrefixKey,
  anyHarnessAgentReconcileStatusKey,
  anyHarnessAgentsKey,
  anyHarnessWorkspaceAgentReconcileStatusKey,
  anyHarnessWorkspaceAgentsKey,
  useAnyHarnessCacheScopeKey,
} from "@anyharness/sdk-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

export function useAgentResourcesCache() {
  const queryClient = useQueryClient();
  const cacheScopeKey = useAnyHarnessCacheScopeKey();

  const invalidateAgentListResources = useCallback(async (
    runtimeUrl: string,
    options?: { throwOnError?: boolean },
  ) => {
    const normalizedRuntimeUrl = runtimeUrl.trim();
    if (!normalizedRuntimeUrl) {
      return;
    }

    await Promise.all([
      queryClient.invalidateQueries(
        {
          queryKey: anyHarnessAgentsKey(normalizedRuntimeUrl, cacheScopeKey),
        },
        { throwOnError: options?.throwOnError ?? false },
      ),
    ]);
  }, [cacheScopeKey, queryClient]);

  const invalidateAgentSetupResources = useCallback(async (runtimeUrl: string) => {
    const normalizedRuntimeUrl = runtimeUrl.trim();
    if (!normalizedRuntimeUrl) {
      return;
    }

    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: anyHarnessAgentsKey(normalizedRuntimeUrl, cacheScopeKey),
      }),
      queryClient.invalidateQueries({
        queryKey: anyHarnessAgentReconcileStatusKey(normalizedRuntimeUrl, cacheScopeKey),
      }),
    ]);
  }, [cacheScopeKey, queryClient]);

  const invalidateAgentLaunchReadinessResources = useCallback(async (
    runtimeUrl: string,
    // Cloud login-terminal callers (useAgentLoginTerminalWorkflow) read agent
    // readiness through useWorkspaceAgentCatalog, which is keyed by
    // workspaceId (anyHarnessWorkspaceAgentsKey), NOT runtimeUrl
    // (anyHarnessAgentsKey) — invalidating only the runtime-keyed entries
    // left the cloud-scoped catalog's cache untouched after a login, so a
    // successful cloud auth never surfaced as "ready" to that query. Pass
    // workspaceId whenever the caller resolved one so both cache shapes get
    // invalidated together.
    options?: { workspaceId?: string | null },
  ) => {
    const normalizedRuntimeUrl = runtimeUrl.trim();
    const workspaceId = options?.workspaceId ?? null;
    const tasks: Array<Promise<unknown>> = [];

    if (normalizedRuntimeUrl) {
      tasks.push(
        invalidateAgentSetupResources(normalizedRuntimeUrl),
        queryClient.invalidateQueries({
          queryKey: anyHarnessAgentLaunchOptionsPrefixKey(
            normalizedRuntimeUrl,
            cacheScopeKey,
          ),
        }),
        queryClient.invalidateQueries({
          queryKey: anyHarnessAgentGatewayModelsPrefixKey(
            normalizedRuntimeUrl,
            cacheScopeKey,
          ),
        }),
      );
    }

    if (workspaceId) {
      tasks.push(
        queryClient.invalidateQueries({
          queryKey: anyHarnessWorkspaceAgentsKey(cacheScopeKey, workspaceId),
        }),
        queryClient.invalidateQueries({
          queryKey: anyHarnessWorkspaceAgentReconcileStatusKey(cacheScopeKey, workspaceId),
        }),
      );
    }

    await Promise.all(tasks);
  }, [cacheScopeKey, invalidateAgentSetupResources, queryClient]);

  return {
    invalidateAgentLaunchReadinessResources,
    invalidateAgentListResources,
    invalidateAgentSetupResources,
  };
}
