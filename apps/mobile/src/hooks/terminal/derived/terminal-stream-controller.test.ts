import { describe, expect, it, vi } from "vitest";
import type { TerminalStreamHandle, TerminalStreamOptions } from "@anyharness/sdk";

import {
  TERMINAL_RECONNECT_DELAY_MS,
  TerminalStreamController,
} from "./terminal-stream-controller";

/**
 * `TerminalStreamController` is the live-PTY data bridge's connection owner
 * — the load-bearing piece behind `useTerminalStream` (the
 * `useSyncExternalStore` React wrapper, RN plumbing and out of scope here).
 * Mirrors `SessionTranscriptStreamController`'s test style
 * (`hooks/chat/derived/session-transcript-stream-controller.test.ts`): a
 * fake `connectTerminal` records every call and hands back a `close()` spy
 * instead of opening a real socket, and the test drives
 * `onOpen`/`onData`/`onExit`/`onReplayGap`/`onError`/`onClose` by hand.
 *
 * Unlike the chat controller, this one has no activate()/deactivate() pause
 * — the Term segment isn't kept mounted across shell segment switches (see
 * `MobileWorkspaceShell`), so `connect()`/`close()` track component
 * mount/unmount directly.
 */

const TERMINAL_ID = "terminal_abc123";

function fakeConnectTerminal() {
  const calls: TerminalStreamOptions[] = [];
  const closeSpies: ReturnType<typeof vi.fn>[] = [];
  const sendSpies: ReturnType<typeof vi.fn>[] = [];
  const sendResizeSpies: ReturnType<typeof vi.fn>[] = [];
  const connectTerminal = vi.fn((options: TerminalStreamOptions): TerminalStreamHandle => {
    calls.push(options);
    const close = vi.fn();
    const send = vi.fn();
    const sendResize = vi.fn();
    closeSpies.push(close);
    sendSpies.push(send);
    sendResizeSpies.push(sendResize);
    return { close, send, sendResize };
  });
  return { connectTerminal, calls, closeSpies, sendSpies, sendResizeSpies };
}

async function flushConnect(): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await Promise.resolve();
  }
}

function makeResolveConnection(
  overrides: Partial<{ baseUrl: string; authToken: string; webSocketAuthTransport: "protocol" | "query" }> = {},
) {
  return vi.fn(async () => ({
    baseUrl: "http://runtime.test",
    authToken: "tok_123",
    webSocketAuthTransport: "protocol" as const,
    ...overrides,
  }));
}

function makeController(deps: ReturnType<typeof fakeConnectTerminal>, onData = vi.fn()) {
  const controller = new TerminalStreamController(
    TERMINAL_ID,
    { onData },
    { connectTerminal: deps.connectTerminal },
  );
  return { controller, onData };
}

