import { describe, expect, it } from "vitest";
import { reduceEvents } from "@anyharness/sdk";

import {
  ASSISTANT_ITEM_ID,
  CANNED_SESSION_ENVELOPES,
  ERROR_EVENT_ENVELOPE,
  MCP_ELICITATION_FORM_REQUEST_ID,
  MCP_ELICITATION_FORM_REQUESTED_ENVELOPE,
  MCP_ELICITATION_URL_REQUEST_ID,
  MCP_ELICITATION_URL_REQUESTED_ENVELOPE,
  PERMISSION_REQUEST_ID,
  PLAN_ITEM_ENVELOPE,
  PLAN_ITEM_ID,
  PROPOSED_PLAN_DECISION_FAILED_ENVELOPE,
  PROPOSED_PLAN_DECISION_PENDING_ENVELOPE,
  PROPOSED_PLAN_ITEM_ENVELOPE,
  PROPOSED_PLAN_ITEM_ID,
  PROPOSED_PLAN_NATIVE_ITEM_ENVELOPE,
  PROPOSED_PLAN_NATIVE_ITEM_ID,
  SESSION_ID,
  THOUGHT_ITEM_ENVELOPE,
  THOUGHT_ITEM_ID,
  TOOL_CALL_ITEM_ID,
  UNKNOWN_ITEM_ENVELOPE,
  UNKNOWN_ITEM_ID,
  USER_INPUT_REQUEST_ID,
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

  it("does not append an interaction card row once resolved", () => {
    expect(rows.some((row) =>
      row.kind === "permission_interaction"
      || row.kind === "user_input_interaction"
      || row.kind === "mcp_elicitation_interaction"
    )).toBe(false);
  });
});

