import { describe, expect, it } from "vitest";
import {
  selectPendingApprovalInteraction,
  selectPendingUserInputInteraction,
  selectPrimaryPendingInteraction,
} from "@anyharness/sdk";

import {
  ASSISTANT_ITEM_ID,
  CANNED_SESSION_ENVELOPES,
  PERMISSION_REQUEST_ID,
  SESSION_ID,
  TOOL_CALL_ITEM_ID,
  TURN_ID,
  USER_INPUT_REQUESTED_ENVELOPE,
  USER_INPUT_REQUEST_ID,
  USER_MESSAGE_ITEM_ID,
} from "./__fixtures__/session-transcript-fixtures";
import {
  applyStreamEnvelope,
  applyStreamEnvelopeBatch,
  createSessionTranscriptStreamState,
  type SessionTranscriptStreamState,
} from "./session-transcript-stream-state";

function applySequentially(
  envelopes: typeof CANNED_SESSION_ENVELOPES,
): SessionTranscriptStreamState {
  return envelopes.reduce(
    (state, envelope) => applyStreamEnvelope(state, envelope),
    createSessionTranscriptStreamState(SESSION_ID),
  );
}

describe("createSessionTranscriptStreamState", () => {
  it("starts empty, at seq 0, for the given session", () => {
    const state = createSessionTranscriptStreamState(SESSION_ID);
    expect(state.sessionId).toBe(SESSION_ID);
    expect(state.lastSeq).toBe(0);
    expect(state.envelopes).toEqual([]);
    expect(state.transcript.turnOrder).toEqual([]);
    expect(state.transcript.sessionMeta.sessionId).toBe(SESSION_ID);
  });
});

describe("applyStreamEnvelope — full canned turn", () => {
  const state = applySequentially(CANNED_SESSION_ENVELOPES);

  it("advances lastSeq to the highest applied seq and records every envelope", () => {
    expect(state.lastSeq).toBe(12);
    expect(state.envelopes).toHaveLength(CANNED_SESSION_ENVELOPES.length);
  });

  it("orders the single turn and its items", () => {
    expect(state.transcript.turnOrder).toEqual([TURN_ID]);
    const turn = state.transcript.turnsById[TURN_ID];
    expect(turn?.itemOrder).toEqual([USER_MESSAGE_ITEM_ID, ASSISTANT_ITEM_ID, TOOL_CALL_ITEM_ID]);
    expect(turn?.stopReason).toBe("end_turn");
    expect(turn?.completedAt).not.toBeNull();
  });

  it("reduces the user message item verbatim", () => {
    const item = state.transcript.itemsById[USER_MESSAGE_ITEM_ID];
    expect(item?.kind).toBe("user_message");
    if (item?.kind === "user_message") {
      expect(item.text).toBe("Fix the failing test");
      expect(item.isStreaming).toBe(false);
    }
  });

  it("accumulates streamed assistant deltas into the final prose and closes streaming", () => {
    const item = state.transcript.itemsById[ASSISTANT_ITEM_ID];
    expect(item?.kind).toBe("assistant_prose");
    if (item?.kind === "assistant_prose") {
      expect(item.text).toBe("Sure, let me look.");
      expect(item.isStreaming).toBe(false);
    }
    expect(state.transcript.openAssistantItemId).toBeNull();
  });

  it("marks the tool call approved after the permission interaction resolves", () => {
    const item = state.transcript.itemsById[TOOL_CALL_ITEM_ID];
    expect(item?.kind).toBe("tool_call");
    if (item?.kind === "tool_call") {
      expect(item.toolCallId).toBe("tool-1");
      expect(item.nativeToolName).toBe("Bash");
      expect(item.semanticKind).toBe("terminal");
      expect(item.approvalState).toBe("approved");
      expect(item.status).toBe("completed");
    }
  });

  it("clears the pending interaction once resolved", () => {
    expect(state.transcript.pendingInteractions).toEqual([]);
    expect(selectPrimaryPendingInteraction(state.transcript)).toBeNull();
    expect(selectPendingApprovalInteraction(state.transcript)).toBeNull();
  });
});

describe("applyStreamEnvelope — pending interaction is visible before resolution", () => {
  it("surfaces the permission interaction via the primary + approval selectors", () => {
    const upToRequest = CANNED_SESSION_ENVELOPES.slice(0, 9); // through interaction_requested (seq 9)
    const state = applySequentially(upToRequest);

    expect(state.transcript.pendingInteractions).toHaveLength(1);
    const primary = selectPrimaryPendingInteraction(state.transcript);
    expect(primary?.requestId).toBe(PERMISSION_REQUEST_ID);
    expect(primary?.kind).toBe("permission");

    const approval = selectPendingApprovalInteraction(state.transcript);
    expect(approval?.requestId).toBe(PERMISSION_REQUEST_ID);

    expect(selectPendingUserInputInteraction(state.transcript)).toBeNull();

    // Still pending — the tool call reflects that.
    const toolItem = state.transcript.itemsById[TOOL_CALL_ITEM_ID];
    expect(toolItem?.kind).toBe("tool_call");
    if (toolItem?.kind === "tool_call") {
      expect(toolItem.approvalState).toBe("pending");
    }
  });

  it("a standalone user_input interaction (no toolCallId) is primary but not an approval", () => {
    const state = applyStreamEnvelope(
      applySequentially(CANNED_SESSION_ENVELOPES),
      USER_INPUT_REQUESTED_ENVELOPE,
    );

    const primary = selectPrimaryPendingInteraction(state.transcript);
    expect(primary?.requestId).toBe(USER_INPUT_REQUEST_ID);
    expect(selectPendingApprovalInteraction(state.transcript)).toBeNull();
    expect(selectPendingUserInputInteraction(state.transcript)?.requestId).toBe(
      USER_INPUT_REQUEST_ID,
    );
  });
});

