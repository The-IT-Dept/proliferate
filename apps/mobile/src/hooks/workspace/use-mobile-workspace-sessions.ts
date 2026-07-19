import { useCallback } from "react";
import type { CreateSessionRequest, Session } from "@anyharness/sdk";
import {
  useCloseSessionMutation,
  useCreateSessionMutation,
  useDismissSessionMutation,
  useWorkspaceSessionsQuery,
} from "@anyharness/sdk-react";

/**
 * Group D — the Sessions segment's data + actions, consuming the shared
 * `@anyharness/sdk-react` hooks verbatim (no hand-rolled API calls). These
 * work because the workspace route mounts `AnyHarnessRuntime` +
 * `AnyHarnessWorkspace` at the shell (via `MobileWorkspaceRuntimeProvider`),
 * so the hooks resolve the cloud-sandbox gateway connection from context:
 *
 * - `useWorkspaceSessionsQuery()` -> `client.sessions.list(...)` (Session[]).
 * - `useCreateSessionMutation()` -> `client.sessions.create(request)`; on
 *   success it invalidates the sessions list, so a new row appears after a
 *   real refetch — no optimistic insert that could desync.
 * - `useDismissSessionMutation()` -> `client.sessions.dismiss(id)` (the "Hide"
 *   action; the row drops out of the default list after invalidation).
 * - `useCloseSessionMutation()` -> `client.sessions.close(id)` (the row moves
 *   to the Earlier group after invalidation).
 *
 * `sessions.list` does not include dismissed sessions by default and the shared
 * query hook doesn't expose `includeDismissed`, so Hide removes the row from
 * view (consistent with "dismiss = hide"); surfacing hidden sessions inline
 * would need that flag and is out of Group D scope.
 */
export function useMobileWorkspaceSessions(anyharnessWorkspaceId: string | null) {
  const sessionsQuery = useWorkspaceSessionsQuery();
  const createMutation = useCreateSessionMutation();
  const dismissMutation = useDismissSessionMutation();
  const closeMutation = useCloseSessionMutation();

  const createSession = useCallback(
    (input: Pick<CreateSessionRequest, "agentKind" | "modelId" | "modeId">): Promise<Session> => {
      if (!anyharnessWorkspaceId) {
        return Promise.reject(new Error("Workspace runtime is not ready yet."));
      }
      return createMutation.mutateAsync({
        workspaceId: anyharnessWorkspaceId,
        agentKind: input.agentKind,
        ...(input.modelId ? { modelId: input.modelId } : {}),
        ...(input.modeId ? { modeId: input.modeId } : {}),
        subagentsEnabled: false,
        origin: { kind: "system", entrypoint: "cloud" },
      });
    },
    [anyharnessWorkspaceId, createMutation],
  );

  const dismissSession = useCallback(
    (sessionId: string): Promise<Session> => dismissMutation.mutateAsync(sessionId),
    [dismissMutation],
  );

  const closeSession = useCallback(
    (sessionId: string): Promise<Session> => closeMutation.mutateAsync(sessionId),
    [closeMutation],
  );

  return {
    sessions: sessionsQuery.data ?? [],
    isLoading: sessionsQuery.isLoading,
    isError: sessionsQuery.isError,
    refetch: sessionsQuery.refetch,

    createSession,
    isCreatingSession: createMutation.isPending,

    dismissSession,
    isDismissingSession: dismissMutation.isPending,

    closeSession,
    isClosingSession: closeMutation.isPending,
  };
}
