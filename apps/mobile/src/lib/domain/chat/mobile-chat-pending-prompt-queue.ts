import type { PendingPromptEntry } from "@anyharness/sdk";
import {
  derivePendingPromptQueueRow,
  type PendingPromptQueueRow,
} from "@proliferate/product-domain/chats/pending-prompts/pending-prompt-queue";

/**
 * Group E2 — pure projection/derivation for the runtime pending-prompt
 * queue (server-side queued messages, `TranscriptState.pendingPrompts`,
 * exposed by E1 as `stream.transcript.pendingPrompts`). This is a
 * DIFFERENT concept from `MobilePendingPrompt`
 * (`lib/domain/workspace/mobile-workspace-chat.ts`) — the mobile-only
 * "no session yet, dispatch once the workspace is ready" prompt that
 * `use-mobile-pending-prompt-dispatcher.ts` owns. The web has no
 * equivalent of that mobile-only flow; this module mirrors the web's own
 * runtime queue (`use-pending-prompt-queue.ts` in product-client) instead.
 *
 * `derivePendingPromptQueueRow` (row shape, edit/delete eligibility, label
 * summarization, wake/review-feedback special-casing) is reused unchanged
 * from `@proliferate/product-domain` — already unit-tested there. Mobile
 * has no local-outbox concept (cloud-only, no client-materialized "waiting
 * for session" prompts on an *existing* session), so
 * `localOutboxDeliveryState` is always omitted, which the shared row
 * derivation treats correctly as "runtime-only" (delete action "runtime"
 * once `seq > 0`, nothing to show before that — mobile just doesn't queue
 * unconfirmed rows through this surface at all).
 *
 * What's new here (mobile-specific, TDD'd below) is the reorder math and
 * queue-mutation lock: the web reorders via a `GripVertical` drag handle
 * (`PendingPromptList.tsx`) with an arrow-key fallback
 * (`handleReorderKeyDown` in the same file) that moves a row to its nearest
 * *runtime* (seq>0) neighbor. Mobile has no drag surface, so the queue UI
 * exposes only that arrow-key-equivalent affordance (up/down buttons) —
 * `runtimeReorderNeighbors` computes the same neighbor targets, and
 * `computeReorderRequest` computes the same compare-and-swap
 * `{expectedSeqs, desiredSeqs}` payload the web sends to
 * `useReorderPendingPromptsMutation`.
 */

export function buildMobilePendingPromptQueueRows(
  entries: readonly PendingPromptEntry[],
  editingSeq: number | null,
): PendingPromptQueueRow[] {
  return entries.map((entry) =>
    derivePendingPromptQueueRow({
      ...entry,
      isBeingEdited: entry.seq === editingSeq,
    })
  );
}

export interface ReorderNeighbors {
  previousIndex: number | null;
  nextIndex: number | null;
}

/**
 * The runtime (seq>0) neighbor indexes around `index`, skipping any
 * unconfirmed rows in between — mirrors the web's `runtimeEntryIndexes`
 * computation in `PendingPromptList.tsx`, which the arrow-key reorder
 * handler uses as its move targets.
 */
export function runtimeReorderNeighbors(
  rows: readonly PendingPromptQueueRow[],
  index: number,
): ReorderNeighbors {
  const runtimeIndexes = rows.flatMap((row, rowIndex) => row.seq > 0 ? [rowIndex] : []);
  const position = runtimeIndexes.indexOf(index);
  if (position === -1) {
    return { previousIndex: null, nextIndex: null };
  }
  return {
    previousIndex: position > 0 ? runtimeIndexes[position - 1] ?? null : null,
    nextIndex: position < runtimeIndexes.length - 1 ? runtimeIndexes[position + 1] ?? null : null,
  };
}

export interface ReorderRequest {
  expectedSeqs: number[];
  desiredSeqs: number[];
}

/**
 * Compare-and-swap reorder payload for moving the row at `fromIndex` to
 * `toIndex`, mirrors `usePendingPromptQueue.handleReorder`'s pure
 * computation (product-client): bounds-check, splice, then keep only
 * runtime (seq>0) seqs in both arrays. Returns null for a no-op (same
 * index, out of bounds, or a move that doesn't change the runtime order —
 * e.g. relocating an unconfirmed row around a fixed set of runtime rows).
 */
export function computeReorderRequest(
  rows: readonly PendingPromptQueueRow[],
  fromIndex: number,
  toIndex: number,
): ReorderRequest | null {
  if (
    fromIndex === toIndex
    || fromIndex < 0
    || toIndex < 0
    || fromIndex >= rows.length
    || toIndex >= rows.length
  ) {
    return null;
  }
  const expectedSeqs = rows.filter((row) => row.seq > 0).map((row) => row.seq);
  const reordered = [...rows];
  const [moved] = reordered.splice(fromIndex, 1);
  if (!moved) {
    return null;
  }
  reordered.splice(toIndex, 0, moved);
  const desiredSeqs = reordered.filter((row) => row.seq > 0).map((row) => row.seq);
  if (desiredSeqs.length === 0 || arraysEqual(expectedSeqs, desiredSeqs)) {
    return null;
  }
  return { expectedSeqs, desiredSeqs };
}

/**
 * Applies an in-flight optimistic reorder (by row key) over the live rows —
 * mirrors the `rows` memo in the web's `usePendingPromptQueue`: rows named
 * in `order` come first in that order, anything else (including rows added
 * since the mutation started) is appended in its original order. Keys
 * present in `order` but no longer live (e.g. deleted mid-flight) are
 * silently dropped.
 */
export function applyOptimisticQueueOrder(
  rows: readonly PendingPromptQueueRow[],
  order: readonly string[] | null,
): PendingPromptQueueRow[] {
  if (!order) {
    return [...rows];
  }
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const reordered = order.flatMap((key) => {
    const row = byKey.get(key);
    return row ? [row] : [];
  });
  const optimisticKeys = new Set(order);
  reordered.push(...rows.filter((row) => !optimisticKeys.has(row.key)));
  return reordered;
}

export type PendingPromptQueueMutationKind = "steer" | "reorder";

export interface PendingPromptQueueMutationState {
  kind: PendingPromptQueueMutationKind;
  steeringSeq: number | null;
  optimisticOrder: readonly string[] | null;
}

export type PendingPromptQueueMutationAction =
  | { type: "steer_started"; seq: number }
  | { type: "reorder_started"; order: readonly string[] }
  | { type: "settled" };

/**
 * Single in-flight-mutation lock for one session's queue, mirrors the web's
 * `mutationsBySessionIdRef` entry semantics: only one queue mutation
 * (steer or reorder) may be in flight at a time; a start action while one
 * is already in flight is a no-op (same reference returned, so callers can
 * `===` check to detect "nothing changed" and skip re-issuing the
 * mutation); `settled` always clears back to idle. Session-scoping itself
 * (a Map keyed by sessionId) is a React-hook concern, not pure state, so it
 * lives in `use-mobile-pending-prompt-queue.ts`, not here.
 */
export function reduceQueueMutation(
  state: PendingPromptQueueMutationState | null,
  action: PendingPromptQueueMutationAction,
): PendingPromptQueueMutationState | null {
  switch (action.type) {
    case "steer_started":
      return state ?? { kind: "steer", steeringSeq: action.seq, optimisticOrder: null };
    case "reorder_started":
      return state ?? { kind: "reorder", steeringSeq: null, optimisticOrder: action.order };
    case "settled":
      return null;
  }
}

function arraysEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
