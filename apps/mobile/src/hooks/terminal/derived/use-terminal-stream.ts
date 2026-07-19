import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import {
  resolveWorkspaceConnectionFromContext,
  useAnyHarnessWorkspaceContext,
} from "@anyharness/sdk-react";

import {
  TerminalStreamController,
  type TerminalStreamSnapshot,
} from "./terminal-stream-controller";

export type {
  TerminalStreamConnectionState,
  TerminalStreamSnapshot,
} from "./terminal-stream-controller";

/**
 * Group F spike — the React seam over `TerminalStreamController`, mirroring
 * `useSessionTranscriptStream`'s split
 * (`hooks/chat/derived/use-session-transcript-stream.ts`): the connection +
 * dedupe state lives in the plain-vitest-tested controller; this hook just
 * owns its lifecycle (recreated exactly when `terminalId` changes, connected
 * on mount / closed on unmount — see the controller's module doc for why
 * there's no activate()/deactivate() pause here, unlike chat's controller)
 * and threads the workspace connection in via `@anyharness/sdk-react`'s
 * `resolveWorkspaceConnectionFromContext`.
 *
 * `onData` is intentionally NOT part of the returned snapshot — the caller
 * wires it straight to `MobileTerminalView`'s imperative `write()` so
 * high-frequency PTY output never drives a React re-render per chunk.
 */

const IDLE_SNAPSHOT: TerminalStreamSnapshot = {
  connectionState: "idle",
  exited: false,
  exitCode: null,
  gapCount: 0,
  error: null,
};

export interface UseTerminalStreamResult extends TerminalStreamSnapshot {
  sendInput: (data: string) => void;
  sendResize: (cols: number, rows: number) => void;
}

export function useTerminalStream(input: {
  terminalId: string | null;
  onData: (bytes: Uint8Array) => void;
}): UseTerminalStreamResult {
  const workspace = useAnyHarnessWorkspaceContext();
  // Same rationale as useSessionTranscriptStream: AnyHarnessWorkspace's
  // context value is a fresh object every render, but resolveConnection
  // must stay referentially stable across those renders (it's an effect
  // dependency) while still resolving against the latest context value.
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

  const onDataRef = useRef(input.onData);
  onDataRef.current = input.onData;

  const controllerRef = useRef<{
    terminalId: string | null;
    controller: TerminalStreamController | null;
  }>({ terminalId: null, controller: null });
  if (controllerRef.current.terminalId !== input.terminalId) {
    controllerRef.current.controller?.destroy();
    controllerRef.current = {
      terminalId: input.terminalId,
      controller: input.terminalId
        ? new TerminalStreamController(input.terminalId, {
          onData: (bytes) => onDataRef.current(bytes),
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
      webSocketAuthTransport: resolved.connection.webSocketAuthTransport,
    };
  }, []);

  useEffect(() => {
    if (!controller) {
      return;
    }
    controller.connect(resolveConnection);
    return () => {
      controller.close();
    };
  }, [controller, resolveConnection]);

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
    () => (controller ? controller.getSnapshot() : IDLE_SNAPSHOT),
    [controller],
  );
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);

  const sendInput = useCallback((data: string) => {
    controllerRef.current.controller?.sendInput(data);
  }, []);
  const sendResize = useCallback((cols: number, rows: number) => {
    controllerRef.current.controller?.sendResize(cols, rows);
  }, []);

  return { ...snapshot, sendInput, sendResize };
}
