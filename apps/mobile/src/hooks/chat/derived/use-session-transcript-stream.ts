import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  streamSession,
  type SessionEventEnvelope,
  type SessionStreamHandle,
  type TranscriptState,
} from "@anyharness/sdk";
import {
  resolveWorkspaceConnectionFromContext,
  useAnyHarnessWorkspaceContext,
} from "@anyharness/sdk-react";

import { callWithStreamingFetch } from "../../../lib/access/anyharness/native-streaming-fetch";
import {
  applyStreamEnvelope,
  createSessionTranscriptStreamState,
  type SessionTranscriptStreamState,
} from "./session-transcript-stream-state";

/**
 * Group E1 — the live transcript hook. There is no streaming hook in
 * `@anyharness/sdk-react` (confirmed: it only ships REST/React-Query hooks —
 * `hooks/sessions.ts` etc. — nothing wraps `streamSession`). This is that
 * missing piece: the plain SDK's `streamSession` + `reduceEvent` (via
 * `session-transcript-stream-state.ts`), exposed to React through
 * `useSyncExternalStore` per the plan's constraint.
 *
 * One controller instance owns one session's connection + accumulated state
 * outside React (`SessionTranscriptStreamController`), so pausing/resuming
 * across `active` toggles (the shell hides Chat behind another segment
 * without unmounting it — see `MobileWorkspaceShell`) never loses transcript
 * state: `deactivate()` closes the network connection but keeps `state`;
 * `activate()` resumes from `state.lastSeq` via `afterSeq`.
 */

export type SessionTranscriptStreamConnectionState =
  | "idle"
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed"
  | "error";

export interface SessionTranscriptStreamSnapshot {
  transcript: TranscriptState;
  envelopes: readonly SessionEventEnvelope[];
  connectionState: SessionTranscriptStreamConnectionState;
  /** True once the stream has opened at least once for this session, so
   * callers can tell "no pending interactions because none have happened
   * yet" apart from "haven't synced with the server yet" (mirrors
   * react-query's `isFetched`). Sticky across reconnects. */
  hasSynced: boolean;
  error: Error | null;
}

interface SessionStreamConnectionInfo {
  baseUrl: string;
  authToken?: string;
  headers?: HeadersInit;
}

const RECONNECT_DELAY_MS = 1_500;

/** Stable-by-reference snapshot for "no session selected" — `getSnapshot`
 * must return the same reference across calls when nothing changed, or
 * `useSyncExternalStore` re-renders forever. */
const NO_SESSION_SNAPSHOT: SessionTranscriptStreamSnapshot = {
  transcript: createSessionTranscriptStreamState("").transcript,
  envelopes: [],
  connectionState: "idle",
  hasSynced: false,
  error: null,
};

class SessionTranscriptStreamController {
  private state: SessionTranscriptStreamState;
  private connectionState: SessionTranscriptStreamConnectionState = "idle";
  private hasSynced = false;
  private error: Error | null = null;
  private snapshot: SessionTranscriptStreamSnapshot;
  private readonly listeners = new Set<() => void>();
  private handle: SessionStreamHandle | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private active = false;

  constructor(private readonly sessionId: string) {
    this.state = createSessionTranscriptStreamState(sessionId);
    this.snapshot = this.buildSnapshot();
  }

  getSnapshot = (): SessionTranscriptStreamSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  activate(resolveConnection: () => Promise<SessionStreamConnectionInfo>): void {
    this.active = true;
    if (this.connectionState === "open" || this.connectionState === "connecting") {
      return;
    }
    this.connect(resolveConnection);
  }

  deactivate(): void {
    this.active = false;
    this.generation += 1;
    this.clearReconnectTimer();
    this.handle?.close();
    this.handle = null;
    if (this.connectionState !== "idle" && this.connectionState !== "closed") {
      this.connectionState = "closed";
      this.publish();
    }
  }

  destroy(): void {
    this.deactivate();
    this.listeners.clear();
  }

  private connect(resolveConnection: () => Promise<SessionStreamConnectionInfo>): void {
    const generation = (this.generation += 1);
    this.connectionState = this.state.lastSeq > 0 ? "reconnecting" : "connecting";
    this.error = null;
    this.publish();

    void resolveConnection()
      .then((connection) => {
        if (generation !== this.generation || !this.active) {
          return;
        }
        this.handle = callWithStreamingFetch(() =>
          streamSession({
            baseUrl: connection.baseUrl,
            sessionId: this.sessionId,
            authToken: connection.authToken,
            headers: connection.headers,
            afterSeq: this.state.lastSeq > 0 ? this.state.lastSeq : undefined,
            onOpen: () => {
              if (generation !== this.generation) return;
              this.connectionState = "open";
              this.hasSynced = true;
              this.publish();
            },
            onEvent: (envelope) => {
              if (generation !== this.generation) return;
              const next = applyStreamEnvelope(this.state, envelope);
              if (next === this.state) return;
              this.state = next;
              this.publish();
            },
            onError: (error) => {
              if (generation !== this.generation) return;
              this.error = error;
              this.connectionState = "error";
              this.publish();
              this.scheduleReconnect(resolveConnection, generation);
            },
            onClose: () => {
              if (generation !== this.generation) return;
              if (this.active) {
                this.connectionState = "reconnecting";
                this.publish();
                this.scheduleReconnect(resolveConnection, generation);
              } else {
                this.connectionState = "closed";
                this.publish();
              }
            },
          })
        );
      })
      .catch((error: unknown) => {
        if (generation !== this.generation) return;
        this.error = error instanceof Error
          ? error
          : new Error("Failed to resolve the session stream connection.");
        this.connectionState = "error";
        this.publish();
        this.scheduleReconnect(resolveConnection, generation);
      });
  }

  private scheduleReconnect(
    resolveConnection: () => Promise<SessionStreamConnectionInfo>,
    generation: number,
  ): void {
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      if (generation !== this.generation || !this.active) return;
      this.connect(resolveConnection);
    }, RECONNECT_DELAY_MS);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private buildSnapshot(): SessionTranscriptStreamSnapshot {
    return {
      transcript: this.state.transcript,
      envelopes: this.state.envelopes,
      connectionState: this.connectionState,
      hasSynced: this.hasSynced,
      error: this.error,
    };
  }

  private publish(): void {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) {
      listener();
    }
  }
}

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
    controllerRef.current.controller?.destroy();
    controllerRef.current = {
      sessionId: input.sessionId,
      controller: input.sessionId
        ? new SessionTranscriptStreamController(input.sessionId)
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
