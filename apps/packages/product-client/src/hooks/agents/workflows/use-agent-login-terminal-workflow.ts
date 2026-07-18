import {
  AnyHarnessError,
  type AgentLoginTerminalRecord,
  type AgentSummary,
  type TerminalWebSocketAuthTransport,
} from "@anyharness/sdk";
import {
  getAnyHarnessClient,
  useAnyHarnessRuntimeContext,
  useCloseAgentLoginTerminalMutation,
  useStartAgentLoginTerminalMutation,
} from "@anyharness/sdk-react";
import type { AgentAuthSurface } from "@proliferate/cloud-sdk";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAgentResourcesCache } from "#product/hooks/access/anyharness/agents/use-agent-resources-cache";
import { useSelectedCloudRuntimeState } from "#product/hooks/workspaces/facade/use-selected-cloud-runtime-state";
import { withFreshCloudSandboxGatewayAccessToken } from "#product/lib/access/cloud/cloud-sandbox-gateway";
import { useHarnessConnectionStore } from "#product/stores/sessions/harness-connection-store";

export interface AgentLoginTerminalSession {
  kind: string;
  terminal: AgentLoginTerminalRecord | null;
  message: string | null;
  errorMessage: string | null;
  isStarting: boolean;
  focusRequestToken: number;
}

/**
 * The runtime the login-terminal start/close calls and the terminal's WS
 * stream connect to. Local and cloud resolve this differently (see
 * `useAgentLoginTerminalWorkflow`) but expose the same shape so callers
 * (`AgentLoginTerminalPanel`) never branch on surface themselves.
 */
export interface AgentLoginTerminalRuntimeConnection {
  baseUrl: string;
  authToken?: string;
  /** Cloud only: the gateway's WS auth transport (contract: "protocol" —
   * see `cloud-sandbox-gateway.ts`). Undefined for local (query-param auth,
   * `connectAgentLoginTerminal`'s default). */
  webSocketAuthTransport?: TerminalWebSocketAuthTransport;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof AnyHarnessError) {
    if (error.problem.status === 404) {
      return "The current AnyHarness runtime does not expose in-product auth terminals yet. Restart Proliferate so the bundled runtime picks up the latest auth support.";
    }
    return error.problem.detail ?? error.problem.title;
  }
  return error instanceof Error ? error.message : String(error);
}

