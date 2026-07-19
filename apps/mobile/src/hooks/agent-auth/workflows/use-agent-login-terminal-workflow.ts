import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AgentSummary } from "@anyharness/sdk";
import {
  anyHarnessAgentsKey,
  resolveRuntimeCacheScopeKey,
  useAnyHarnessRuntimeContext,
  useCloseAgentLoginTerminalMutation,
  useStartAgentLoginTerminalMutation,
} from "@anyharness/sdk-react";

import {
  agentLoginTerminalSessionReducer,
  deriveAgentLoginTerminalErrorMessage,
  type AgentLoginTerminalSessionState,
} from "../../../lib/domain/agent-auth/agent-login-terminal";

/**
 * Group H — the device-code login terminal's start/close/exit workflow,
 * mobile's (cloud-only) equivalent of product-client web's
 * `useAgentLoginTerminalWorkflow`
 * (`hooks/agents/workflows/use-agent-login-terminal-workflow.ts`). Mobile
 * drops the local/cloud surface branch entirely (`AgentAuthSurface`) — every
 * mobile connection is the cloud gateway resolved via the RUNTIME-scoped
 * AnyHarness context (`MobileWorkspaceRuntimeProvider`'s doc comment: "used
 * for non-workspace-scoped queries like the agent catalog") — and drops the
 * gateway-token-refresh dance (`resolveFreshCloudConnection`/
 * `getFreshAuthToken`): that exists on web because a cloud SANDBOX's gateway
 * token is short-lived per-sandbox-session; mobile's runtime `authToken` is
 * the user's own product access token (`MobileWorkspaceRuntimeProvider`),
 * which the existing `MobileAuthProvider` refresh flow already keeps live,
 * not something this hook needs to re-mint per connect.
 *
 * All state-transition logic (the `sessionsByKind` shape/updates) is the
 * pure, TDD'd `agentLoginTerminalSessionReducer`
 * (`lib/domain/agent-auth/agent-login-terminal.ts`) — this hook is just glue:
 * calling the sdk-react mutations and dispatching their outcomes into that
 * reducer.
 */

