import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { fetch as expoFetch } from "expo/fetch";
import {
  resolveWorkspaceConnectionFromContext,
  useAnyHarnessWorkspaceContext,
} from "@anyharness/sdk-react";

import {
  NO_SESSION_SNAPSHOT,
  SessionTranscriptStreamController,
  type SessionTranscriptStreamConnectionState,
  type SessionTranscriptStreamSnapshot,
} from "./session-transcript-stream-controller";

export type {
  SessionTranscriptStreamConnectionState,
  SessionTranscriptStreamSnapshot,
} from "./session-transcript-stream-controller";

/**
 * Group E1 — the live transcript hook. There is no streaming hook in
 * `@anyharness/sdk-react` (confirmed: it only ships REST/React-Query hooks —
 * `hooks/sessions.ts` etc. — nothing wraps `streamSession`). This is that
 * missing piece: the plain SDK's `streamSession` + `reduceEvent` (via
 * `session-transcript-stream-state.ts`), exposed to React through
 * `useSyncExternalStore` per the plan's constraint.
 *
 * The connection + accumulated state itself lives in
 * `SessionTranscriptStreamController`
 * (`session-transcript-stream-controller.ts`) — extracted out of this file so
 * it's testable without RN/Expo render infra. This module is the thin React
 * seam on top: it owns the controller's lifecycle (recreated exactly when
 * `sessionId` changes, destroyed on unmount), threads `expo/fetch` in as the
 * streaming-capable `fetchImpl` (native `fetch` buffers response bodies
 * instead of streaming them), and bridges `active` toggles (the shell hides
 * Chat behind another segment without unmounting it — see
 * `MobileWorkspaceShell`) to `activate()`/`deactivate()` so pausing/resuming
 * never loses transcript state.
 */

export function useSessionTranscriptStream(input: {
  sessionId: string | null;
  /** Group D's off-segment gate: when the Chat segment isn't the shell's
   * active segment, the stream must pause (not keep streaming a hidden
   * screen) and resume — without losing accumulated transcript state — when
   * it becomes active again. */
  active: boolean;
}): SessionTranscriptStreamSnapshot {
  const workspace = useAnyHarnessWorkspaceContext();
  // `AnyHarnessWorkspace`'s context Provider doesn't memoize its `value`
  // object (`{workspaceId, resolveConnection}` is a fresh literal every
  // render — see `anyharness/sdk-react/src/context/AnyHarnessWorkspace.tsx`),
  // so `workspace` gets a new reference on every render of that provider,
  // whether or not the workspace actually changed. The sdk-react
  // REST/React-Query hooks don't notice because `queryFn` only runs when
  // react-query decides to, not on every render — but a `useCallback`
  // keyed on `workspace` directly would recompute (and, downstream, tear
  // down/reconnect the stream) on every one of those unrelated re-renders.
  // Mirroring the identity in a ref, read at call time instead of capture
  // time, keeps `resolveConnection` stable across renders while still
  // always resolving against the latest context value.
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

  // A ref, reconciled during render rather than via useMemo: the controller
  // must be recreated exactly when `sessionId` changes (fresh transcript for
  // a different session) and must NOT be recreated for any other reason —
  // useMemo doesn't guarantee that (React may drop memoized values), a
  // render-time ref swap does.
  const controllerRef = useRef<{
    sessionId: string | null;
    controller: SessionTranscriptStreamController | null;
  }>({ sessionId: null, controller: null });
  if (controllerRef.current.sessionId !== input.sessionId) {
    // Runs during render, so the destroy() here MUST be side-effect-silent
    // toward React: `SessionTranscriptStreamController.destroy()` drops its
    // subscribers before tearing the connection down precisely so this
    // render-phase call can't publish a `useSyncExternalStore` update
    // mid-render (see that method's comment).
    controllerRef.current.controller?.destroy();
    controllerRef.current = {
      sessionId: input.sessionId,
      controller: input.sessionId
        ? new SessionTranscriptStreamController(input.sessionId, {
          fetchImpl: expoFetch as unknown as typeof fetch,
        })
        : null,
    };
  }
  const controller = controllerRef.current.controller;

  const resolveConnection = useCallback(async () => {
    const resolved = await resolveWorkspaceConnectionFromContext(workspaceRef.current);
    return {
      baseUrl: resolved.connection.runtimeUrl,
      authToken: resolved.connection.authToken,
    };
  }, []);

  useEffect(() => {
    if (!controller || !input.active) {
      return;
    }
    controller.activate(resolveConnection);
    return () => {
      controller.deactivate();
    };
  }, [controller, input.active, resolveConnection]);

  useEffect(() => {
    return () => {
      controller?.destroy();
    };
  }, [controller]);

  const subscribe = useCallback(
    (listener: () => void) => (controller ? controller.subscribe(listener) : () => {}),
    [controller],
  );
  const getSnapshot = useCallback(
    () => (controller ? controller.getSnapshot() : NO_SESSION_SNAPSHOT),
    [controller],
  );

  return useSyncExternalStore(subscribe, getSnapshot);
}