export function useAgentLoginTerminalWorkflow(surface: AgentAuthSurface = "local") {
  // Owns Agent Defaults' auth terminal workflow (both surfaces). Components
  // decide layout; this hook owns start/close/restart and post-exit
  // readiness refresh.
  //
  // LOCAL path (unchanged): the desktop's own AnyHarness runtime, reached
  // through the app-wide AnyHarnessRuntime context/store
  // (`@anyharness/sdk-react`'s mutation hooks below are hardwired to that
  // context — see `ProductProviderRoot`).
  const isCloud = surface === "cloud";
  const runtime = useAnyHarnessRuntimeContext();
  const runtimeUrl = useHarnessConnectionStore((state) => state.runtimeUrl);
  const connectionState = useHarnessConnectionStore((state) => state.connectionState);
  const localStartLoginTerminal = useStartAgentLoginTerminalMutation();
  const localCloseLoginTerminal = useCloseAgentLoginTerminalMutation();

  // CLOUD path: the user's active cloud sandbox, reached through the SAME
  // connection source the chat/terminal surfaces already use to talk to a
  // cloud sandbox's AnyHarness runtime (`useSelectedCloudRuntimeState` ->
  // `cloud-sandbox-gateway.ts`'s `resolveCloudSandboxGatewayConnectionFor*`),
  // proxied server-side at `/v1/gateway/cloud-sandbox/anyharness/*`
  // (server/proliferate/server/cloud/gateway/api.py). This mirrors
  // `use-terminal-workspace-connection.ts`'s cloud fast path: since
  // `@anyharness/sdk-react`'s mutation hooks only read the LOCAL runtime
  // context, the cloud path calls the AnyHarness HTTP client directly.
  const selectedCloudRuntime = useSelectedCloudRuntimeState();
  const cloudConnectionInfo = isCloud ? selectedCloudRuntime.connectionInfo : null;
  const cloudConnectionReady = isCloud
    && selectedCloudRuntime.state?.phase === "ready"
    && cloudConnectionInfo !== null;
  // The gateway access token is short-lived (WDU slice 04 G4); the cached
  // `connectionInfo.accessToken` can go stale between renders, so every
  // outbound call re-mints one immediately before use (never trusted from
  // this snapshot) — see `resolveFreshCloudConnection`. This snapshot only
  // backs the DISPLAYED `runtimeConnection` (gating + the terminal panel's
  // WS connect), seeded with the freshest connection we actually resolved.
  const [cloudRuntimeSnapshot, setCloudRuntimeSnapshot] =
    useState<AgentLoginTerminalRuntimeConnection | null>(null);

  // A different cloud sandbox (or a fresh generation of the same one)
  // invalidates any snapshot captured for the previous identity.
  useEffect(() => {
    if (!isCloud) {
      return;
    }
    setCloudRuntimeSnapshot(null);
  }, [isCloud, cloudConnectionInfo?.anyharnessWorkspaceId, cloudConnectionInfo?.runtimeGeneration]);

  const [sessionsByKind, setSessionsByKind] = useState<Record<string, AgentLoginTerminalSession>>({});

  const runtimeConnection: AgentLoginTerminalRuntimeConnection = useMemo(() => {
    if (isCloud) {
      return cloudRuntimeSnapshot ?? {
        baseUrl: cloudConnectionInfo?.runtimeUrl.trim() ?? "",
        authToken: cloudConnectionInfo?.accessToken,
        webSocketAuthTransport: cloudConnectionInfo?.webSocketAuthTransport,
      };
    }
    return {
      baseUrl: runtime.runtimeUrl?.trim() || runtimeUrl.trim(),
      authToken: runtime.authToken ?? undefined,
    };
  }, [
    cloudConnectionInfo,
    cloudRuntimeSnapshot,
    isCloud,
    runtime.authToken,
    runtime.runtimeUrl,
    runtimeUrl,
  ]);

  // Whether a runtime connection is available AT ALL for this surface — the
  // gate `openAuthTerminal`/the polling effect refuse to run past, and what
  // cloud `CliDetails` uses to decide whether to render the login flow.
  const connectionAvailable = isCloud
    ? cloudConnectionReady
    : connectionState === "healthy" && runtimeConnection.baseUrl.trim().length > 0;

  // Resolve a FRESH cloud connection (fresh gateway access token) right
  // before each HTTP call, exactly like `use-terminal-workspace-connection`'s
  // cloud fast path — the cached `connectionInfo.accessToken` is not trusted
  // as still valid. Also updates the displayed snapshot so the terminal
  // panel's WS connect reuses the same just-minted token rather than
  // fetching a second one moments later.
  const resolveFreshCloudConnection =
    useCallback(async (): Promise<AgentLoginTerminalRuntimeConnection> => {
      if (!cloudConnectionInfo) {
        throw new Error("Cloud sandbox connection is not available.");
      }
      const fresh = await withFreshCloudSandboxGatewayAccessToken(cloudConnectionInfo);
      const resolved: AgentLoginTerminalRuntimeConnection = {
        baseUrl: fresh.runtimeUrl,
        authToken: fresh.accessToken,
        webSocketAuthTransport: fresh.webSocketAuthTransport,
      };
      setCloudRuntimeSnapshot(resolved);
      return resolved;
    }, [cloudConnectionInfo]);

  const { invalidateAgentLaunchReadinessResources } = useAgentResourcesCache();
  const activeSessionCount = useMemo(
    () => Object.values(sessionsByKind).filter((session) =>
      session.isStarting || session.terminal
    ).length,
    [sessionsByKind],
  );

  const refreshAgentReadiness = useCallback(async () => {
    await invalidateAgentLaunchReadinessResources(runtimeConnection.baseUrl);
  }, [invalidateAgentLaunchReadinessResources, runtimeConnection.baseUrl]);

  const startLoginTerminalRequest = useCallback(async (kind: string) => {
    if (isCloud) {
      const connection = await resolveFreshCloudConnection();
      const client = getAnyHarnessClient({
        runtimeUrl: connection.baseUrl,
        authToken: connection.authToken,
      });
      return client.agents.startLoginTerminal(kind);
    }
    return localStartLoginTerminal.mutateAsync(kind);
  }, [isCloud, localStartLoginTerminal, resolveFreshCloudConnection]);

  const closeLoginTerminalRequest = useCallback(async (terminalId: string) => {
    if (isCloud) {
      const connection = await resolveFreshCloudConnection();
      const client = getAnyHarnessClient({
        runtimeUrl: connection.baseUrl,
        authToken: connection.authToken,
      });
      await client.agents.closeLoginTerminal(terminalId);
      return;
    }
    await localCloseLoginTerminal.mutateAsync(terminalId);
  }, [isCloud, localCloseLoginTerminal, resolveFreshCloudConnection]);

  const closeExistingTerminal = useCallback(async (
    session: AgentLoginTerminalSession | undefined,
  ) => {
    const terminalId = session?.terminal?.id;
    if (!terminalId) {
      return;
    }
    try {
      await closeLoginTerminalRequest(terminalId);
    } catch {
      // Closing is best effort; the runtime will reap exited PTYs.
    }
  }, [closeLoginTerminalRequest]);

  const openAuthTerminal = useCallback(async (
    agent: AgentSummary,
    options?: { restart?: boolean },
  ) => {
    if (!connectionAvailable) {
      setSessionsByKind((current) => ({
        ...current,
        [agent.kind]: {
          kind: agent.kind,
          terminal: current[agent.kind]?.terminal ?? null,
          message: current[agent.kind]?.message ?? null,
          errorMessage: isCloud
            ? "No cloud sandbox is connected."
            : "AnyHarness runtime is not available.",
          isStarting: false,
          focusRequestToken: (current[agent.kind]?.focusRequestToken ?? 0) + 1,
        },
      }));
      return;
    }

    const existingSession = sessionsByKind[agent.kind];
    if (existingSession?.terminal && !options?.restart) {
      setSessionsByKind((current) => ({
        ...current,
        [agent.kind]: {
          ...existingSession,
          focusRequestToken: existingSession.focusRequestToken + 1,
        },
      }));
      return;
    }

    await closeExistingTerminal(existingSession);

    setSessionsByKind((current) => ({
      ...current,
      [agent.kind]: {
        kind: agent.kind,
        terminal: null,
        message: null,
        errorMessage: null,
        isStarting: true,
        focusRequestToken: (current[agent.kind]?.focusRequestToken ?? 0) + 1,
      },
    }));

    try {
      const response = await startLoginTerminalRequest(agent.kind);
      setSessionsByKind((current) => ({
        ...current,
        [agent.kind]: {
          kind: agent.kind,
          terminal: response.agentLoginTerminal,
          message: response.message ?? null,
          errorMessage: null,
          isStarting: false,
          focusRequestToken: (current[agent.kind]?.focusRequestToken ?? 0) + 1,
        },
      }));
    } catch (error) {
      setSessionsByKind((current) => ({
        ...current,
        [agent.kind]: {
          kind: agent.kind,
          terminal: null,
          message: null,
          errorMessage: toErrorMessage(error),
          isStarting: false,
          focusRequestToken: (current[agent.kind]?.focusRequestToken ?? 0) + 1,
        },
      }));
    }
  }, [
    closeExistingTerminal,
    connectionAvailable,
    isCloud,
    sessionsByKind,
    startLoginTerminalRequest,
  ]);

  const closeAuthTerminal = useCallback(async (kind: string) => {
    const session = sessionsByKind[kind];
    setSessionsByKind((current) => {
      const next = { ...current };
      delete next[kind];
      return next;
    });
    await closeExistingTerminal(session);
    await refreshAgentReadiness();
  }, [closeExistingTerminal, refreshAgentReadiness, sessionsByKind]);

  const handleTerminalExit = useCallback(async (
    kind: string,
    code: number | null,
  ) => {
    setSessionsByKind((current) => {
      const session = current[kind];
      if (!session?.terminal) {
        return current;
      }
      return {
        ...current,
        [kind]: {
          ...session,
          terminal: {
            ...session.terminal,
            status: "exited",
            exitCode: code,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
    await refreshAgentReadiness();
  }, [refreshAgentReadiness]);

  useEffect(() => {
    if (activeSessionCount === 0 || !connectionAvailable) {
      return;
    }

    const tick = () => {
      void refreshAgentReadiness();
    };
    const firstRefresh = window.setTimeout(tick, 1000);
    const interval = window.setInterval(tick, 2500);
    return () => {
      window.clearTimeout(firstRefresh);
      window.clearInterval(interval);
    };
  }, [
    activeSessionCount,
    connectionAvailable,
    refreshAgentReadiness,
  ]);

  return {
    closeAuthTerminal,
    connectionAvailable,
    handleTerminalExit,
    openAuthTerminal,
    refreshAgentReadiness,
    runtimeConnection,
    sessionsByKind,
  };
}