export function useAgentLoginTerminalWorkflow() {
  const runtime = useAnyHarnessRuntimeContext();
  const runtimeUrl = runtime.runtimeUrl?.trim() ?? "";
  const queryClient = useQueryClient();
  const cacheScopeKey = resolveRuntimeCacheScopeKey(runtime);

  const startLoginTerminal = useStartAgentLoginTerminalMutation();
  const closeLoginTerminal = useCloseAgentLoginTerminalMutation();

  const [sessionsByKind, setSessionsByKind] = useState<
    Record<string, AgentLoginTerminalSessionState>
  >({});

  // Refs so the unmount cleanup below (deliberately a `[]`-deps effect, since
  // it must fire its cleanup exactly once — on TRUE unmount — not on every
  // sessionsByKind/closeLoginTerminal identity change) always reads the
  // latest session state and mutation without needing to be in its deps.
  const sessionsByKindRef = useRef(sessionsByKind);
  sessionsByKindRef.current = sessionsByKind;
  const closeLoginTerminalRef = useRef(closeLoginTerminal);
  closeLoginTerminalRef.current = closeLoginTerminal;

  // Mirrors web's `connectionAvailable`, minus the cloud-sandbox-phase check
  // (mobile has no separate "sandbox provisioning" state surfaced to this
  // hook) — a runtime URL means the user is signed in and the gateway is
  // reachable in principle; a sandbox that isn't actually ready yet surfaces
  // as a start-terminal mutation error instead (handled below via
  // deriveAgentLoginTerminalErrorMessage's 404 branch), same as web's
  // "runtime does not expose in-product auth terminals yet" case.
  const connectionAvailable = runtimeUrl.length > 0;

  const refreshAgentAuthStatus = useCallback(async () => {
    await queryClient.invalidateQueries({
      queryKey: anyHarnessAgentsKey(runtimeUrl, cacheScopeKey),
    });
  }, [queryClient, runtimeUrl, cacheScopeKey]);

  const openAuthTerminal = useCallback(
    async (agent: AgentSummary, options?: { restart?: boolean }) => {
      const kind = agent.kind;
      if (!connectionAvailable) {
        setSessionsByKind((current) => ({
          ...current,
          [kind]: agentLoginTerminalSessionReducer(kind, current[kind], {
            type: "start_failed",
            message: "No cloud sandbox is connected.",
          }),
        }));
        return;
      }

      const existing = sessionsByKind[kind];
      if (existing?.terminal && !options?.restart) {
        setSessionsByKind((current) => ({
          ...current,
          [kind]: agentLoginTerminalSessionReducer(kind, current[kind], { type: "focus" }),
        }));
        return;
      }

      if (existing?.terminal) {
        try {
          await closeLoginTerminal.mutateAsync(existing.terminal.id);
        } catch {
          // Best effort — the runtime reaps exited PTYs on its own.
        }
      }

      setSessionsByKind((current) => ({
        ...current,
        [kind]: agentLoginTerminalSessionReducer(kind, current[kind], { type: "start_requested" }),
      }));

      try {
        const response = await startLoginTerminal.mutateAsync(kind);
        setSessionsByKind((current) => ({
          ...current,
          [kind]: agentLoginTerminalSessionReducer(kind, current[kind], {
            type: "start_succeeded",
            response,
          }),
        }));
      } catch (error) {
        setSessionsByKind((current) => ({
          ...current,
          [kind]: agentLoginTerminalSessionReducer(kind, current[kind], {
            type: "start_failed",
            message: deriveAgentLoginTerminalErrorMessage(error),
          }),
        }));
      }
    },
    [closeLoginTerminal, connectionAvailable, sessionsByKind, startLoginTerminal],
  );

  const closeAuthTerminal = useCallback(
    async (kind: string) => {
      const session = sessionsByKind[kind];
      setSessionsByKind((current) => {
        const next = { ...current };
        delete next[kind];
        return next;
      });
      const terminalId = session?.terminal?.id;
      if (terminalId) {
        try {
          await closeLoginTerminal.mutateAsync(terminalId);
        } catch {
          // Best effort — see openAuthTerminal's restart path.
        }
      }
      await refreshAgentAuthStatus();
    },
    [closeLoginTerminal, refreshAgentAuthStatus, sessionsByKind],
  );

  const handleTerminalExit = useCallback(
    async (kind: string, code: number | null) => {
      setSessionsByKind((current) => {
        if (!current[kind]?.terminal) {
          return current;
        }
        return {
          ...current,
          [kind]: agentLoginTerminalSessionReducer(kind, current[kind], { type: "exit", code }),
        };
      });
      await refreshAgentAuthStatus();
    },
    [refreshAgentAuthStatus],
  );

  // Backing out of MobileAgentAuthDetailScreen while a login PTY is still
  // `running`/`starting` only tears down the client-side WS — nothing else
  // DELETEs the runtime-side login-terminal record, since closeLoginTerminal
  // is otherwise only reachable via the Close button (closeAuthTerminal).
  // That leaks a live PTY server-side for every login abandoned by
  // navigating away instead of closing it. Mirror that close, best-effort,
  // for every session with a live terminal on unmount — fire-and-forget
  // (unmount must not block on the network call), same "best effort" spirit
  // as openAuthTerminal/closeAuthTerminal's own close calls above.
  useEffect(() => {
    return () => {
      for (const session of Object.values(sessionsByKindRef.current)) {
        const terminal = session.terminal;
        // Skip terminals that are already dead (exited/failed) — nothing to
        // tear down server-side, and it's a cheap status check to avoid an
        // unnecessary DELETE call on unmount.
        if (!terminal || terminal.status === "exited" || terminal.status === "failed") {
          continue;
        }
        closeLoginTerminalRef.current.mutateAsync(terminal.id).catch(() => {
          // Best effort — see openAuthTerminal's restart path. The component
          // is already unmounted, so there's nothing to surface this to.
        });
      }
    };
  }, []);

  return useMemo(
    () => ({
      connectionAvailable,
      sessionsByKind,
      runtimeUrl: runtime.runtimeUrl,
      authToken: runtime.authToken,
      openAuthTerminal,
      closeAuthTerminal,
      handleTerminalExit,
      refreshAgentAuthStatus,
    }),
    [
      connectionAvailable,
      sessionsByKind,
      runtime.runtimeUrl,
      runtime.authToken,
      openAuthTerminal,
      closeAuthTerminal,
      handleTerminalExit,
      refreshAgentAuthStatus,
    ],
  );
}

export type AgentLoginTerminalWorkflow = ReturnType<typeof useAgentLoginTerminalWorkflow>;
