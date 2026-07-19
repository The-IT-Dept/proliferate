import { describe, expect, it, vi } from "vitest";
import type { SessionStreamHandle, SessionStreamOptions } from "@anyharness/sdk";

import { CANNED_SESSION_ENVELOPES, SESSION_ID } from "./__fixtures__/session-transcript-fixtures";
import {
  RECONNECT_DELAY_MS,
  SessionTranscriptStreamController,
} from "./session-transcript-stream-controller";

/**
 * `SessionTranscriptStreamController` is the load-bearing, previously-
 * untested piece behind `useSessionTranscriptStream` — the
 * `useSyncExternalStore` bridge (`use-session-transcript-stream.ts`) is React
 * plumbing around it and out of scope here (would need RN render infra).
 * This module has no `react`/`react-native`/`expo` import, so it's plain
 * vitest.
 */

/** A fake `streamSession`: records every call, and hands each one a
 * `close()` spy instead of ever actually opening a network connection —
 * the test drives `onOpen`/`onEvent`/`onError`/`onClose` by hand. */
function fakeStreamSession() {
  const calls: SessionStreamOptions[] = [];
  const closeSpies: ReturnType<typeof vi.fn>[] = [];
  const streamSession = vi.fn((options: SessionStreamOptions): SessionStreamHandle => {
    calls.push(options);
    const close = vi.fn();
    closeSpies.push(close);
    return { close };
  });
  return { streamSession, calls, closeSpies };
}

/** Flushes the `resolveConnection().then(...)` microtask chain `connect()`
 * kicks off. */
async function flushConnect(): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await Promise.resolve();
  }
}

function makeResolveConnection(baseUrl = "http://runtime.test") {
  return vi.fn(async () => ({ baseUrl }));
}

describe("SessionTranscriptStreamController", () => {
  it("activate() opens a stream, and getSnapshot() is stable across calls with no new publish", async () => {
    const { streamSession, calls } = fakeStreamSession();
    const controller = new SessionTranscriptStreamController(SESSION_ID, { streamSession });
    const resolveConnection = makeResolveConnection();

    controller.activate(resolveConnection);
    await flushConnect();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.sessionId).toBe(SESSION_ID);
    expect(calls[0]?.baseUrl).toBe("http://runtime.test");
    expect(calls[0]?.afterSeq).toBeUndefined();

    calls[0]?.onOpen?.();
    expect(controller.getSnapshot().connectionState).toBe("open");

    const first = controller.getSnapshot();
    const second = controller.getSnapshot();
    expect(second).toBe(first);
  });

  it("feeding an event produces a new snapshot", async () => {
    const { streamSession, calls } = fakeStreamSession();
    const controller = new SessionTranscriptStreamController(SESSION_ID, { streamSession });
    controller.activate(makeResolveConnection());
    await flushConnect();
    calls[0]?.onOpen?.();

    const before = controller.getSnapshot();
    calls[0]?.onEvent(CANNED_SESSION_ENVELOPES[0]!);
    const after = controller.getSnapshot();

    expect(after).not.toBe(before);
    expect(after.transcript).not.toBe(before.transcript);
    expect(after.envelopes).toHaveLength(1);
  });

  it("deactivate() closes the handle but keeps the accumulated state in getSnapshot()", async () => {
    const { streamSession, calls, closeSpies } = fakeStreamSession();
    const controller = new SessionTranscriptStreamController(SESSION_ID, { streamSession });
    controller.activate(makeResolveConnection());
    await flushConnect();
    calls[0]?.onOpen?.();
    for (const env of CANNED_SESSION_ENVELOPES.slice(0, 3)) {
      calls[0]?.onEvent(env);
    }
    const beforeDeactivate = controller.getSnapshot();
    expect(beforeDeactivate.envelopes).toHaveLength(3);

    controller.deactivate();

    expect(closeSpies[0]).toHaveBeenCalledTimes(1);
    const afterDeactivate = controller.getSnapshot();
    expect(afterDeactivate.connectionState).toBe("closed");
    // The accumulated transcript/envelope log survives deactivation
    // untouched — same underlying state, not reset.
    expect(afterDeactivate.transcript).toBe(beforeDeactivate.transcript);
    expect(afterDeactivate.envelopes).toBe(beforeDeactivate.envelopes);
    expect(afterDeactivate.envelopes).toHaveLength(3);
  });

  it("reactivating after deactivate() resumes with afterSeq set to the last-applied seq", async () => {
    const { streamSession, calls } = fakeStreamSession();
    const controller = new SessionTranscriptStreamController(SESSION_ID, { streamSession });
    controller.activate(makeResolveConnection());
    await flushConnect();
    calls[0]?.onOpen?.();
    for (const env of CANNED_SESSION_ENVELOPES.slice(0, 3)) {
      calls[0]?.onEvent(env);
    }
    const lastSeq = CANNED_SESSION_ENVELOPES[2]!.seq;
    controller.deactivate();

    controller.activate(makeResolveConnection());
    await flushConnect();

    expect(calls).toHaveLength(2);
    expect(calls[1]?.afterSeq).toBe(lastSeq);
  });

  it("closes the previous handle before overwriting it on a reconnect", async () => {
    vi.useFakeTimers();
    try {
      const { streamSession, calls, closeSpies } = fakeStreamSession();
      const controller = new SessionTranscriptStreamController(SESSION_ID, { streamSession });
      controller.activate(makeResolveConnection());
      await flushConnect();
      calls[0]?.onOpen?.();

      // The server closes the stream while the controller is still
      // `active` — this schedules a reconnect. `onError`/`onClose` don't
      // null out `this.handle` before doing so, so the fix has to close it
      // right before the second `streamSession()` call overwrites it.
      calls[0]?.onClose?.();
      expect(calls).toHaveLength(1);
      expect(closeSpies[0]).not.toHaveBeenCalled(); // not yet — reconnect hasn't fired

      await vi.advanceTimersByTimeAsync(RECONNECT_DELAY_MS);
      await flushConnect();

      expect(calls).toHaveLength(2);
      expect(closeSpies[0]).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores a late onEvent delivered after deactivate() (stale generation): no mutation, no notify", async () => {
    const { streamSession, calls } = fakeStreamSession();
    const controller = new SessionTranscriptStreamController(SESSION_ID, { streamSession });
    controller.activate(makeResolveConnection());
    await flushConnect();
    calls[0]?.onOpen?.();
    calls[0]?.onEvent(CANNED_SESSION_ENVELOPES[0]!);

    controller.deactivate();
    const snapshotAfterDeactivate = controller.getSnapshot();

    const listener = vi.fn();
    controller.subscribe(listener);

    // A frame from the now-stale (deactivated) connection arrives late.
    calls[0]?.onEvent(CANNED_SESSION_ENVELOPES[1]!);

    expect(listener).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toBe(snapshotAfterDeactivate);
    expect(controller.getSnapshot().envelopes).toHaveLength(1);
  });
});
