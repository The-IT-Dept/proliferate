// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAgentLoginTerminalViewport } from "#product/hooks/agents/lifecycle/use-agent-login-terminal-viewport";

// M5 review Fix 3: the WS (re)connect used to always use whatever `authToken`
// was passed in at render time — fine for local (no token-TTL concern), but
// for cloud that value can be a snapshot minted minutes earlier, and the
// gateway token is short-lived. These tests pin that a `getAuthToken`
// provider, when supplied, is awaited immediately before every connect
// (including the very first one) instead of the static prop, and that
// omitting it (the local path) preserves the original synchronous,
// same-tick connect behavior exactly.

const connectAgentLoginTerminalMock = vi.hoisted(() => vi.fn());
// Stable across renders — mirrors the real useXtermSurface, whose
// containerRef/terminalRef/write are ref-stable (write is a useCallback with
// `[]` deps). A fresh object/function per render here would make `write`
// (an effect dependency) churn identity every render and cause spurious
// reconnects that have nothing to do with what these tests exercise.
const xtermSurfaceMocks = vi.hoisted(() => ({
  containerRef: { current: null },
  terminalRef: { current: null },
  write: vi.fn(),
}));

vi.mock("@anyharness/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anyharness/sdk")>();
  return {
    ...actual,
    connectAgentLoginTerminal: connectAgentLoginTerminalMock,
  };
});

vi.mock("#product/hooks/terminals/lifecycle/use-xterm-surface", () => ({
  useXtermSurface: () => ({
    containerRef: xtermSurfaceMocks.containerRef,
    isReady: true,
    terminalRef: xtermSurfaceMocks.terminalRef,
    write: xtermSurfaceMocks.write,
  }),
}));

function terminalFixture(id = "term-1") {
  return {
    id,
    kind: "claude",
    status: "running" as const,
    commandDisplay: "claude",
    title: "Claude Code",
    cwd: "/",
    createdAt: "2026-07-18T00:00:00Z",
    updatedAt: "2026-07-18T00:00:00Z",
  };
}

function fakeHandle() {
  return { send: vi.fn(), sendResize: vi.fn(), close: vi.fn() };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useAgentLoginTerminalViewport - local (no getAuthToken)", () => {
  it("connects synchronously with the static authToken, never calling a token provider", () => {
    const handle = fakeHandle();
    connectAgentLoginTerminalMock.mockReturnValue(handle);

    renderHook(() => useAgentLoginTerminalViewport({
      terminal: terminalFixture(),
      baseUrl: "http://127.0.0.1:8457",
      authToken: "static-local-token",
      visible: true,
      focusRequestToken: 0,
      onExit: vi.fn(),
    }));

    // Same-tick, synchronous connect — no getAuthToken means no await gap.
    expect(connectAgentLoginTerminalMock).toHaveBeenCalledTimes(1);
    expect(connectAgentLoginTerminalMock).toHaveBeenCalledWith(
      expect.objectContaining({ authToken: "static-local-token" }),
    );
  });
});

describe("useAgentLoginTerminalViewport - cloud (getAuthToken provided)", () => {
  it("awaits getAuthToken before connecting and uses its resolved value, ignoring the static prop", async () => {
    const handle = fakeHandle();
    connectAgentLoginTerminalMock.mockReturnValue(handle);
    const getAuthToken = vi.fn().mockResolvedValue("fresh-cloud-token");

    renderHook(() => useAgentLoginTerminalViewport({
      terminal: terminalFixture(),
      baseUrl: "https://gateway.example/v1/gateway/cloud-sandbox/anyharness",
      authToken: "stale-snapshot-token",
      webSocketAuthTransport: "protocol",
      getAuthToken,
      visible: true,
      focusRequestToken: 0,
      onExit: vi.fn(),
    }));

    expect(getAuthToken).toHaveBeenCalledTimes(1);
    // Not yet connected: the token fetch is async.
    expect(connectAgentLoginTerminalMock).not.toHaveBeenCalled();

    await act(async () => {
      await Promise.resolve();
    });

    expect(connectAgentLoginTerminalMock).toHaveBeenCalledTimes(1);
    expect(connectAgentLoginTerminalMock).toHaveBeenCalledWith(
      expect.objectContaining({
        authToken: "fresh-cloud-token",
        webSocketAuthTransport: "protocol",
      }),
    );
  });

  it("re-invokes getAuthToken on every (re)connect — a restart (new terminal id) mints a new token", async () => {
    connectAgentLoginTerminalMock.mockImplementation(() => fakeHandle());
    const getAuthToken = vi.fn()
      .mockResolvedValueOnce("token-1")
      .mockResolvedValueOnce("token-2");

    const { rerender } = renderHook(
      (props: { terminal: ReturnType<typeof terminalFixture> }) => useAgentLoginTerminalViewport({
        terminal: props.terminal,
        baseUrl: "https://gateway.example",
        authToken: "stale",
        getAuthToken,
        visible: true,
        focusRequestToken: 0,
        onExit: vi.fn(),
      }),
      { initialProps: { terminal: terminalFixture("term-1") } },
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(connectAgentLoginTerminalMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ authToken: "token-1", terminalId: "term-1" }),
    );

    // Restart: a brand new terminal record (different id) triggers a
    // teardown + reconnect — must mint a SECOND fresh token, not reuse token-1.
    rerender({ terminal: terminalFixture("term-2") });
    await act(async () => {
      await Promise.resolve();
    });

    expect(getAuthToken).toHaveBeenCalledTimes(2);
    expect(connectAgentLoginTerminalMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ authToken: "token-2", terminalId: "term-2" }),
    );
  });

  it("surfaces a connection error and never connects when the token provider rejects", async () => {
    // A one-shot rejection (not mockRejectedValue, which would leave every
    // later call rejecting too and generate unhandled-rejection noise if
    // this hook is ever invoked again during teardown).
    const getAuthToken = vi.fn().mockImplementationOnce(
      () => Promise.reject(new Error("token mint failed")),
    );
    // Hoisted OUTSIDE the render callback: an `onExit: vi.fn()`/`terminal`
    // object recreated inline on every render would itself change identity
    // each time `setConnectionError` causes a re-render, tripping a spurious
    // second (re)connect unrelated to what this test targets.
    const terminal = terminalFixture();
    const onExit = vi.fn();

    const { result } = renderHook(() => useAgentLoginTerminalViewport({
      terminal,
      baseUrl: "https://gateway.example",
      authToken: "stale",
      getAuthToken,
      visible: true,
      focusRequestToken: 0,
      onExit,
    }));

    await waitFor(() => {
      expect(result.current.connectionError).toBe("Couldn't refresh the connection token.");
    });
    expect(connectAgentLoginTerminalMock).not.toHaveBeenCalled();
  });
});
