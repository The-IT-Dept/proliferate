// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentSummary } from "@anyharness/sdk";
import { useAgentLoginTerminalWorkflow } from "#product/hooks/agents/workflows/use-agent-login-terminal-workflow";

// This hook is the transport seam for M5 task B: local calls go through
// @anyharness/sdk-react's mutation hooks (bound to the LOCAL AnyHarness
// runtime context); cloud calls must instead reach the user's cloud sandbox
// through the same connection source the chat/terminal surfaces use
// (useSelectedCloudRuntimeState -> cloud-sandbox-gateway.ts), calling the
// AnyHarness HTTP client directly. These tests pin that branch so a future
// change can't silently route cloud traffic to the local runtime (or vice
// versa).

const localStartMutateAsync = vi.hoisted(() => vi.fn());
const localCloseMutateAsync = vi.hoisted(() => vi.fn());
const startLoginTerminalClientFn = vi.hoisted(() => vi.fn());
const closeLoginTerminalClientFn = vi.hoisted(() => vi.fn());
const getAnyHarnessClientMock = vi.hoisted(() => vi.fn(() => ({
  agents: {
    startLoginTerminal: startLoginTerminalClientFn,
    closeLoginTerminal: closeLoginTerminalClientFn,
  },
})));
const invalidateAgentLaunchReadinessResources = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const withFreshCloudSandboxGatewayAccessTokenMock = vi.hoisted(() => vi.fn());

interface CloudConnectionInfoFixture {
  runtimeUrl: string;
  accessToken: string;
  anyharnessWorkspaceId: string | null;
  runtimeGeneration: number;
  allowedAgentKinds: string[];
  readyAgentKinds: string[];
  webSocketAuthTransport?: "protocol" | "query";
}

const state = vi.hoisted(() => ({
  runtime: { runtimeUrl: "http://127.0.0.1:8457", authToken: null as string | null },
  harnessConnection: {
    runtimeUrl: "http://127.0.0.1:8457",
    connectionState: "healthy" as "healthy" | "connecting" | "failed",
  },
  selectedCloudRuntime: {
    workspaceId: null as string | null,
    cloudWorkspaceId: null as string | null,
    state: null as { phase: string } | null,
    connectionInfo: null as CloudConnectionInfoFixture | null,
    retry: null as (() => void) | null,
    claim: null as (() => void) | null,
    claimPending: false,
  },
}));

vi.mock("@anyharness/sdk-react", () => ({
  useAnyHarnessRuntimeContext: () => state.runtime,
  useStartAgentLoginTerminalMutation: () => ({ mutateAsync: localStartMutateAsync }),
  useCloseAgentLoginTerminalMutation: () => ({ mutateAsync: localCloseMutateAsync }),
  getAnyHarnessClient: getAnyHarnessClientMock,
}));

vi.mock("#product/hooks/access/anyharness/agents/use-agent-resources-cache", () => ({
  useAgentResourcesCache: () => ({ invalidateAgentLaunchReadinessResources }),
}));

vi.mock("#product/hooks/workspaces/facade/use-selected-cloud-runtime-state", () => ({
  useSelectedCloudRuntimeState: () => state.selectedCloudRuntime,
}));

vi.mock("#product/lib/access/cloud/cloud-sandbox-gateway", () => ({
  withFreshCloudSandboxGatewayAccessToken: withFreshCloudSandboxGatewayAccessTokenMock,
}));

vi.mock("#product/stores/sessions/harness-connection-store", () => ({
  useHarnessConnectionStore: (selector: (s: typeof state.harnessConnection) => unknown) =>
    selector(state.harnessConnection),
}));

function agentFixture(kind = "claude"): AgentSummary {
  return { kind } as unknown as AgentSummary;
}

function terminalFixture(id: string) {
  return {
    id,
    kind: "claude",
    status: "starting" as const,
    commandDisplay: "claude",
    title: "Claude Code",
    cwd: "/",
    createdAt: "2026-07-18T00:00:00Z",
    updatedAt: "2026-07-18T00:00:00Z",
  };
}

