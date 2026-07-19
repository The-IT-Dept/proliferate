import type { SessionEventEnvelope } from "@anyharness/sdk";

/**
 * Canned `SessionEventEnvelope[]` fixtures shared by the stream-state reducer
 * tests and the transcript view-model tests (Group E1). Shaped directly off
 * the generated OpenAPI schemas in `anyharness/sdk/src/generated/openapi.ts`
 * (`SessionEventEnvelope`, `TranscriptItemPayload`, `TranscriptItemDeltaPayload`,
 * `InteractionRequestedEvent`, `InteractionResolvedEvent`) — not invented
 * shapes. Field names are camelCase to match the SDK's normalized types
 * (the wire format's snake_case is handled elsewhere, before these types
 * exist).
 *
 * One realistic turn: a user message, a streamed assistant reply, a
 * `Bash` tool call that requires permission (requested then approved), and
 * a turn end. `SESSION_ID` is used consistently so the reducer's
 * session-identity guard has something to check against.
 */
export const SESSION_ID = "session-1";
export const TURN_ID = "turn-1";

export const USER_MESSAGE_ITEM_ID = "item-user-1";
export const ASSISTANT_ITEM_ID = "item-asst-1";
export const TOOL_CALL_ITEM_ID = "item-tool-1";
export const PERMISSION_REQUEST_ID = "req-permission-1";
export const USER_INPUT_REQUEST_ID = "req-user-input-1";

function envelope(
  seq: number,
  event: SessionEventEnvelope["event"],
  overrides?: Partial<Pick<SessionEventEnvelope, "turnId" | "itemId" | "timestamp">>,
): SessionEventEnvelope {
  return {
    sessionId: SESSION_ID,
    seq,
    timestamp: overrides?.timestamp ?? `2026-07-19T00:00:${String(seq).padStart(2, "0")}Z`,
    turnId: overrides?.turnId ?? null,
    itemId: overrides?.itemId ?? null,
    event,
  };
}

/**
 * The full, in-order canned session: session start through turn end,
 * including a permission interaction that gets requested and then approved.
 */
export const CANNED_SESSION_ENVELOPES: SessionEventEnvelope[] = [
  envelope(1, { type: "session_started", nativeSessionId: "native-1", sourceAgentKind: "claude" }),
  envelope(2, { type: "turn_started" }, { turnId: TURN_ID }),
  envelope(
    3,
    {
      type: "item_started",
      item: {
        kind: "user_message",
        status: "completed",
        sourceAgentKind: "claude",
        contentParts: [{ type: "text", text: "Fix the failing test" }],
      },
    },
    { turnId: TURN_ID, itemId: USER_MESSAGE_ITEM_ID },
  ),
  envelope(
    4,
    {
      type: "item_started",
      item: {
        kind: "assistant_message",
        status: "in_progress",
        sourceAgentKind: "claude",
        contentParts: [],
      },
    },
    { turnId: TURN_ID, itemId: ASSISTANT_ITEM_ID },
  ),
  envelope(
    5,
    { type: "item_delta", delta: { appendText: "Sure, let " } },
    { turnId: TURN_ID, itemId: ASSISTANT_ITEM_ID },
  ),
  envelope(
    6,
    { type: "item_delta", delta: { appendText: "me look." } },
    { turnId: TURN_ID, itemId: ASSISTANT_ITEM_ID },
  ),
  envelope(
    7,
    {
      type: "item_completed",
      item: {
        kind: "assistant_message",
        status: "completed",
        sourceAgentKind: "claude",
        contentParts: [{ type: "text", text: "Sure, let me look." }],
      },
    },
    { turnId: TURN_ID, itemId: ASSISTANT_ITEM_ID },
  ),
  envelope(
    8,
    {
      type: "item_started",
      item: {
        kind: "tool_invocation",
        status: "in_progress",
        sourceAgentKind: "claude",
        nativeToolName: "Bash",
        toolCallId: "tool-1",
        contentParts: [
          { type: "tool_call", toolCallId: "tool-1", title: "Run tests", toolKind: "execute" },
        ],
      },
    },
    { turnId: TURN_ID, itemId: TOOL_CALL_ITEM_ID },
  ),
  envelope(
    9,
    {
      type: "interaction_requested",
      requestId: PERMISSION_REQUEST_ID,
      kind: "permission",
      title: "Allow running tests?",
      description: "npm test",
      source: { toolCallId: "tool-1", toolKind: "execute" },
      payload: {
        type: "permission",
        options: [
          { optionId: "allow_once", label: "Allow", kind: "allow_once" },
          { optionId: "reject_once", label: "Deny", kind: "reject_once" },
        ],
      },
    },
    { turnId: TURN_ID },
  ),
  envelope(
    10,
    {
      type: "interaction_resolved",
      requestId: PERMISSION_REQUEST_ID,
      kind: "permission",
      outcome: { outcome: "selected", optionId: "allow_once" },
    },
    { turnId: TURN_ID },
  ),
  envelope(
    11,
    {
      type: "item_completed",
      item: {
        kind: "tool_invocation",
        status: "completed",
        sourceAgentKind: "claude",
        nativeToolName: "Bash",
        toolCallId: "tool-1",
        contentParts: [
          { type: "tool_call", toolCallId: "tool-1", title: "Run tests", toolKind: "execute" },
          {
            type: "terminal_output",
            terminalId: "term-1",
            event: "output",
            data: "5 passed",
          },
        ],
      },
    },
    { turnId: TURN_ID, itemId: TOOL_CALL_ITEM_ID },
  ),
  envelope(12, { type: "turn_ended", stopReason: "end_turn" }, { turnId: TURN_ID }),
];

