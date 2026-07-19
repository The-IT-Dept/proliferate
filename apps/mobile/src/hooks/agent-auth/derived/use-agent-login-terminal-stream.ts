import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { connectAgentLoginTerminal } from "@anyharness/sdk";
import { useAnyHarnessRuntimeContext } from "@anyharness/sdk-react";

import { toAgentLoginTerminalConnectionInfo } from "../../../lib/domain/agent-auth/agent-login-terminal-connection";
import {
  TerminalStreamController,
  type TerminalStreamSnapshot,
} from "../../terminal/derived/terminal-stream-controller";

export type {
  TerminalStreamConnectionState,
  TerminalStreamSnapshot,
} from "../../terminal/derived/terminal-stream-controller";

/**
 * Group H — the device-code login terminal's live-PTY data bridge, reusing
 * Group F's `TerminalStreamController` UNCHANGED (not forked): the class
 * already takes an injectable `connectTerminal` dependency for testability
 * (`terminal-stream-controller.ts`'s `TerminalStreamControllerDeps`), and
 * `connectAgentLoginTerminal`'s options type (`AgentLoginTerminalStreamOptions`,
 * `anyharness/sdk/src/streams/terminals.ts`) is a type ALIAS of
 * `TerminalStreamOptions` — the exact same shape `connectTerminal` takes —
 * so `{ connectTerminal: connectAgentLoginTerminal }` satisfies that seam
 * with no changes to the controller. This hook mirrors
 * `use-terminal-stream.ts`'s shape (mount-owned lifecycle, `onData` kept out
 * of the snapshot so high-frequency PTY bytes never drive a React
 * re-render), with two differences the login terminal actually needs:
 *
 * 1. It resolves its connection from the RUNTIME-scoped AnyHarness context
 *    (`useAnyHarnessRuntimeContext`), not the workspace-scoped one — agent
 *    auth is account-level, not tied to any particular workspace (see
 *    `MobileWorkspaceRuntimeProvider`'s doc comment: the Runtime context is
 *    "used for non-workspace-scoped queries like the agent catalog").
 * 2. `terminalId` here is the login terminal's id (`AgentLoginTerminalRecord.id`
 *    from `startLoginTerminal`), a completely different id space from a
 *    workspace `TerminalRecord.id` — passed in by the caller once the login
 *    terminal has actually started (`null` beforehand, matching
 *    `use-terminal-stream`'s "no terminal selected yet" convention).
 */

const IDLE_SNAPSHOT: TerminalStreamSnapshot = {
  connectionState: "idle",
  exited: false,
  exitCode: null,
  gapCount: 0,
  error: null,
};

export interface UseAgentLoginTerminalStreamResult extends TerminalStreamSnapshot {
  sendInput: (data: string) => void;
  sendResize: (cols: number, rows: number) => void;
}

export function useAgentLoginTerminalStream(input: {
  terminalId: string | null;
  onData: (bytes: Uint8Array) => void;
}): UseAgentLoginTerminalStreamResult {
  const runtime = useAnyHarnessRuntimeContext();
  // Same rationale as use-terminal-stream: the context value is a fresh
  // object every render, but resolveConnection must stay referentially
  // stable across renders (it's an effect dependency) while still resolving
  // against the latest context value.
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;

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
        ? new TerminalStreamController(
          input.terminalId,
          { onData: (bytes) => onDataRef.current(bytes) },
          { connectTerminal: connectAgentLoginTerminal },
        )
        : null,
    };
  }
  const controller = controllerRef.current.controller;

  const resolveConnection = useCallback(async () => {
    return toAgentLoginTerminalConnectionInfo(runtimeRef.current);
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