const CLOUD_GATEWAY_URL = "https://api.example.com/v1/gateway/cloud-sandbox/anyharness";

function seedCloudConnection() {
  state.selectedCloudRuntime = {
    workspaceId: "cloud:workspace-1",
    cloudWorkspaceId: "workspace-1",
    state: { phase: "ready" },
    connectionInfo: {
      runtimeUrl: CLOUD_GATEWAY_URL,
      accessToken: "stale-token",
      anyharnessWorkspaceId: "aw-1",
      runtimeGeneration: 3,
      allowedAgentKinds: ["claude"],
      readyAgentKinds: [],
      webSocketAuthTransport: "protocol",
    },
    retry: null,
    claim: null,
    claimPending: false,
  };
  withFreshCloudSandboxGatewayAccessTokenMock.mockImplementation(
    async (connection: CloudConnectionInfoFixture) => ({
      ...connection,
      accessToken: "fresh-token",
    }),
  );
}

afterEach(() => {
  vi.clearAllMocks();
  state.runtime = { runtimeUrl: "http://127.0.0.1:8457", authToken: null };
  state.harnessConnection = { runtimeUrl: "http://127.0.0.1:8457", connectionState: "healthy" };
  state.selectedCloudRuntime = {
    workspaceId: null,
    cloudWorkspaceId: null,
    state: null,
    connectionInfo: null,
    retry: null,
    claim: null,
    claimPending: false,
  };
});

describe("useAgentLoginTerminalWorkflow - local surface (default)", () => {
  it("derives runtimeConnection from the local AnyHarness runtime context/store", () => {
    const { result } = renderHook(() => useAgentLoginTerminalWorkflow("local"));

    expect(result.current.runtimeConnection).toEqual({
      baseUrl: "http://127.0.0.1:8457",
      authToken: undefined,
    });
    expect(result.current.connectionAvailable).toBe(true);
  });

  it("starts a login terminal through the local sdk-react mutation, never the AnyHarness client directly", async () => {
    localStartMutateAsync.mockResolvedValue({
      agentLoginTerminal: terminalFixture("term-1"),
      message: null,
    });
    const { result } = renderHook(() => useAgentLoginTerminalWorkflow("local"));

    await act(async () => {
      await result.current.openAuthTerminal(agentFixture(), {});
    });

    expect(localStartMutateAsync).toHaveBeenCalledWith("claude");
    expect(getAnyHarnessClientMock).not.toHaveBeenCalled();
    expect(withFreshCloudSandboxGatewayAccessTokenMock).not.toHaveBeenCalled();
    expect(result.current.sessionsByKind.claude?.terminal?.id).toBe("term-1");
  });

  it("closes a login terminal through the local sdk-react mutation", async () => {
    localStartMutateAsync.mockResolvedValue({
      agentLoginTerminal: terminalFixture("term-1"),
      message: null,
    });
    localCloseMutateAsync.mockResolvedValue(undefined);
    const { result } = renderHook(() => useAgentLoginTerminalWorkflow("local"));

    await act(async () => {
      await result.current.openAuthTerminal(agentFixture(), {});
    });
    await act(async () => {
      await result.current.closeAuthTerminal("claude");
    });

    expect(localCloseMutateAsync).toHaveBeenCalledWith("term-1");
    expect(closeLoginTerminalClientFn).not.toHaveBeenCalled();
  });
});

