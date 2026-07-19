import { describe, expect, it } from "vitest";
import type { PendingPromptEntry } from "@anyharness/sdk";

import {
  applyOptimisticQueueOrder,
  buildMobilePendingPromptQueueRows,
  computeReorderRequest,
  reduceQueueMutation,
  runtimeReorderNeighbors,
} from "./mobile-chat-pending-prompt-queue";

function entry(seq: number, text: string, overrides: Partial<PendingPromptEntry> = {}): PendingPromptEntry {
  return {
    seq,
    promptId: `prompt-${seq}`,
    text,
    contentParts: [],
    queuedAt: "2026-07-19T00:00:00Z",
    promptProvenance: null,
    ...overrides,
  };
}

describe("buildMobilePendingPromptQueueRows", () => {
  it("projects runtime pending-prompt entries into queue rows, preserving order", () => {
    const rows = buildMobilePendingPromptQueueRows(
      [entry(1, "first"), entry(2, "second")],
      null,
    );
    expect(rows.map((row) => row.key)).toEqual(["seq:1", "seq:2"]);
    expect(rows.map((row) => row.label)).toEqual(["first", "second"]);
    expect(rows.every((row) => !row.isBeingEdited)).toBe(true);
  });

  it("marks exactly the row matching the editing seq", () => {
    const rows = buildMobilePendingPromptQueueRows(
      [entry(1, "first"), entry(2, "second")],
      2,
    );
    expect(rows[0]?.isBeingEdited).toBe(false);
    expect(rows[1]?.isBeingEdited).toBe(true);
  });

  it("returns an empty list for no queued prompts", () => {
    expect(buildMobilePendingPromptQueueRows([], null)).toEqual([]);
  });
});

describe("runtimeReorderNeighbors", () => {
  const rows = buildMobilePendingPromptQueueRows(
    [entry(1, "a"), entry(2, "b"), entry(3, "c")],
    null,
  );

  it("finds the previous/next runtime row around a middle index", () => {
    expect(runtimeReorderNeighbors(rows, 1)).toEqual({ previousIndex: 0, nextIndex: 2 });
  });

  it("has no previous neighbor at the first index", () => {
    expect(runtimeReorderNeighbors(rows, 0)).toEqual({ previousIndex: null, nextIndex: 1 });
  });

  it("has no next neighbor at the last index", () => {
    expect(runtimeReorderNeighbors(rows, 2)).toEqual({ previousIndex: 1, nextIndex: null });
  });

  it("skips non-runtime (unconfirmed, seq<=0) rows when locating neighbors", () => {
    const withLocal = buildMobilePendingPromptQueueRows(
      [entry(1, "a"), entry(-10, "local, unconfirmed"), entry(2, "b")],
      null,
    );
    // index 1 is the local row (seq -10) — it's not a runtime row, so it has
    // no reorder neighbors of its own.
    expect(runtimeReorderNeighbors(withLocal, 1)).toEqual({ previousIndex: null, nextIndex: null });
    // index 2 (seq 2) is the second runtime row; its runtime neighbor is
    // index 0 (seq 1), not index 1 (the local row in between).
    expect(runtimeReorderNeighbors(withLocal, 2)).toEqual({ previousIndex: 0, nextIndex: null });
  });

  it("returns null neighbors for an out-of-range index", () => {
    expect(runtimeReorderNeighbors(rows, 99)).toEqual({ previousIndex: null, nextIndex: null });
  });
});

describe("computeReorderRequest", () => {
  const rows = buildMobilePendingPromptQueueRows(
    [entry(1, "a"), entry(2, "b"), entry(3, "c")],
    null,
  );

  it("computes a compare-and-swap request moving a row later", () => {
    expect(computeReorderRequest(rows, 0, 1)).toEqual({
      expectedSeqs: [1, 2, 3],
      desiredSeqs: [2, 1, 3],
    });
  });

  it("computes a compare-and-swap request moving a row earlier", () => {
    expect(computeReorderRequest(rows, 2, 0)).toEqual({
      expectedSeqs: [1, 2, 3],
      desiredSeqs: [3, 1, 2],
    });
  });

  it("returns null for a no-op move (same index)", () => {
    expect(computeReorderRequest(rows, 1, 1)).toBeNull();
  });

  it("returns null for an out-of-bounds index", () => {
    expect(computeReorderRequest(rows, 0, 5)).toBeNull();
    expect(computeReorderRequest(rows, -1, 1)).toBeNull();
  });

  it("filters out unconfirmed (seq<=0) rows from the seq arrays", () => {
    const withLocal = buildMobilePendingPromptQueueRows(
      [entry(1, "a"), entry(-10, "local"), entry(2, "b")],
      null,
    );
    // Moving the local row (index 1) after the last runtime row (index 2)
    // doesn't change the *runtime* seq order, so the request is a no-op.
    expect(computeReorderRequest(withLocal, 1, 2)).toBeNull();
  });

  it("returns null when the resulting runtime order is unchanged", () => {
    // Swapping two positions that produce the same net runtime ordering
    // (e.g. moving an item and moving it right back) is a no-op.
    expect(computeReorderRequest(rows, 0, 0)).toBeNull();
  });
});

describe("applyOptimisticQueueOrder", () => {
  const rows = buildMobilePendingPromptQueueRows(
    [entry(1, "a"), entry(2, "b"), entry(3, "c")],
    null,
  );

  it("returns rows unchanged when there is no optimistic order", () => {
    expect(applyOptimisticQueueOrder(rows, null)).toEqual(rows);
  });

  it("reorders rows by key according to the optimistic order", () => {
    const reordered = applyOptimisticQueueOrder(rows, ["seq:2", "seq:1", "seq:3"]);
    expect(reordered.map((row) => row.key)).toEqual(["seq:2", "seq:1", "seq:3"]);
  });

  it("appends rows missing from the optimistic order, in their original order", () => {
    const reordered = applyOptimisticQueueOrder(rows, ["seq:3"]);
    expect(reordered.map((row) => row.key)).toEqual(["seq:3", "seq:1", "seq:2"]);
  });

  it("drops optimistic keys that no longer exist in the live rows", () => {
    const reordered = applyOptimisticQueueOrder(rows, ["seq:99", "seq:2", "seq:1"]);
    expect(reordered.map((row) => row.key)).toEqual(["seq:2", "seq:1", "seq:3"]);
  });
});

describe("reduceQueueMutation", () => {
  it("starts a steer mutation from an idle state", () => {
    const next = reduceQueueMutation(null, { type: "steer_started", seq: 5 });
    expect(next).toEqual({ kind: "steer", steeringSeq: 5, optimisticOrder: null });
  });

  it("starts a reorder mutation from an idle state", () => {
    const next = reduceQueueMutation(null, {
      type: "reorder_started",
      order: ["seq:2", "seq:1"],
    });
    expect(next).toEqual({ kind: "reorder", steeringSeq: null, optimisticOrder: ["seq:2", "seq:1"] });
  });

  it("ignores a new mutation while one is already in flight (single in-flight lock)", () => {
    const inFlight = reduceQueueMutation(null, { type: "steer_started", seq: 1 });
    const next = reduceQueueMutation(inFlight, { type: "reorder_started", order: ["seq:1"] });
    expect(next).toBe(inFlight);
  });

  it("clears the mutation on settle", () => {
    const inFlight = reduceQueueMutation(null, { type: "steer_started", seq: 1 });
    expect(reduceQueueMutation(inFlight, { type: "settled" })).toBeNull();
  });

  it("settling an already-idle state stays null", () => {
    expect(reduceQueueMutation(null, { type: "settled" })).toBeNull();
  });
});
