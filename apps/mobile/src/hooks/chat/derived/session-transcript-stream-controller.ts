import {
  streamSession as sdkStreamSession,
  type SessionEventEnvelope,
  type SessionStreamHandle,
  type TranscriptState,
} from "@anyharness/sdk";

import {
  applyStreamEnvelope,
  createSessionTranscriptStreamState,
  type SessionTranscriptStreamState,
} from "./session-transcript-stream-state";

/**
 * Group E1 — `SessionTranscriptStreamController`, the `useSyncExternalStore`-
 * backed owner of one session's stream connection + accumulated state,
 * extracted from `use-session-transcript-stream.ts` so it's testable in
 * plain vitest (node env): this module has no `react`, `react-native`, or
 * `expo/*` import, unlike the hook file, which imports `expo/fetch` to thread
 * a streaming-capable `fetch` into `streamSession` (native `fetch` buffers
 * response bodies instead of streaming them — see that file's module doc).
 * `expo/fetch` resolves through Metro's native module registry and throws
 * outside a bundled RN/Expo runtime, so it can't be imported by anything
 * under test here — the controller instead takes `fetchImpl` (and, for
 * tests, `streamSession` itself) as constructor-injected dependencies, both
 * defaulting to the real thing.
 *
 * One controller instance owns one session's connection + accumulated state
 * outside React, so pausing/resuming across `active` toggles (the shell
 * hides Chat behind another segment without unmounting it — see
 * `MobileWorkspaceShell`) never loses transcript state: `deactivate()`
 * closes the network connection but keeps `state`; `activate()` resumes from
 * `state.lastSeq` via `afterSeq`.
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

export interface SessionStreamConnectionInfo {
  baseUrl: string;
  authToken?: string;
  headers?: HeadersInit;
}

export interface SessionTranscriptStreamControllerDeps {
  /** Injectable seam for tests — defaults to the real `@anyharness/sdk`
   * `streamSession`. */
  streamSession?: typeof sdkStreamSession;
  /** Streaming-capable `fetch` to thread into `streamSession` (e.g.
   * `expo/fetch` on native). Omitted in tests; `streamSession` itself
   * defaults an omitted `fetchImpl` to `globalThis.fetch`. */
  fetchImpl?: typeof fetch;
}

export const RECONNECT_DELAY_MS = 1_500;

/** Stable-by-reference snapshot for "no session selected" — `getSnapshot`
 * must return the same reference across calls when nothing changed, or
 * `useSyncExternalStore` re-renders forever. */
export const NO_SESSION_SNAPSHOT: SessionTranscriptStreamSnapshot = {
  transcript: createSessionTranscriptStreamState("").transcript,
  envelopes: [],
  connectionState: "idle",
  hasSynced: false,
  error: null,
};

export class SessionTranscriptStreamController {
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

  constructor(
    private readonly sessionId: string,
    private readonly deps: SessionTranscriptStreamControllerDeps = {},
  ) {
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

    const doStreamSession = this.deps.streamSession ?? sdkStreamSession;

    void resolveConnection()
      .then((connection) => {
        if (generation !== this.generation || !this.active) {
          return;
        }
        // Defensive: on an error/close-triggered reconnect the previous
        // handle is still set (onError/onClose don't null it out before
        // scheduling a reconnect) — close it before it's overwritten below,
        // so a prior stream never leaks past the point this controller
        // stops tracking it.
        this.handle?.close();
        this.handle = doStreamSession({
          baseUrl: connection.baseUrl,
          sessionId: this.sessionId,
          authToken: connection.authToken,
          headers: connection.headers,
          afterSeq: this.state.lastSeq > 0 ? this.state.lastSeq : undefined,
          fetchImpl: this.deps.fetchImpl,
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
        });
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