describe("buildLiveTranscriptRows — pending interaction cards", () => {
  it("appends a permission_interaction row for a permission tied to a tool call, alongside its pending tool_call row", () => {
    const upToRequest = CANNED_SESSION_ENVELOPES.slice(0, 9); // through interaction_requested
    const transcript = reduceEvents(upToRequest, SESSION_ID);
    const rows = buildLiveTranscriptRows(transcript);

    const toolRow = rows.find((row) => row.id === TOOL_CALL_ITEM_ID);
    expect(toolRow?.kind).toBe("tool_call");
    if (toolRow?.kind === "tool_call") {
      expect(toolRow.approvalState).toBe("pending");
    }
    const card = rows.at(-1);
    expect(card?.kind).toBe("permission_interaction");
    if (card?.kind === "permission_interaction") {
      expect(card.requestId).toBe(PERMISSION_REQUEST_ID);
      expect(card.id).toBe(`pending-interaction:${PERMISSION_REQUEST_ID}`);
      expect(card.title).toBe("Allow running tests?");
      expect(card.options).toEqual([
        { optionId: "allow_once", label: "Allow", kind: "allow_once" },
        { optionId: "reject_once", label: "Deny", kind: "reject_once" },
      ]);
    }
  });

  it("appends a user_input_interaction row for a user_input interaction with no tool call", () => {
    const transcript = reduceEvents(
      [...CANNED_SESSION_ENVELOPES, USER_INPUT_REQUESTED_ENVELOPE],
      SESSION_ID,
    );
    const rows = buildLiveTranscriptRows(transcript);
    const card = rows.at(-1);
    expect(card?.kind).toBe("user_input_interaction");
    if (card?.kind === "user_input_interaction") {
      expect(card.requestId).toBe(USER_INPUT_REQUEST_ID);
      expect(card.title).toBe("What should the new endpoint be called?");
      expect(card.questions).toEqual([
        {
          questionId: "q1",
          question: "Endpoint name?",
          header: "Naming",
          isOther: false,
          isSecret: false,
        },
      ]);
    }
  });

  // Fix D (E3 Minor, reviewer finding): mcp_elicitation was the one
  // interaction kind with no row-mapping coverage — both its url and form
  // payload shapes carry through `pendingInteractionRow` distinctly (the
  // whole `McpElicitationInteractionPayload`, `mode` included, becomes the
  // row's `payload` verbatim).
  it("appends a mcp_elicitation_interaction row for a url-mode elicitation", () => {
    const transcript = reduceEvents(
      [...CANNED_SESSION_ENVELOPES, MCP_ELICITATION_URL_REQUESTED_ENVELOPE],
      SESSION_ID,
    );
    const rows = buildLiveTranscriptRows(transcript);
    const card = rows.at(-1);
    expect(card?.kind).toBe("mcp_elicitation_interaction");
    if (card?.kind === "mcp_elicitation_interaction") {
      expect(card.requestId).toBe(MCP_ELICITATION_URL_REQUEST_ID);
      expect(card.id).toBe(`pending-interaction:${MCP_ELICITATION_URL_REQUEST_ID}`);
      expect(card.title).toBe("Authorize with Linear");
      expect(card.payload).toEqual({
        serverName: "linear",
        mode: {
          mode: "url",
          message: "Open this link to authorize.",
          requiresReveal: true,
          urlDisplay: "https://linear.app/oauth/authorize",
        },
      });
    }
  });

  it("appends a mcp_elicitation_interaction row for a form-mode elicitation, with its fields carried through", () => {
    const transcript = reduceEvents(
      [...CANNED_SESSION_ENVELOPES, MCP_ELICITATION_FORM_REQUESTED_ENVELOPE],
      SESSION_ID,
    );
    const rows = buildLiveTranscriptRows(transcript);
    const card = rows.at(-1);
    expect(card?.kind).toBe("mcp_elicitation_interaction");
    if (card?.kind === "mcp_elicitation_interaction") {
      expect(card.requestId).toBe(MCP_ELICITATION_FORM_REQUEST_ID);
      expect(card.title).toBe("Create a Linear issue");
      expect(card.payload).toEqual({
        serverName: "linear",
        mode: {
          mode: "form",
          message: "Fill in the issue details.",
          fields: [
            { fieldId: "title", fieldType: "text", label: "Title", required: true },
          ],
        },
      });
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
      // Row 20 — before any `proposed_plan_decision` content part has
      // arrived, there's nothing yet to send `expectedDecisionVersion`
      // with, so the row carries a null version (Approve/Reject stay
      // hidden until a real version shows up).
      expect(proposedRow.planId).toBe("plan-1");
      expect(proposedRow.decisionVersion).toBeNull();
      expect(proposedRow.nativeResolutionState).toBeNull();
      expect(proposedRow.errorMessage).toBeNull();
      expect(proposedRow.nativeContinuation).toBe(false);
    }
  });

  it("Row 20 — carries a proposed_plan's decision fields (planId/version/native state) once the decision content part arrives", () => {
    const transcript = reduceEvents(
      [
        ...CANNED_SESSION_ENVELOPES,
        PROPOSED_PLAN_ITEM_ENVELOPE,
        PROPOSED_PLAN_DECISION_PENDING_ENVELOPE,
      ],
      SESSION_ID,
    );
    const rows = buildLiveTranscriptRows(transcript);
    const proposedRow = rows.find((row) => row.id === PROPOSED_PLAN_ITEM_ID);
    expect(proposedRow?.kind).toBe("proposed_plan");
    if (proposedRow?.kind === "proposed_plan") {
      expect(proposedRow.decisionState).toBe("pending");
      expect(proposedRow.planId).toBe("plan-1");
      expect(proposedRow.decisionVersion).toBe(1);
      expect(proposedRow.nativeResolutionState).toBe("none");
      expect(proposedRow.errorMessage).toBeNull();
    }
  });

  it("Row 20 — a later decision version overrides the earlier one (approved, native resolution failed, error message carried through)", () => {
    const transcript = reduceEvents(
      [
        ...CANNED_SESSION_ENVELOPES,
        PROPOSED_PLAN_ITEM_ENVELOPE,
        PROPOSED_PLAN_DECISION_PENDING_ENVELOPE,
        PROPOSED_PLAN_DECISION_FAILED_ENVELOPE,
      ],
      SESSION_ID,
    );
    const rows = buildLiveTranscriptRows(transcript);
    const proposedRow = rows.find((row) => row.id === PROPOSED_PLAN_ITEM_ID);
    expect(proposedRow?.kind).toBe("proposed_plan");
    if (proposedRow?.kind === "proposed_plan") {
      expect(proposedRow.decisionState).toBe("approved");
      expect(proposedRow.decisionVersion).toBe(2);
      expect(proposedRow.nativeResolutionState).toBe("failed");
      expect(proposedRow.errorMessage).toBe("agent crashed mid-run");
    }
  });

  it("Row 20 — nativeContinuation is true when the plan's sourceToolCallId is set", () => {
    const transcript = reduceEvents(
      [...CANNED_SESSION_ENVELOPES, PROPOSED_PLAN_NATIVE_ITEM_ENVELOPE],
      SESSION_ID,
    );
    const rows = buildLiveTranscriptRows(transcript);
    const proposedRow = rows.find((row) => row.id === PROPOSED_PLAN_NATIVE_ITEM_ID);
    expect(proposedRow?.kind).toBe("proposed_plan");
    if (proposedRow?.kind === "proposed_plan") {
      expect(proposedRow.nativeContinuation).toBe(true);
      expect(proposedRow.decisionState).toBe("approved");
      expect(proposedRow.decisionVersion).toBe(2);
      expect(proposedRow.nativeResolutionState).toBe("pending_link");
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

  it("renders a thought (reasoning) item's row", () => {
    const transcript = reduceEvents(
      [...CANNED_SESSION_ENVELOPES, THOUGHT_ITEM_ENVELOPE],
      SESSION_ID,
    );
    const rows = buildLiveTranscriptRows(transcript);
    const thoughtRow = rows.find((row) => row.id === THOUGHT_ITEM_ID);
    expect(thoughtRow?.kind).toBe("thought");
    if (thoughtRow?.kind === "thought") {
      expect(thoughtRow.text).toBe("Consider the edge cases first.");
      expect(thoughtRow.isStreaming).toBe(false);
    }
  });

  it("skips an unknown transcript item — no row for it, and it doesn't blow up the rest of the transcript", () => {
    const transcript = reduceEvents(
      [...CANNED_SESSION_ENVELOPES, UNKNOWN_ITEM_ENVELOPE],
      SESSION_ID,
    );
    // The reducer does record the item (for diagnostics) — confirms this is
    // actually exercising the "unknown" path, not a fixture no-op.
    expect(transcript.itemsById[UNKNOWN_ITEM_ID]?.kind).toBe("unknown");

    const rows = buildLiveTranscriptRows(transcript);
    expect(rows.some((row) => row.id === UNKNOWN_ITEM_ID)).toBe(false);
    // The known rows from the canned turn are still present, in order.
    expect(rows.map((row) => row.id)).toEqual([
      USER_MESSAGE_ITEM_ID,
      ASSISTANT_ITEM_ID,
      TOOL_CALL_ITEM_ID,
    ]);
  });
});
