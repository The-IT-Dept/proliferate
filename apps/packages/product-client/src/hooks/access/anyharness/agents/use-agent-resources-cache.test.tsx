// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAgentResourcesCache } from "#product/hooks/access/anyharness/agents/use-agent-resources-cache";

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock("@anyharness/sdk-react", () => ({
  anyHarnessAgentsKey: (runtimeUrl: string, scope: string) =>
    ["anyharness", scope, "runtime", runtimeUrl, "agents"],
  anyHarnessAgentReconcileStatusKey: (runtimeUrl: string, scope: string) =>
    ["anyharness", scope, "runtime", runtimeUrl, "agents", "reconcile-status"],
  anyHarnessAgentLaunchOptionsPrefixKey: (runtimeUrl: string, scope: string) =>
    ["anyharness", scope, "runtime", runtimeUrl, "agents", "launch-options"],
  anyHarnessAgentGatewayModelsPrefixKey: (runtimeUrl: string, scope: string) =>
    ["anyharness", scope, "runtime", runtimeUrl, "agents", "gateway-models"],
  anyHarnessWorkspaceAgentsKey: (scope: string, workspaceId: string | null) =>
    ["anyharness", scope, "workspace", workspaceId, "agents"],
  anyHarnessWorkspaceAgentReconcileStatusKey: (scope: string, workspaceId: string | null) =>
    ["anyharness", scope, "workspace", workspaceId, "agents", "reconcile-status"],
  useAnyHarnessCacheScopeKey: () => "account-1",
}));

describe("useAgentResourcesCache", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("invalidates launch options and gateway models after an auth-route change", async () => {
    mocks.invalidateQueries.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAgentResourcesCache());

    await act(async () => {
      await result.current.invalidateAgentLaunchReadinessResources("http://runtime.test");
    });

    const keys = mocks.invalidateQueries.mock.calls.map(([input]) => input.queryKey);
    expect(keys).toContainEqual([
      "anyharness",
      "account-1",
      "runtime",
      "http://runtime.test",
      "agents",
      "launch-options",
    ]);
    expect(keys).toContainEqual([
      "anyharness",
      "account-1",
      "runtime",
      "http://runtime.test",
      "agents",
      "gateway-models",
    ]);
  });

  // M5 review Fix 2: cloud login-terminal callers read agent readiness
  // through useWorkspaceAgentCatalog, whose cache is keyed by workspaceId
  // (anyHarnessWorkspaceAgentsKey), not runtimeUrl. Passing workspaceId must
  // ALSO invalidate that cache shape, or a completed cloud login never
  // surfaces as "ready" to the cloud-scoped catalog.
  it("also invalidates the workspace-scoped catalog cache when a workspaceId is given", async () => {
    mocks.invalidateQueries.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAgentResourcesCache());

    await act(async () => {
      await result.current.invalidateAgentLaunchReadinessResources(
        "http://runtime.test",
        { workspaceId: "cloud:workspace-1" },
      );
    });

    const keys = mocks.invalidateQueries.mock.calls.map(([input]) => input.queryKey);
    expect(keys).toContainEqual([
      "anyharness",
      "account-1",
      "workspace",
      "cloud:workspace-1",
      "agents",
    ]);
    expect(keys).toContainEqual([
      "anyharness",
      "account-1",
      "workspace",
      "cloud:workspace-1",
      "agents",
      "reconcile-status",
    ]);
    // The runtime-keyed invalidations still fire alongside — workspaceId is
    // additive, not a replacement.
    expect(keys).toContainEqual([
      "anyharness",
      "account-1",
      "runtime",
      "http://runtime.test",
      "agents",
      "launch-options",
    ]);
  });

  it("omits the workspace-scoped invalidation when no workspaceId is given (local surface)", async () => {
    mocks.invalidateQueries.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAgentResourcesCache());

    await act(async () => {
      await result.current.invalidateAgentLaunchReadinessResources("http://runtime.test");
    });

    const keys = mocks.invalidateQueries.mock.calls.map(([input]) => input.queryKey);
    expect(keys.some((key) => key.includes("workspace"))).toBe(false);
  });

  it("can propagate a list refetch failure to terminal-refresh callers", async () => {
    const failure = new Error("agent list refetch failed");
    mocks.invalidateQueries.mockRejectedValue(failure);
    const { result } = renderHook(() => useAgentResourcesCache());

    await expect(result.current.invalidateAgentListResources(
      "http://runtime.test",
      { throwOnError: true },
    )).rejects.toBe(failure);
    expect(mocks.invalidateQueries).toHaveBeenCalledWith(
      {
        queryKey: [
          "anyharness",
          "account-1",
          "runtime",
          "http://runtime.test",
          "agents",
        ],
      },
      { throwOnError: true },
    );
  });
});