export const PLAN_ITEM_ID = "item-plan-1";
export const PROPOSED_PLAN_ITEM_ID = "item-proposed-plan-1";
export const ERROR_ITEM_ID = "seq-14";

/** A `plan` item (checklist-style, distinct from `proposed_plan`). */
export const PLAN_ITEM_ENVELOPE: SessionEventEnvelope = envelope(
  14,
  {
    type: "item_started",
    item: {
      kind: "plan",
      status: "in_progress",
      sourceAgentKind: "claude",
      contentParts: [
        {
          type: "plan",
          entries: [
            { content: "Reproduce the failure", status: "completed" },
            { content: "Write the fix", status: "in_progress" },
            { content: "Add a regression test", status: "pending" },
          ],
        },
      ],
    },
  },
  { turnId: TURN_ID, itemId: PLAN_ITEM_ID },
);

/** A `proposed_plan` item awaiting the user's decision. */
export const PROPOSED_PLAN_ITEM_ENVELOPE: SessionEventEnvelope = envelope(
  15,
  {
    type: "item_started",
    item: {
      kind: "proposed_plan",
      status: "completed",
      sourceAgentKind: "claude",
      contentParts: [
        {
          type: "proposed_plan",
          planId: "plan-1",
          title: "Ship the fix",
          bodyMarkdown: "1. Patch the parser\n2. Add a test",
          snapshotHash: "hash-1",
          sourceSessionId: SESSION_ID,
          sourceKind: "structured_plan",
        },
      ],
    },
  },
  { turnId: TURN_ID, itemId: PROPOSED_PLAN_ITEM_ID },
);

/** A top-level `error` session event (distinct from an `error_item` transcript
 * item payload) — the reducer turns this into an `ErrorItem` directly. */
export const ERROR_EVENT_ENVELOPE: SessionEventEnvelope = envelope(16, {
  type: "error",
  message: "The sandbox lost its connection to the runtime.",
  code: "RUNTIME_DISCONNECTED",
});

/** A standalone `user_input` interaction — not tied to any tool call, so the
 * permission-only selector must ignore it while the primary selector picks
 * it up. Appended as seq 13 to the canned session above. */