describe("useAgentLoginTerminalWorkflow - cloud surface", () => {
  it("is unavailable and refuses to start when there is no cloud sandbox connection", async () => {
    const { result } = renderHook(() => useAgentLoginTerminalWorkflow("cloud"));
    expect(result.current.connectionAvailable).toBe(false);

    await act(async () => {
      await result.current.openAuthTerminal(agentFixture(), {});
    });

    expect(getAnyHarnessClientMock).not.toHaveBeenCalled();
    expect(localStartMutateAsync).not.toHaveBeenCalled();
    expect(result.current.sessionsByKind.claude?.errorMessage).toMatch(/cloud sandbox/i);
  });

  it("starts a login terminal through the AnyHarness client at the cloud gateway URL with a freshly-minted token", async () => {
    seedCloudConnection();
    startLoginTerminalClientFn.mockResolvedValue({
      agentLoginTerminal: terminalFixture("term-2"),
      message: null,
    });

    const { result } = renderHook(() => useAgentLoginTerminalWorkflow("cloud"));
    expect(result.current.connectionAvailable).toBe(true);

    await act(async () => {
      await result.current.openAuthTerminal(agentFixture(), {});
    });

    expect(withFreshCloudSandboxGatewayAccessTokenMock).toHaveBeenCalledWith(
      state.selectedCloudRuntime.connectionInfo,
    );
    expect(getAnyHarnessClientMock).toHaveBeenCalledWith({
      runtimeUrl: CLOUD_GATEWAY_URL,
      authToken: "fresh-token",
    });
    expect(startLoginTerminalClientFn).toHaveBeenCalledWith("claude");
    expect(localStartMutateAsync).not.toHaveBeenCalled();
    expect(result.current.sessionsByKind.claude?.terminal?.id).toBe("term-2");
    expect(result.current.runtimeConnection).toEqual({
      baseUrl: CLOUD_GATEWAY_URL,
      authToken: "fresh-token",
      webSocketAuthTransport: "protocol",
    });
  });

  it("closes a login terminal through the AnyHarness client, never the local sdk-react mutation", async () => {
    seedCloudConnection();
    startLoginTerminalClientFn.mockResolvedValue({
      agentLoginTerminal: terminalFixture("term-3"),
      message: null,
    });
    closeLoginTerminalClientFn.mockResolvedValue(undefined);

    const { result } = renderHook(() => useAgentLoginTerminalWorkflow("cloud"));
    await act(async () => {
      await result.current.openAuthTerminal(agentFixture(), {});
    });
    await act(async () => {
      await result.current.closeAuthTerminal("claude");
    });

    expect(closeLoginTerminalClientFn).toHaveBeenCalledWith("term-3");
    expect(localCloseMutateAsync).not.toHaveBeenCalled();
    // M5 review Fix 2: readiness invalidation must ALSO carry the cloud
    // workspaceId — useWorkspaceAgentCatalog's cache is keyed by workspaceId,
    // not runtimeUrl, so omitting it left the cloud-scoped agent catalog's
    // cache stale after a login (the post-login "ready" close/toast and the
    // readiness poll were both no-ops for cloud).
    expect(invalidateAgentLaunchReadinessResources).toHaveBeenCalledWith(
      CLOUD_GATEWAY_URL,
      { workspaceId: "cloud:workspace-1" },
    );
  });

  it("re-mints a fresh gateway token on demand via getFreshAuthToken (for the terminal viewport's WS reconnect)", async () => {
    seedCloudConnection();
    const { result } = renderHook(() => useAgentLoginTerminalWorkflow("cloud"));

    let token: string | undefined;
    await act(async () => {
      token = await result.current.getFreshAuthToken();
    });

    expect(token).toBe("fresh-token");
    expect(withFreshCloudSandboxGatewayAccessTokenMock).toHaveBeenCalledWith(
      state.selectedCloudRuntime.connectionInfo,
    );
  });

  it("getFreshAuthToken on the local surface returns the static runtime token without minting anything", async () => {
    state.runtime = { runtimeUrl: "http://127.0.0.1:8457", authToken: "local-token" };
    const { result } = renderHook(() => useAgentLoginTerminalWorkflow("local"));

    let token: string | undefined;
    await act(async () => {
      token = await result.current.getFreshAuthToken();
    });

    expect(token).toBe("local-token");
    expect(withFreshCloudSandboxGatewayAccessTokenMock).not.toHaveBeenCalled();
  });
});
