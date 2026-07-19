import { describe, expect, it } from "vitest";
import {
  AnyHarnessError,
  type AgentLoginTerminalRecord,
  type StartAgentLoginTerminalResponse,
} from "@anyharness/sdk";

import {
  agentLoginTerminalSessionReducer,
  deriveAgentLoginTerminalErrorMessage,
  deriveLoginTerminalStatusText,
  shouldShowLoginTerminalPanel,
  type AgentLoginTerminalSessionState,
} from "./agent-login-terminal";

/**
 * Group H — the device-code login terminal's session state machine, ported
 * from product-client web's `useAgentLoginTerminalWorkflow`
 * (`sessionsByKind` transitions inside `openAuthTerminal`/
 * `handleTerminalExit`) and `AgentLoginTerminalPanel`'s `statusText` ternary
 * chain (verbatim vocabulary: "Idle"/"Opening"/"Needs retry"/"Running"/
 * "Failed"/"Exited"/"Exited N") + `CliDetails`' `showLoginTerminal` gate.
 */

const TERMINAL: AgentLoginTerminalRecord = {
  id: "login_term_1",
  kind: "claude",
  status: "running",
  title: "claude login",
  commandDisplay: "claude login",
  cwd: "/home/agent",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const START_RESPONSE: StartAgentLoginTerminalResponse = {
  kind: "claude",
  label: "Claude",
  message: "Follow the device code below.",
  agentLoginTerminal: TERMINAL,
};

describe("agentLoginTerminalSessionReducer", () => {
  it("start_requested marks isStarting, clears prior terminal/message/error, bumps focus", () => {
    const next = agentLoginTerminalSessionReducer("claude", undefined, { type: "start_requested" });
    expect(next).toEqual({
      kind: "claude",
      terminal: null,
      message: null,
      errorMessage: null,
      isStarting: true,
      focusRequestToken: 1,
    });
  });

  it("start_succeeded attaches the terminal + message, clears isStarting/error, bumps focus", () => {
    const starting = agentLoginTerminalSessionReducer("claude", undefined, { type: "start_requested" });
    const next = agentLoginTerminalSessionReducer("claude", starting, {
      type: "start_succeeded",
      response: START_RESPONSE,
    });
    expect(next).toEqual({
      kind: "claude",
      terminal: TERMINAL,
      message: "Follow the device code below.",
      errorMessage: null,
      isStarting: false,
      focusRequestToken: 2,
    });
  });

  it("start_succeeded with no message on the response stores null, not undefined", () => {
    const next = agentLoginTerminalSessionReducer("claude", undefined, {
      type: "start_succeeded",
      response: { ...START_RESPONSE, message: undefined },
    });
    expect(next.message).toBeNull();
  });

  it("start_failed records errorMessage, clears terminal/isStarting, bumps focus", () => {
    const starting = agentLoginTerminalSessionReducer("claude", undefined, { type: "start_requested" });
    const next = agentLoginTerminalSessionReducer("claude", starting, {
      type: "start_failed",
      message: "Cloud sandbox connection is not available.",
    });
    expect(next).toEqual({
      kind: "claude",
      terminal: null,
      message: null,
      errorMessage: "Cloud sandbox connection is not available.",
      isStarting: false,
      focusRequestToken: 2,
    });
  });

  it("exit sets the terminal's status to exited with the given code, leaves everything else untouched", () => {
    const running = agentLoginTerminalSessionReducer("claude", undefined, {
      type: "start_succeeded",
      response: START_RESPONSE,
    });
    const next = agentLoginTerminalSessionReducer("claude", running, { type: "exit", code: 0 });
    expect(next.terminal).toEqual({ ...TERMINAL, status: "exited", exitCode: 0 });
    expect(next.focusRequestToken).toBe(running.focusRequestToken);
  });

  it("exit with a null code (killed/unknown) records exitCode: null", () => {
    const running = agentLoginTerminalSessionReducer("claude", undefined, {
      type: "start_succeeded",
      response: START_RESPONSE,
    });
    const next = agentLoginTerminalSessionReducer("claude", running, { type: "exit", code: null });
    expect(next.terminal?.exitCode).toBeNull();
  });

  it("exit on a session with no terminal (never started, or start failed) is a no-op", () => {
    const errored = agentLoginTerminalSessionReducer("claude", undefined, {
      type: "start_failed",
      message: "boom",
    });
    const next = agentLoginTerminalSessionReducer("claude", errored, { type: "exit", code: 0 });
    expect(next).toEqual(errored);
  });

  it("focus bumps focusRequestToken on an existing session without touching other fields", () => {
    const running = agentLoginTerminalSessionReducer("claude", undefined, {
      type: "start_succeeded",
      response: START_RESPONSE,
    });
    const next = agentLoginTerminalSessionReducer("claude", running, { type: "focus" });
    expect(next).toEqual({ ...running, focusRequestToken: running.focusRequestToken + 1 });
  });
});

describe("deriveLoginTerminalStatusText", () => {
  function session(overrides: Partial<AgentLoginTerminalSessionState>): AgentLoginTerminalSessionState {
    return {
      kind: "claude",
      terminal: null,
      message: null,
      errorMessage: null,
      isStarting: false,
      focusRequestToken: 0,
      ...overrides,
    };
  }

  it("null session -> Idle", () => {
    expect(deriveLoginTerminalStatusText(null)).toBe("Idle");
  });

  it("no terminal, not starting, no error -> Idle", () => {
    expect(deriveLoginTerminalStatusText(session({}))).toBe("Idle");
  });

  it("isStarting with no terminal yet -> Opening", () => {
    expect(deriveLoginTerminalStatusText(session({ isStarting: true }))).toBe("Opening");
  });

  it("errorMessage with no terminal -> Needs retry", () => {
    expect(deriveLoginTerminalStatusText(session({ errorMessage: "boom" }))).toBe("Needs retry");
  });

  it("a running terminal -> Running (even if isStarting/error linger from a stale session)", () => {
    expect(deriveLoginTerminalStatusText(session({ terminal: TERMINAL }))).toBe("Running");
  });

  it("terminal.status failed -> Failed", () => {
    expect(
      deriveLoginTerminalStatusText(session({ terminal: { ...TERMINAL, status: "failed" } })),
    ).toBe("Failed");
  });

  it("terminal.status exited with no exitCode -> Exited", () => {
    expect(
      deriveLoginTerminalStatusText(
        session({ terminal: { ...TERMINAL, status: "exited", exitCode: null } }),
      ),
    ).toBe("Exited");
  });

  it("terminal.status exited with an exitCode -> 'Exited <code>'", () => {
    expect(
      deriveLoginTerminalStatusText(
        session({ terminal: { ...TERMINAL, status: "exited", exitCode: 1 } }),
      ),
    ).toBe("Exited 1");
  });
});

describe("shouldShowLoginTerminalPanel", () => {
  it("null session -> false", () => {
    expect(shouldShowLoginTerminalPanel(null)).toBe(false);
  });

  it("idle session (no terminal/starting/error) -> false", () => {
    expect(
      shouldShowLoginTerminalPanel({
        kind: "claude",
        terminal: null,
        message: null,
        errorMessage: null,
        isStarting: false,
        focusRequestToken: 0,
      }),
    ).toBe(false);
  });

  it("isStarting -> true", () => {
    expect(
      shouldShowLoginTerminalPanel({
        kind: "claude",
        terminal: null,
        message: null,
        errorMessage: null,
        isStarting: true,
        focusRequestToken: 1,
      }),
    ).toBe(true);
  });

  it("has a terminal -> true", () => {
    expect(
      shouldShowLoginTerminalPanel({
        kind: "claude",
        terminal: TERMINAL,
        message: null,
        errorMessage: null,
        isStarting: false,
        focusRequestToken: 1,
      }),
    ).toBe(true);
  });

  it("has an errorMessage -> true", () => {
    expect(
      shouldShowLoginTerminalPanel({
        kind: "claude",
        terminal: null,
        message: null,
        errorMessage: "boom",
        isStarting: false,
        focusRequestToken: 1,
      }),
    ).toBe(true);
  });
});

describe("deriveAgentLoginTerminalErrorMessage", () => {
  it("a plain Error returns its message", () => {
    expect(deriveAgentLoginTerminalErrorMessage(new Error("network down"))).toBe("network down");
  });

  it("a non-Error throw stringifies", () => {
    expect(deriveAgentLoginTerminalErrorMessage("boom")).toBe("boom");
  });

  it("an AnyHarnessError 404 gets a mobile-specific runtime-unavailable message (not the desktop 'restart Proliferate' copy)", () => {
    const error = new AnyHarnessError({ status: 404, title: "Not Found" });
    expect(deriveAgentLoginTerminalErrorMessage(error)).toBe(
      "The cloud sandbox doesn't support in-app sign-in yet. Try again in a moment.",
    );
  });

  it("a non-404 AnyHarnessError surfaces the problem detail when present", () => {
    const error = new AnyHarnessError({ status: 500, title: "Internal Error", detail: "gateway exploded" });
    expect(deriveAgentLoginTerminalErrorMessage(error)).toBe("gateway exploded");
  });

  it("a non-404 AnyHarnessError with no detail falls back to the problem title", () => {
    const error = new AnyHarnessError({ status: 500, title: "Internal Error" });
    expect(deriveAgentLoginTerminalErrorMessage(error)).toBe("Internal Error");
  });
});
