import { describe, expect, it } from "vitest";

import {
  acceptTerminalFrame,
  createTerminalFrameDedupeState,
} from "./terminal-frame-dedupe";

/**
 * Group F spike — mirrors E1's `applyStreamEnvelope` dedupe discipline
 * (`hooks/chat/derived/session-transcript-stream-state.ts`), applied to the
 * terminal stream's `seq`. Verified against the stream contract
 * (`anyharness/sdk/src/streams/terminals.ts`): `TerminalDataFrame` and
 * `TerminalExitFrame` both carry a `seq` field from one shared counter (the
 * SDK's own `connectTerminal` already applies `seq <= lastSeq` dedupe
 * *inside* one WebSocket connection's closure), so this module's job is
 * specifically the reconnect boundary: tracking `lastSeq` across
 * `connectTerminal()` calls (for `afterSeq`) and rejecting a frame that
 * arrives twice because an old and a new connection briefly overlap — the
 * same problem product-client's `terminal-stream-registry.ts`
 * `appendDataEntry` solves for the web/desktop client.
 */

describe("createTerminalFrameDedupeState", () => {
  it("defaults lastSeq to 0", () => {
    expect(createTerminalFrameDedupeState().lastSeq).toBe(0);
  });

  it("accepts an explicit initial seq (e.g. resuming from a known afterSeq)", () => {
    expect(createTerminalFrameDedupeState(42).lastSeq).toBe(42);
  });
});

describe("acceptTerminalFrame", () => {
  it("accepts a frame with seq greater than lastSeq and advances state", () => {
    const state = createTerminalFrameDedupeState();
    const result = acceptTerminalFrame(state, 1);
    expect(result.accepted).toBe(true);
    expect(result.state.lastSeq).toBe(1);
  });

  it("accepts a strictly increasing run of seqs", () => {
    let state = createTerminalFrameDedupeState();
    for (const seq of [1, 2, 3, 4, 5]) {
      const result = acceptTerminalFrame(state, seq);
      expect(result.accepted).toBe(true);
      state = result.state;
    }
    expect(state.lastSeq).toBe(5);
  });

  it("rejects a replayed frame with seq equal to lastSeq, returning the same state reference", () => {
    const afterFirst = acceptTerminalFrame(createTerminalFrameDedupeState(), 5).state;
    const replay = acceptTerminalFrame(afterFirst, 5);
    expect(replay.accepted).toBe(false);
    expect(replay.state).toBe(afterFirst);
  });

  it("rejects a stale frame with seq less than lastSeq", () => {
    const afterFive = acceptTerminalFrame(createTerminalFrameDedupeState(), 5).state;
    const stale = acceptTerminalFrame(afterFive, 3);
    expect(stale.accepted).toBe(false);
    expect(stale.state).toBe(afterFive);
  });

  it("rejects seq 0 against the default initial state (0 <= 0)", () => {
    const result = acceptTerminalFrame(createTerminalFrameDedupeState(), 0);
    expect(result.accepted).toBe(false);
  });

  it("treats data and exit frames as one shared seq space (accepts either order, rejects replays of either)", () => {
    // seq 5 = a "data" frame, seq 6 = the terminating "exit" frame — both
    // flow through the same acceptTerminalFrame call from the controller.
    const afterData = acceptTerminalFrame(createTerminalFrameDedupeState(), 5).state;
    const afterExit = acceptTerminalFrame(afterData, 6);
    expect(afterExit.accepted).toBe(true);

    // A duplicate delivery of the exit frame (e.g. reconnect race) is
    // rejected same as a duplicate data frame would be.
    const replayedExit = acceptTerminalFrame(afterExit.state, 6);
    expect(replayedExit.accepted).toBe(false);
  });

  it("resuming from a nonzero afterSeq rejects everything at or below it and accepts above", () => {
    const state = createTerminalFrameDedupeState(10);
    expect(acceptTerminalFrame(state, 10).accepted).toBe(false);
    expect(acceptTerminalFrame(state, 9).accepted).toBe(false);
    const result = acceptTerminalFrame(state, 11);
    expect(result.accepted).toBe(true);
    expect(result.state.lastSeq).toBe(11);
  });

  it("accepts a large forward jump (a gap the server already floored via replay_gap)", () => {
    const state = createTerminalFrameDedupeState(5);
    const result = acceptTerminalFrame(state, 500);
    expect(result.accepted).toBe(true);
    expect(result.state.lastSeq).toBe(500);
  });
});