export const USER_INPUT_REQUESTED_ENVELOPE: SessionEventEnvelope = envelope(
  13,
  {
    type: "interaction_requested",
    requestId: USER_INPUT_REQUEST_ID,
    kind: "user_input",
    title: "What should the new endpoint be called?",
    source: {},
    payload: {
      type: "user_input",
      questions: [
        {
          questionId: "q1",
          question: "Endpoint name?",
          header: "Naming",
          isOther: false,
          isSecret: false,
        },
      ],
    },
  },
  { turnId: TURN_ID },
);

export const THOUGHT_ITEM_ID = "item-thought-1";

/** A `reasoning` item — the wire kind that reduces to a `thought`
 * `TranscriptItem`. */
export const THOUGHT_ITEM_ENVELOPE: SessionEventEnvelope = envelope(
  17,
  {
    type: "item_started",
    item: {
      kind: "reasoning",
      status: "completed",
      sourceAgentKind: "claude",
      contentParts: [
        { type: "reasoning", text: "Consider the edge cases first.", visibility: "private" },
      ],
    },
  },
  { turnId: TURN_ID, itemId: THOUGHT_ITEM_ID },
);

export const MCP_ELICITATION_URL_REQUEST_ID = "req-mcp-url-1";
export const MCP_ELICITATION_FORM_REQUEST_ID = "req-mcp-form-1";

/** A standalone `mcp_elicitation` interaction in url mode (`requiresReveal`
 * — the URL is hidden behind a "Reveal URL" action, not shown directly).
 * Appended as seq 19 to the canned session above. */
export const MCP_ELICITATION_URL_REQUESTED_ENVELOPE: SessionEventEnvelope = envelope(
  19,
  {
    type: "interaction_requested",
    requestId: MCP_ELICITATION_URL_REQUEST_ID,
    kind: "mcp_elicitation",
    title: "Authorize with Linear",
    source: {},
    payload: {
      type: "mcp_elicitation",
      serverName: "linear",
      mode: {
        mode: "url",
        message: "Open this link to authorize.",
        requiresReveal: true,
        urlDisplay: "https://linear.app/oauth/authorize",
      },
    },
  },
  { turnId: TURN_ID },
);

/** A standalone `mcp_elicitation` interaction in form mode — one required
 * text field. Appended as seq 20 to the canned session above. */
export const MCP_ELICITATION_FORM_REQUESTED_ENVELOPE: SessionEventEnvelope = envelope(
  20,
  {
    type: "interaction_requested",
    requestId: MCP_ELICITATION_FORM_REQUEST_ID,
    kind: "mcp_elicitation",
    title: "Create a Linear issue",
    source: {},
    payload: {
      type: "mcp_elicitation",
      serverName: "linear",
      mode: {
        mode: "form",
        message: "Fill in the issue details.",
        fields: [
          { fieldId: "title", fieldType: "text", label: "Title", required: true },
        ],
      },
    },
  },
  { turnId: TURN_ID },
);

export const UNKNOWN_ITEM_ID = "item-unknown-1";

/** An event type the reducer doesn't recognize — falls into the `default`
 * case of the top-level event switch, which records an `unknown`
 * `TranscriptItem` (`recordUnknown` in `reducer/transcript.ts`) instead of
 * throwing or dropping it silently. Cast through `unknown` the same way the
 * SDK's own reducer tests construct off-schema envelopes, since
 * `SessionEventEnvelope["event"]` is a closed, generated union that doesn't
 * (and shouldn't) include a made-up type. */
export const UNKNOWN_ITEM_ENVELOPE: SessionEventEnvelope = envelope(
  18,
  { type: "some_future_event_type_the_client_does_not_know_about" } as unknown as SessionEventEnvelope["event"],
  { turnId: TURN_ID, itemId: UNKNOWN_ITEM_ID },
);