describe("applyStreamEnvelope — dedupe and out-of-order", () => {
  it("drops (returns the same reference for) a duplicate of the last-applied seq", () => {
    const afterFirst = applyStreamEnvelope(
      createSessionTranscriptStreamState(SESSION_ID),
      CANNED_SESSION_ENVELOPES[0]!,
    );
    const replayed = applyStreamEnvelope(afterFirst, CANNED_SESSION_ENVELOPES[0]!);
    expect(replayed).toBe(afterFirst);
  });

  it("drops a stale out-of-order envelope with seq behind the current lastSeq", () => {
    const state = applySequentially(CANNED_SESSION_ENVELOPES.slice(0, 5)); // through seq 5
    expect(state.lastSeq).toBe(5);
    const withStale = applyStreamEnvelope(state, CANNED_SESSION_ENVELOPES[2]!); // seq 3, already behind
    expect(withStale).toBe(state);
    expect(withStale.lastSeq).toBe(5);
  });

  it("does not double-apply an appendText delta when the same delta envelope arrives twice", () => {
    const throughDelta = applySequentially(CANNED_SESSION_ENVELOPES.slice(0, 5)); // through first appendText
    const repeated = applyStreamEnvelope(throughDelta, CANNED_SESSION_ENVELOPES[4]!); // same seq-5 delta again
    const item = repeated.transcript.itemsById[ASSISTANT_ITEM_ID];
    expect(item?.kind).toBe("assistant_prose");
    if (item?.kind === "assistant_prose") {
      expect(item.text).toBe("Sure, let ");
    }
  });

  it("drops an envelope belonging to a different session", () => {
    const state = createSessionTranscriptStreamState(SESSION_ID);
    const foreign = { ...CANNED_SESSION_ENVELOPES[0]!, sessionId: "some-other-session" };
    const result = applyStreamEnvelope(state, foreign);
    expect(result).toBe(state);
  });
});

describe("applyStreamEnvelopeBatch", () => {
  it("matches sequential single-envelope application for the full canned turn", () => {
    const sequential = applySequentially(CANNED_SESSION_ENVELOPES);
    const batched = applyStreamEnvelopeBatch(
      createSessionTranscriptStreamState(SESSION_ID),
      CANNED_SESSION_ENVELOPES,
    );
    expect(batched.lastSeq).toBe(sequential.lastSeq);
    expect(batched.envelopes).toEqual(sequential.envelopes);
    expect(batched.transcript).toEqual(sequential.transcript);
  });

  it("is a no-op (same reference) for an empty batch or an all-stale batch", () => {
    const state = applySequentially(CANNED_SESSION_ENVELOPES.slice(0, 5));
    expect(applyStreamEnvelopeBatch(state, [])).toBe(state);
    expect(applyStreamEnvelopeBatch(state, CANNED_SESSION_ENVELOPES.slice(0, 3))).toBe(state);
  });

  it("sorts an out-of-order backfill page and dedupes an overlapping seq before reducing", () => {
    const unordered = [
      CANNED_SESSION_ENVELOPES[1]!, // seq 2
      CANNED_SESSION_ENVELOPES[0]!, // seq 1
      CANNED_SESSION_ENVELOPES[1]!, // seq 2 again (overlap)
      CANNED_SESSION_ENVELOPES[2]!, // seq 3
    ];
    const batched = applyStreamEnvelopeBatch(
      createSessionTranscriptStreamState(SESSION_ID),
      unordered,
    );
    expect(batched.lastSeq).toBe(3);
    expect(batched.envelopes.map((entry) => entry.seq)).toEqual([1, 2, 3]);
  });

  it("resumes correctly: applying the tail after a prior prefix matches applying the whole batch", () => {
    const prefix = CANNED_SESSION_ENVELOPES.slice(0, 6); // seq 1..6
    const afterPrefix = applyStreamEnvelopeBatch(
      createSessionTranscriptStreamState(SESSION_ID),
      prefix,
    );
    expect(afterPrefix.lastSeq).toBe(6);

    // Simulate a reconnect with afterSeq = 6: the backfill overlaps by
    // resending seq 6 too, which must be dropped, not re-applied.
    const resumeBatch = CANNED_SESSION_ENVELOPES.slice(5); // seq 6..12
    const resumed = applyStreamEnvelopeBatch(afterPrefix, resumeBatch);

    const full = applyStreamEnvelopeBatch(
      createSessionTranscriptStreamState(SESSION_ID),
      CANNED_SESSION_ENVELOPES,
    );
    expect(resumed.lastSeq).toBe(full.lastSeq);
    expect(resumed.transcript).toEqual(full.transcript);
    expect(resumed.envelopes.map((entry) => entry.seq)).toEqual(
      full.envelopes.map((entry) => entry.seq),
    );
  });
});
