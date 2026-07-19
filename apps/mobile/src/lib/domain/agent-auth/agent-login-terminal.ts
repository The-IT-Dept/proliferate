import {
  AnyHarnessError,
  type AgentLoginTerminalRecord,
  type StartAgentLoginTerminalResponse,
} from "@anyharness/sdk";

/**
 * Group H — the device-code login terminal's session state, ported from
 * product-client web's `useAgentLoginTerminalWorkflow`
 * (`hooks/agents/workflows/use-agent-login-terminal-workflow.ts`,
 * `AgentLoginTerminalSession` + the `sessionsByKind` transitions inside
 * `openAuthTerminal`/`handleTerminalExit`) — mobile is cloud-only so there's
 * no local/cloud surface branch to port, just the session shape + its
 * transitions. One deliberate simplification: `exit` doesn't stamp a fresh
 * `updatedAt` (the web version does) — nothing here reads that field, and
 * dropping it keeps the reducer a pure function of its inputs (no wall-clock
 * read), which is what makes it cleanly unit-testable without a fake clock.
 */

export interface AgentLoginTerminalSessionState {
  kind: string;
  terminal: AgentLoginTerminalRecord | null;
  message: string | null;
  errorMessage: string | null;
  isStarting: boolean;
}

export type AgentLoginTerminalSessionAction =
  | { type: "start_requested" }
  | { type: "start_succeeded"; response: StartAgentLoginTerminalResponse }
  | { type: "start_failed"; message: string }
  | { type: "exit"; code: number | null };

function emptySession(kind: string): AgentLoginTerminalSessionState {
  return {
    kind,
    terminal: null,
    message: null,
    errorMessage: null,
    isStarting: false,
  };
}

export function agentLoginTerminalSessionReducer(
  kind: string,
  previous: AgentLoginTerminalSessionState | undefined,
  action: AgentLoginTerminalSessionAction,
): AgentLoginTerminalSessionState {
  switch (action.type) {
    case "start_requested":
      return {
        kind,
        terminal: null,
        message: null,
        errorMessage: null,
        isStarting: true,
      };
    case "start_succeeded":
      return {
        kind,
        terminal: action.response.agentLoginTerminal,
        message: action.response.message ?? null,
        errorMessage: null,
        isStarting: false,
      };
    case "start_failed":
      return {
        kind,
        terminal: null,
        message: null,
        errorMessage: action.message,
        isStarting: false,
      };
    case "exit": {
      const current = previous ?? emptySession(kind);
      if (!current.terminal) {
        return current;
      }
      return {
        ...current,
        terminal: { ...current.terminal, status: "exited", exitCode: action.code },
      };
    }
  }
}

/**
 * Verbatim status vocabulary, ported from `AgentLoginTerminalPanel.tsx`'s
 * `statusText` ternary chain: terminal.status wins over the session's own
 * isStarting/errorMessage bookkeeping once a terminal exists (a stale
 * `isStarting`/`errorMessage` can linger on the session object across a
 * restart, but the terminal record is the fresher signal once it's there).
 */
export function deriveLoginTerminalStatusText(
  session: AgentLoginTerminalSessionState | null,
): string {
  const terminal = session?.terminal ?? null;
  if (terminal?.status === "exited") {
    return terminal.exitCode == null ? "Exited" : `Exited ${terminal.exitCode}`;
  }
  if (terminal?.status === "failed") {
    return "Failed";
  }
  if (terminal) {
    return "Running";
  }
  if (session?.errorMessage) {
    return "Needs retry";
  }
  if (session?.isStarting) {
    return "Opening";
  }
  return "Idle";
}

/** Ported verbatim from `CliDetails`' `showLoginTerminal` gate. */
export function shouldShowLoginTerminalPanel(
  session: AgentLoginTerminalSessionState | null,
): boolean {
  return (
    session != null
    && (session.isStarting || session.terminal !== null || session.errorMessage !== null)
  );
}

/**
 * Ported from `useAgentLoginTerminalWorkflow`'s `toErrorMessage`, with the
 * 404 copy adapted for mobile: the original ("Restart Proliferate so the
 * bundled runtime picks up the latest auth support") assumes a desktop app
 * bundling its own local AnyHarness runtime, which doesn't exist on
 * cloud-only mobile — there's nothing to "restart" client-side, the 404
 * means the cloud sandbox's gateway hasn't picked up the auth-terminal route
 * yet.
 */
export function deriveAgentLoginTerminalErrorMessage(error: unknown): string {
  if (error instanceof AnyHarnessError) {
    if (error.problem.status === 404) {
      return "The cloud sandbox doesn't support in-app sign-in yet. Try again in a moment.";
    }
    return error.problem.detail ?? error.problem.title;
  }
  return error instanceof Error ? error.message : String(error);
}
