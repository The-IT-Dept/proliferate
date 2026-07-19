import { describe, expect, it } from "vitest";
import { reduceEvents } from "@anyharness/sdk";

import {
  ASSISTANT_ITEM_ID,
  CANNED_SESSION_ENVELOPES,
  ERROR_EVENT_ENVELOPE,
  PLAN_ITEM_ENVELOPE,
  PLAN_ITEM_ID,
  PROPOSED_PLAN_ITEM_ENVELOPE,
  PROPOSED_PLAN_ITEM_ID,
  SESSION_ID,
  TOOL_CALL_ITEM_ID,
  USER_INPUT_REQUESTED_ENVELOPE,
  USER_MESSAGE_ITEM_ID,
} from "../../../hooks/chat/derived/__fixtures__/session-transcript-fixtures";
import { buildLiveTranscriptRows } from "./mobile-live-transcript-view";

describe("buildLiveTranscriptRows — canned turn", () => {
  const transcript = reduceEvents(CANNED_SESSION_ENVELOPES, SESSION_ID);
  const rows = buildLiveTranscriptRows(transcript);

  it("renders one row per known transcript item, in turn/item order", () => {
    expect(rows.map((row) => row.id)).toEqual([
      USER_MESSAGE_ITEM_ID,
      ASSISTANT_ITEM_ID,
      TOOL_CALL_ITEM_ID,
    ]);
  });

  it("renders the user_message row verbatim", () => {
    const row = rows[0];
    expect(row).toMatchObject({
      kind: "user_message",
      text: "Fix the failing test",
      isStreaming: false,
    });
  });

  it("renders the assistant_prose row with the fully-accumulated streamed text", () => {
    const row = rows[1];
    expect(row).toMatchObject({
      kind: "assistant_prose",
      text: "Sure, let me look.",
      isStreaming: false,
    });
  });

  it("renders the tool_call row with a title, approval state, and a terminal_output summary line", () => {
    const row = rows[2];
    expect(row.kind).toBe("tool_call");
    if (row.kind !== "tool_call") return;
    expect(row.title).toBeTruthy();
    expect(row.approvalState).toBe("approved");
    expect(row.status).toBe("completed");
    // terminal_output content part -> a summarized line, verbatim data text
    // for a short "output" event.
    expect(row.summaryLines).toContain("5 passed");
  });

  it("does not append a pending-interaction placeholder once resolved", () => {
    expect(rows.some((row) => row.kind === "pending_interaction")).toBe(false);
  });
});

describe("buildLiveTranscriptRows — pending interaction placeholder", () => {
  it("does not duplicate a permission interaction already shown inline via the tool_call badge", () => {
    const upToRequest = CANNED_SESSION_ENVELOPES.slice(0, 9); // through interaction_requested
    const transcript = reduceEvents(upToRequest, SESSION_ID);
    const rows = buildLiveTranscriptRows(transcript);

    const toolRow = rows.find((row) => row.id === TOOL_CALL_ITEM_ID);
    expect(toolRow?.kind).toBe("tool_call");
    if (toolRow?.kind === "tool_call") {
      expect(toolRow.approvalState).toBe("pending");
    }
    expect(rows.some((row) => row.kind === "pending_interaction")).toBe(false);
  });

  it("appends a minimal, non-interactive placeholder for a user_input interaction with no tool call", () => {
    const transcript = reduceEvents(
      [...CANNED_SESSION_ENVELOPES, USER_INPUT_REQUESTED_ENVELOPE],
      SESSION_ID,
    );
    const rows = buildLiveTranscriptRows(transcript);
    const placeholder = rows.at(-1);
    expect(placeholder?.kind).toBe("pending_interaction");
    if (placeholder?.kind === "pending_interaction") {
      expect(placeholder.interactionKind).toBe("user_input");
      expect(placeholder.title).toBe("What should the new endpoint be called?");
    }
  });
});

describe("buildLiveTranscriptRows — plan, proposed_plan, and error items", () => {
  it("renders a plan item's entries", () => {
    const transcript = reduceEvents(
      [...CANNED_SESSION_ENVELOPES, PLAN_ITEM_ENVELOPE],
      SESSION_ID,
    );
    const rows = buildLiveTranscriptRows(transcript);
    const planRow = rows.find((row) => row.id === PLAN_ITEM_ID);
    expect(planRow?.kind).toBe("plan");
    if (planRow?.kind === "plan") {
      expect(planRow.entries).toEqual([
        { content: "Reproduce the failure", status: "completed" },
        { content: "Write the fix", status: "in_progress" },
        { content: "Add a regression test", status: "pending" },
      ]);
    }
  });

  it("renders a proposed_plan item with its markdown body and decision state", () => {
    const transcript = reduceEvents(
      [...CANNED_SESSION_ENVELOPES, PROPOSED_PLAN_ITEM_ENVELOPE],
      SESSION_ID,
    );
    const rows = buildLiveTranscriptRows(transcript);
    const proposedRow = rows.find((row) => row.id === PROPOSED_PLAN_ITEM_ID);
    expect(proposedRow?.kind).toBe("proposed_plan");
    if (proposedRow?.kind === "proposed_plan") {
      expect(proposedRow.title).toBe("Ship the fix");
      expect(proposedRow.bodyMarkdown).toBe("1. Patch the parser\n2. Add a test");
      expect(proposedRow.decisionState).toBe("pending");
    }
  });

  it("renders a top-level error event as an error row", () => {
    const transcript = reduceEvents(
      [...CANNED_SESSION_ENVELOPES, ERROR_EVENT_ENVELOPE],
      SESSION_ID,
    );
    const rows = buildLiveTranscriptRows(transcript);
    const errorRow = rows.at(-1);
    expect(errorRow?.kind).toBe("error");
    if (errorRow?.kind === "error") {
      expect(errorRow.message).toBe("The sandbox lost its connection to the runtime.");
      expect(errorRow.code).toBe("RUNTIME_DISCONNECTED");
    }
  });
});