describe("TerminalStreamController", () => {
  it("connect() opens a stream with the resolved connection + webSocketAuthTransport, no afterSeq on a fresh connect", async () => {
    const deps = fakeConnectTerminal();
    const { controller } = makeController(deps);
    const resolveConnection = makeResolveConnection();

    controller.connect(resolveConnection);
    await flushConnect();

    expect(deps.calls).toHaveLength(1);
    expect(deps.calls[0]?.terminalId).toBe(TERMINAL_ID);
    expect(deps.calls[0]?.baseUrl).toBe("http://runtime.test");
    expect(deps.calls[0]?.authToken).toBe("tok_123");
    expect(deps.calls[0]?.webSocketAuthTransport).toBe("protocol");
    expect(deps.calls[0]?.afterSeq).toBeUndefined();

    deps.calls[0]?.onOpen?.();
    expect(controller.getSnapshot().connectionState).toBe("open");

    const first = controller.getSnapshot();
    const second = controller.getSnapshot();
    expect(second).toBe(first);
  });

  it("forwards accepted data frames straight to the onData callback, bypassing the snapshot", async () => {
    const deps = fakeConnectTerminal();
    const onData = vi.fn();
    const { controller } = makeController(deps, onData);
    controller.connect(makeResolveConnection());
    await flushConnect();
    deps.calls[0]?.onOpen?.();

    const bytes = new Uint8Array([104, 105]);
    deps.calls[0]?.onData(bytes, { type: "data", seq: 1, terminalId: TERMINAL_ID, dataBase64: "aGk=" });

    expect(onData).toHaveBeenCalledTimes(1);
    expect(onData).toHaveBeenCalledWith(bytes);
  });

  it("dedupes a replayed data frame (seq <= lastSeq): not forwarded, snapshot unchanged", async () => {
    const deps = fakeConnectTerminal();
    const onData = vi.fn();
    const { controller } = makeController(deps, onData);
    controller.connect(makeResolveConnection());
    await flushConnect();
    deps.calls[0]?.onOpen?.();

    const frame = (seq: number) =>
      ({ type: "data" as const, seq, terminalId: TERMINAL_ID, dataBase64: "aGk=" });
    deps.calls[0]?.onData(new Uint8Array([1]), frame(3));
    deps.calls[0]?.onData(new Uint8Array([2]), frame(3)); // replay

    expect(onData).toHaveBeenCalledTimes(1);
  });

  it("sendInput/sendResize forward to the live handle", async () => {
    const deps = fakeConnectTerminal();
    const { controller } = makeController(deps);
    controller.connect(makeResolveConnection());
    await flushConnect();
    deps.calls[0]?.onOpen?.();

    controller.sendInput("ls -la\r");
    controller.sendResize(120, 40);

    expect(deps.sendSpies[0]).toHaveBeenCalledWith("ls -la\r");
    expect(deps.sendResizeSpies[0]).toHaveBeenCalledWith(120, 40);
  });

  it("onExit marks exited, stops future input, and does not reconnect", async () => {
    vi.useFakeTimers();
    try {
      const deps = fakeConnectTerminal();
      const { controller } = makeController(deps);
      controller.connect(makeResolveConnection());
      await flushConnect();
      deps.calls[0]?.onOpen?.();

      deps.calls[0]?.onExit?.(137);

      const snapshot = controller.getSnapshot();
      expect(snapshot.exited).toBe(true);
      expect(snapshot.exitCode).toBe(137);
      expect(snapshot.connectionState).toBe("closed");

      controller.sendInput("echo hi\r");
      expect(deps.sendSpies[0]).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(TERMINAL_RECONNECT_DELAY_MS * 2);
      expect(deps.calls).toHaveLength(1); // no reconnect after a real exit
    } finally {
      vi.useRealTimers();
    }
  });

  it("onExit with a null code is preserved as null (not coerced)", async () => {
    const deps = fakeConnectTerminal();
    const { controller } = makeController(deps);
    controller.connect(makeResolveConnection());
    await flushConnect();
    deps.calls[0]?.onOpen?.();

    deps.calls[0]?.onExit?.(null);
    expect(controller.getSnapshot().exitCode).toBeNull();
  });

  it("onReplayGap increments gapCount and reconnects with afterSeq at the gap's floorSeq", async () => {
    vi.useFakeTimers();
    try {
      const deps = fakeConnectTerminal();
      const { controller } = makeController(deps);
      controller.connect(makeResolveConnection());
      await flushConnect();
      deps.calls[0]?.onOpen?.();

      deps.calls[0]?.onReplayGap?.({
        type: "replay_gap",
        terminalId: TERMINAL_ID,
        requestedAfterSeq: 5,
        floorSeq: 50,
      });

      expect(controller.getSnapshot().gapCount).toBe(1);
      await vi.advanceTimersByTimeAsync(0);
      await flushConnect();

      expect(deps.calls).toHaveLength(2);
      expect(deps.calls[1]?.afterSeq).toBe(50);
    } finally {
      vi.useRealTimers();
    }
  });

  it("onClose while still wanted schedules a reconnect resuming from the last accepted seq", async () => {
    vi.useFakeTimers();
    try {
      const deps = fakeConnectTerminal();
      const { controller } = makeController(deps);
      controller.connect(makeResolveConnection());
      await flushConnect();
      deps.calls[0]?.onOpen?.();
      deps.calls[0]?.onData(new Uint8Array([1]), {
        type: "data",
        seq: 7,
        terminalId: TERMINAL_ID,
        dataBase64: "aGk=",
      });

      deps.calls[0]?.onClose?.(new CloseEvent("close"));
      expect(deps.calls).toHaveLength(1);
      expect(deps.closeSpies[0]).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(TERMINAL_RECONNECT_DELAY_MS);
      await flushConnect();

      expect(deps.calls).toHaveLength(2);
      expect(deps.calls[1]?.afterSeq).toBe(7);
      expect(deps.closeSpies[0]).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("close() stops any pending reconnect and marks the snapshot closed", async () => {
    vi.useFakeTimers();
    try {
      const deps = fakeConnectTerminal();
      const { controller } = makeController(deps);
      controller.connect(makeResolveConnection());
      await flushConnect();
      deps.calls[0]?.onOpen?.();
      deps.calls[0]?.onClose?.(new CloseEvent("close"));

      controller.close();
      expect(controller.getSnapshot().connectionState).toBe("closed");
      expect(deps.closeSpies[0]).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(TERMINAL_RECONNECT_DELAY_MS * 2);
      expect(deps.calls).toHaveLength(1); // the scheduled reconnect never fired
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores a late onData delivered after close() (stale generation): no callback, no notify", async () => {
    const deps = fakeConnectTerminal();
    const onData = vi.fn();
    const { controller } = makeController(deps, onData);
    controller.connect(makeResolveConnection());
    await flushConnect();
    deps.calls[0]?.onOpen?.();

    controller.close();
    const listener = vi.fn();
    controller.subscribe(listener);

    deps.calls[0]?.onData(new Uint8Array([9]), {
      type: "data",
      seq: 1,
      terminalId: TERMINAL_ID,
      dataBase64: "CQ==",
    });

    expect(onData).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  it("onError sets an error, marks connectionState error, and schedules a reconnect", async () => {
    vi.useFakeTimers();
    try {
      const deps = fakeConnectTerminal();
      const { controller } = makeController(deps);
      controller.connect(makeResolveConnection());
      await flushConnect();
      deps.calls[0]?.onOpen?.();

      deps.calls[0]?.onError?.(new Event("error"));
      const snapshot = controller.getSnapshot();
      expect(snapshot.connectionState).toBe("error");
      expect(snapshot.error).toBeInstanceOf(Error);

      await vi.advanceTimersByTimeAsync(TERMINAL_RECONNECT_DELAY_MS);
      await flushConnect();
      expect(deps.calls).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
