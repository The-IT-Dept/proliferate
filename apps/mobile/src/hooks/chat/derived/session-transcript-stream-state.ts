import {
  createTranscriptState,
  reduceEvent,
  reduceEventBatch,
  type SessionEventEnvelope,
  type TranscriptState,
} from "@anyharness/sdk";

/**
 * The value a live session stream accumulates: the SDK's reduced
 * `TranscriptState` (for rendering + the E3 pending-interaction selectors)
 * alongside the raw, ordered, deduped envelope log (kept so the existing
 * `@proliferate/product-domain` "Cloud" transcript-row/pending-prompt
 * machinery — which reduces from raw envelopes itself — keeps working
 * unchanged off the same live data; see `use-mobile-chat-data.ts`).
 *
 * Immutable: every `apply*` function returns a new object (or the exact same
 * reference when nothing changed), so `useSyncExternalStore` consumers can
 * rely on `Object.is` to detect real updates.
 */
export interface SessionTranscriptStreamState {
  readonly sessionId: string;
  readonly transcript: TranscriptState;
  readonly envelopes: readonly SessionEventEnvelope[];
  readonly lastSeq: number;
}

export function createSessionTranscriptStreamState(
  sessionId: string,
): SessionTranscriptStreamState {
  return {
    sessionId,
    transcript: createTranscriptState(sessionId),
    envelopes: [],
    lastSeq: 0,
  };
}

/**
 * Applies one envelope (a live `streamSession` frame, or one row of an
 * `afterSeq` backfill) to the stream state.
 *
 * Returns the *same* `state` reference — not a shallow copy — when the
 * envelope is dropped, so callers (the `useSyncExternalStore` controller)
 * can skip notifying subscribers for a no-op using `Object.is`.
 *
 * Drops:
 *  - envelopes for a different session (a stale in-flight stream from a
 *    session the user has since switched away from delivering one more
 *    frame after the store already moved on),
 *  - envelopes at or behind `lastSeq` — reconnects resume via `afterSeq`,
 *    but neither SSE nor an `afterSeq` backfill guarantees exactly-once
 *    delivery, and re-applying an already-seen `item_delta` (e.g.
 *    `appendText`) would double it, not just no-op it. This is the seam
 *    that makes reduction idempotent under reconnects.
 */
export function applyStreamEnvelope(
  state: SessionTranscriptStreamState,
  envelope: SessionEventEnvelope,
): SessionTranscriptStreamState {
  if (envelope.sessionId !== state.sessionId) {
    return state;
  }
  if (envelope.seq <= state.lastSeq) {
    return state;
  }
  return {
    sessionId: state.sessionId,
    transcript: reduceEvent(state.transcript, envelope),
    envelopes: [...state.envelopes, envelope],
    lastSeq: envelope.seq,
  };
}

/**
 * Applies a batch of envelopes (an `afterSeq` backfill, or several frames
 * coalesced from one stream flush) in one pass, reusing the SDK reducer's
 * copy-on-write batching (`reduceEventBatch`) instead of cloning per event.
 * Order-independent: the batch is sorted by `seq` and internally deduped
 * before anything already at/behind `lastSeq` — or repeated within the
 * batch itself — is dropped, so an out-of-order or overlapping backfill page
 * still reduces to the same result as feeding events through one at a time.
 */
export function applyStreamEnvelopeBatch(
  state: SessionTranscriptStreamState,
  envelopes: readonly SessionEventEnvelope[],
): SessionTranscriptStreamState {
  const applicable = dedupeOrderedBySeq(
    envelopes.filter(
      (candidate) => candidate.sessionId === state.sessionId && candidate.seq > state.lastSeq,
    ),
  );
  if (applicable.length === 0) {
    return state;
  }
  const lastSeq = applicable[applicable.length - 1]!.seq;
  return {
    sessionId: state.sessionId,
    transcript: reduceEventBatch(state.transcript, applicable),
    envelopes: [...state.envelopes, ...applicable],
    lastSeq,
  };
}

function dedupeOrderedBySeq(
  envelopes: readonly SessionEventEnvelope[],
): SessionEventEnvelope[] {
  const sorted = [...envelopes].sort((left, right) => left.seq - right.seq);
  const result: SessionEventEnvelope[] = [];
  let lastSeq = Number.NEGATIVE_INFINITY;
  for (const candidate of sorted) {
    if (candidate.seq === lastSeq) {
      continue;
    }
    result.push(candidate);
    lastSeq = candidate.seq;
  }
  return result;
}
