import {
  connectTerminal as sdkConnectTerminal,
  type TerminalStreamHandle,
  type TerminalStreamOptions,
  type TerminalWebSocketAuthTransport,
} from "@anyharness/sdk";

import {
  acceptTerminalFrame,
  createTerminalFrameDedupeState,
  type TerminalFrameDedupeState,
} from "../../../lib/domain/terminal/terminal-frame-dedupe";

/**
 * Group F spike — `TerminalStreamController`, the live-PTY data bridge's
 * connection owner. Mirrors `SessionTranscriptStreamController`'s shape
 * (`hooks/chat/derived/session-transcript-stream-controller.ts`: a
 * `useSyncExternalStore`-ready snapshot + subscribe, an injectable
 * `connectTerminal` dependency for testability) with one deliberate
 * difference: no activate()/deactivate() pause. Chat needs that because the
 * shell keeps Chat mounted (hidden) behind other segments; the Term segment
 * is *not* kept mounted across segment switches (see `MobileWorkspaceShell`
 * — Term's body is only rendered while `segment === "term"`), so
 * `connect()`/`close()` map directly onto the owning component's
 * mount/unmount. If a future F-build keeps Term warm like Chat, this is the
 * seam to add activate()/deactivate() back at.
 *
 * `onData` is a constructor-supplied callback, not part of the snapshot —
 * PTY output can arrive far more frequently than a chat transcript delta,
 * and it needs to reach `MobileTerminalView`'s imperative `write()` (a
 * WebView postMessage) directly, not drive a React re-render per chunk. The
 * snapshot only carries the low-frequency connection/exit/gap state.
 */

export type TerminalStreamConnectionState =
  | "idle"
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed"
  | "error";

export interface TerminalStreamSnapshot {
  connectionState: TerminalStreamConnectionState;
  exited: boolean;
  exitCode: number | null;
  /** Count of `replay_gap` frames seen — surfaced so the view can show a
   * "some output was skipped" notice. Doesn't reset the underlying gap
   * marker each reconnect. */
  gapCount: number;
  error: Error | null;
}

export interface TerminalStreamConnectionInfo {
  baseUrl: string;
  authToken?: string;
  webSocketAuthTransport?: TerminalWebSocketAuthTransport;
}

export interface TerminalStreamControllerDeps {
  /** Injectable seam for tests — defaults to the real `@anyharness/sdk`
   * `connectTerminal`. */
  connectTerminal?: typeof sdkConnectTerminal;
}

export interface TerminalStreamControllerCallbacks {
  onData: (bytes: Uint8Array) => void;
}

export const TERMINAL_RECONNECT_DELAY_MS = 1_500;

export class TerminalStreamController {
  private connectionState: TerminalStreamConnectionState = "idle";
  private exited = false;
  private exitCode: number | null = null;
  private gapCount = 0;
  private error: Error | null = null;
  private snapshot: TerminalStreamSnapshot;
  private readonly listeners = new Set<() => void>();
  private handle: TerminalStreamHandle | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private wanted = false;
  private dedupe: TerminalFrameDedupeState = createTerminalFrameDedupeState();

  constructor(
    private readonly terminalId: string,
    private readonly callbacks: TerminalStreamControllerCallbacks,
    private readonly deps: TerminalStreamControllerDeps = {},
  ) {
    this.snapshot = this.buildSnapshot();
  }

  getSnapshot = (): TerminalStreamSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  connect(resolveConnection: () => Promise<TerminalStreamConnectionInfo>): void {
    this.wanted = true;
    if (this.connectionState === "open" || this.connectionState === "connecting") {
      return;
    }
    this.doConnect(resolveConnection);
  }

  sendInput(data: string): void {
    if (this.exited) return;
    this.handle?.send(data);
  }

  sendResize(cols: number, rows: number): void {
    if (this.exited) return;
    this.handle?.sendResize(cols, rows);
  }

  close(): void {
    this.wanted = false;
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
    this.close();
    this.listeners.clear();
  }

  private doConnect(resolveConnection: () => Promise<TerminalStreamConnectionInfo>): void {
    const generation = (this.generation += 1);
    this.connectionState = this.dedupe.lastSeq > 0 ? "reconnecting" : "connecting";
    this.error = null;
    this.publish();

    const doConnectTerminal = this.deps.connectTerminal ?? sdkConnectTerminal;

    void resolveConnection()
      .then((connection) => {
        if (generation !== this.generation || !this.wanted) {
          return;
        }
        // Defensive, mirroring SessionTranscriptStreamController: onError/
        // onClose don't null out `this.handle` before scheduling a
        // reconnect, so close the previous handle right before it's
        // overwritten below.
        this.handle?.close();
        this.handle = doConnectTerminal({
          baseUrl: connection.baseUrl,
          terminalId: this.terminalId,
          authToken: connection.authToken,
          webSocketAuthTransport: connection.webSocketAuthTransport,
          afterSeq: this.dedupe.lastSeq > 0 ? this.dedupe.lastSeq : undefined,
          onOpen: () => {
            if (generation !== this.generation) return;
            this.connectionState = "open";
            this.publish();
          },
          onData: (bytes, frame) => {
            if (generation !== this.generation) return;
            const result = acceptTerminalFrame(this.dedupe, frame.seq);
            if (!result.accepted) return;
            this.dedupe = result.state;
            this.callbacks.onData(bytes);
          },
          onExit: (code) => {
            if (generation !== this.generation) return;
            this.exited = true;
            this.exitCode = code;
            this.connectionState = "closed";
            this.clearReconnectTimer();
            this.publish();
          },
          onReplayGap: (frame) => {
            if (generation !== this.generation) return;
            this.gapCount += 1;
            // The server can't serve anything before floorSeq — resume
            // there instead of looping on the same unmet afterSeq.
            this.dedupe = createTerminalFrameDedupeState(frame.floorSeq);
            this.publish();
            this.scheduleReconnect(resolveConnection, generation, 0);
          },
          onError: (_event) => {
            if (generation !== this.generation) return;
            this.error = new Error("Terminal stream error.");
            this.connectionState = "error";
            this.publish();
            this.scheduleReconnect(resolveConnection, generation);
          },
          onClose: () => {
            if (generation !== this.generation) return;
            if (this.wanted && !this.exited) {
              this.connectionState = "reconnecting";
              this.publish();
              this.scheduleReconnect(resolveConnection, generation);
            } else {
              this.connectionState = "closed";
              this.publish();
            }
          },
        } satisfies TerminalStreamOptions);
      })
      .catch((error: unknown) => {
        if (generation !== this.generation) return;
        this.error = error instanceof Error
          ? error
          : new Error("Failed to resolve the terminal stream connection.");
        this.connectionState = "error";
        this.publish();
        this.scheduleReconnect(resolveConnection, generation);
      });
  }

  private scheduleReconnect(
    resolveConnection: () => Promise<TerminalStreamConnectionInfo>,
    generation: number,
    delayMs: number = TERMINAL_RECONNECT_DELAY_MS,
  ): void {
    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      if (generation !== this.generation || !this.wanted) return;
      this.doConnect(resolveConnection);
    }, delayMs);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private buildSnapshot(): TerminalStreamSnapshot {
    return {
      connectionState: this.connectionState,
      exited: this.exited,
      exitCode: this.exitCode,
      gapCount: this.gapCount,
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
