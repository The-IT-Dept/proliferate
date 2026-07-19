import type {
  AssistantProseItem,
  ContentPart,
  ErrorItem,
  McpElicitationInteractionPayload,
  PendingInteraction,
  PermissionInteractionOption,
  PlanEntry,
  PlanItem,
  ProposedPlanItem,
  ThoughtItem,
  ToolCallItem,
  TranscriptItem,
  TranscriptState,
  UserInputQuestion,
  UserMessageItem,
} from "@anyharness/sdk";
import { selectPrimaryPendingInteraction } from "@anyharness/sdk";
import { describeToolCallDisplay } from "@proliferate/product-domain/chats/tools/tool-call-display";

/**
 * Group E1/E3 — the live transcript's pure `TranscriptItem`/`ContentPart` ->
 * view-model mapping. This is the render-agnostic half of "render the
 * transcript": `MobileLiveTranscriptRow` (the RN component) turns each of
 * these into JSX; this module has no RN/React import so it's testable in
 * plain vitest.
 *
 * Renders every `TranscriptItem` kind the plan calls out (`user_message`,
 * `assistant_prose`, `thought`, `tool_call`, `plan`, `proposed_plan`,
 * `error`) plus every `ContentPart` variant inside a tool call's
 * `contentParts` (as a one-line, non-interactive summary — glass is
 * control-layer only, so these render as opaque body text). `unknown`
 * transcript items (unrecognized event types the reducer couldn't classify)
 * are intentionally *not* rendered — there is nothing verbatim to show for
 * them and the reducer already tracks them separately for diagnostics
 * (`TranscriptState.unknownEvents`).
 *
 * Tool titles reuse `describeToolCallDisplay` from
 * `@proliferate/product-domain` — the same label logic the web client's
 * transcript rows use — so tool names aren't reinvented here.
 *
 * A `proposed_plan` decision (approve/reject a proposed plan) is NOT
 * modeled here as an interaction card, on purpose: the reducer
 * (`anyharness/sdk/src/reducer/transcript.ts`, `isPlanOwnedInteraction`)
 * excludes any permission interaction with a `linkedPlanId` (or tied to a
 * tool call backing a still-pending `proposed_plan` item) from
 * `selectPrimaryPendingInteraction`/`selectPendingApprovalInteraction` —
 * plan decisions are the `proposed_plan` transcript item's own concern
 * (`ProposedPlanRow` below, via its `decisionState`), not a generic
 * interaction card. Nothing here needs to special-case it.
 *
 * Row 20 — acting on that decision (Approve/Reject) is a *different* wire
 * call than the generic interaction cards below: `client.plans.approve`/
 * `.reject` (workspace-scoped `/plans/{planId}/approve|reject`, carrying
 * `expectedDecisionVersion`), never `client.sessions.resolveInteraction`.
 * `ProposedPlanRow` carries `planId`/`decisionVersion`/
 * `nativeResolutionState`/`errorMessage`/`nativeContinuation` — everything
 * `mobile-proposed-plan-decision.ts`'s pure derivations and the
 * `useMobilePlanDecisionActions` hook need to render and wire up the
 * Approve/Reject footer, mirroring web's `ProposedPlanCard.tsx` +
 * `use-proposed-plan-actions.ts`. "Run here"/"New session" (carrying out an
 * approved plan) are a separate, materially larger subsystem on web — mode
 * switching, prompt-attachment building, and (for "New session") a whole
 * workspace/session-picker dialog flow — and are not built here; see that
 * hook's module doc for specifics.
 *
 * E3 — when there's a pending interaction that isn't already visible as a
 * tool call's `approvalState` badge (a `permission` request not tied to a
 * tool call, or any `user_input`/`mcp_elicitation` request), this module
 * appends one real interaction-card row for it: `permission_interaction`,
 * `user_input_interaction`, or `mcp_elicitation_interaction` (one at a
 * time, per `selectPrimaryPendingInteraction` — mirrors the web client's
 * single composer-dock interaction slot, `useComposerDockSlots`). Each row
 * carries the interaction's own `requestId` directly (not just encoded in
 * `id`) so a push deep-link (`proliferate://workspace/{id}?interaction=
 * {requestId}`) can find and focus the exact row.
 */

export type TranscriptRowViewModel =
  | UserMessageRow
  | AssistantProseRow
  | ThoughtRow
  | ToolCallRow
  | PlanRow
  | ProposedPlanRow
  | ErrorRow
  | PermissionInteractionRow
  | UserInputInteractionRow
  | McpElicitationInteractionRow;

interface RowBase {
  id: string;
  turnId: string | null;
}

export interface UserMessageRow extends RowBase {
  kind: "user_message";
  text: string;
  isStreaming: boolean;
}

export interface AssistantProseRow extends RowBase {
  kind: "assistant_prose";
  text: string;
  isStreaming: boolean;
}

export interface ThoughtRow extends RowBase {
  kind: "thought";
  text: string;
  isStreaming: boolean;
}

export interface ToolCallRow extends RowBase {
  kind: "tool_call";
  title: string;
  hint: string | null;
  status: "in_progress" | "completed" | "failed";
  approvalState: ToolCallItem["approvalState"];
  summaryLines: string[];
}

export interface PlanRow extends RowBase {
  kind: "plan";
  entries: PlanEntry[];
}

export interface ProposedPlanRow extends RowBase {
  kind: "proposed_plan";
  /** `ProposedPlanContentPart.planId` — the path param for
   * `client.plans.approve`/`.reject`/`.get` (Row 20's decision actions). */
  planId: string;
  title: string;
  bodyMarkdown: string;
  decisionState: "pending" | "approved" | "rejected" | "superseded";
  /** Optimistic-concurrency token for `PlanDecisionRequest.
   * expectedDecisionVersion` — `null` until a `proposed_plan_decision`
   * content part has actually arrived (no decision content part yet means
   * nothing safe to send: see `resolveProposedPlanDecisionActions`). */
  decisionVersion: number | null;
  nativeResolutionState:
    | "none"
    | "pending_link"
    | "pending_resolution"
    | "finalized"
    | "failed"
    | null;
  errorMessage: string | null;
  /** `Boolean(item.plan.sourceToolCallId)` — mirrors web's
   * `ConnectedProposedPlanItem`'s `nativeContinuation` prop: whether this
   * plan came from a native (harness-side) tool call rather than a
   * structured mode switch, which gates the retry-Approve path. */
  nativeContinuation: boolean;
}

export interface ErrorRow extends RowBase {
  kind: "error";
  message: string;
  code: string | null;
}

/**
 * Synthetic — not a `TranscriptItem` kind. Card header is the fixed string
 * "Permission request" (rendered by the card component, not carried here);
 * `title` is the request *body* — matches web's `ApprovalCard`, whose
 * `ComposerAttachedPanel title="Permission request"` header is a constant
 * and whose `title` prop (the interaction's `PendingApproval.title`) is
 * the mono-snippet body instead.
 */
export interface PermissionInteractionRow {
  id: string;
  turnId: string | null;
  kind: "permission_interaction";
  requestId: string;
  title: string;
  options: PermissionInteractionOption[];
}

/** Synthetic — not a `TranscriptItem` kind. `title` is the card header
 * (matches web's `ConnectedUserInputCard`, `title={held.title}`); each
 * `UserInputQuestion` carries its own `header`/`question`/`options`. */
export interface UserInputInteractionRow {
  id: string;
  turnId: string | null;
  kind: "user_input_interaction";
  requestId: string;
  title: string;
  questions: UserInputQuestion[];
}

/** Synthetic — not a `TranscriptItem` kind. `title` is the card header
 * (matches web's `ConnectedMcpElicitationCard`); `payload.serverName` is
 * the card's trailing context, `payload.mode` selects url vs form body. */
export interface McpElicitationInteractionRow {
  id: string;
  turnId: string | null;
  kind: "mcp_elicitation_interaction";
  requestId: string;
  title: string;
  payload: McpElicitationInteractionPayload;
}

const MAX_PREVIEW_LENGTH = 2_000;

export function buildLiveTranscriptRows(
  transcript: TranscriptState,
): TranscriptRowViewModel[] {
  const rows: TranscriptRowViewModel[] = [];
  for (const turnId of transcript.turnOrder) {
    const turn = transcript.turnsById[turnId];
    if (!turn) {
      continue;
    }
    for (const itemId of turn.itemOrder) {
      const item = transcript.itemsById[itemId];
      if (!item) {
        continue;
      }
      const row = transcriptItemToRow(item);
      if (row) {
        rows.push(row);
      }
    }
  }

  // One interaction-card row for the primary pending interaction, full
  // stop — mirrors the web client's single composer-dock interaction slot
  // (`useComposerDockSlots`/`selectPrimaryPendingInteraction`), not
  // multiple simultaneous cards. The tool_call row still carries
  // `approvalState` as data (useful, and truthful) independent of this.
  const pending = selectPrimaryPendingInteraction(transcript);
  if (pending) {
    const pendingRow = pendingInteractionRow(pending);
    if (pendingRow) {
      rows.push(pendingRow);
    }
  }

  return rows;
}

function transcriptItemToRow(item: TranscriptItem): TranscriptRowViewModel | null {
  switch (item.kind) {
    case "user_message":
      return userMessageRow(item);
    case "assistant_prose":
      return assistantProseRow(item);
    case "thought":
      return thoughtRow(item);
    case "tool_call":
      return toolCallRow(item);
    case "plan":
      return planRow(item);
    case "proposed_plan":
      return proposedPlanRow(item);
    case "error":
      return errorRow(item);
    case "unknown":
      return null;
  }
}

function userMessageRow(item: UserMessageItem): UserMessageRow {
  return {
    id: item.itemId,
    turnId: item.turnId,
    kind: "user_message",
    text: item.text,
    isStreaming: item.isStreaming,
  };
}

function assistantProseRow(item: AssistantProseItem): AssistantProseRow {
  return {
    id: item.itemId,
    turnId: item.turnId,
    kind: "assistant_prose",
    text: item.text,
    isStreaming: item.isStreaming,
  };
}

function thoughtRow(item: ThoughtItem): ThoughtRow {
  return {
    id: item.itemId,
    turnId: item.turnId,
    kind: "thought",
    text: item.text,
    isStreaming: item.isStreaming,
  };
}

function toolCallRow(item: ToolCallItem): ToolCallRow {
  const toolName = item.title
    ?? item.nativeToolName
    ?? (item.toolKind !== "other" ? item.toolKind : "Tool call");
  const display = describeToolCallDisplay(item, toolName);
  return {
    id: item.itemId,
    turnId: item.turnId,
    kind: "tool_call",
    title: display.label,
    hint: display.hint ?? null,
    status: item.status,
    approvalState: item.approvalState,
    summaryLines: item.contentParts
      .map(summarizeContentPart)
      .filter((line): line is string => Boolean(line)),
  };
}

function planRow(item: PlanItem): PlanRow {
  return {
    id: item.itemId,
    turnId: item.turnId,
    kind: "plan",
    entries: item.entries,
  };
}

function proposedPlanRow(item: ProposedPlanItem): ProposedPlanRow {
  return {
    id: item.itemId,
    turnId: item.turnId,
    kind: "proposed_plan",
    planId: item.plan.planId,
    title: item.plan.title || "Plan",
    bodyMarkdown: item.plan.bodyMarkdown,
    decisionState: item.decision?.decisionState ?? "pending",
    decisionVersion: item.decision?.decisionVersion ?? null,
    nativeResolutionState: item.decision?.nativeResolutionState ?? null,
    errorMessage: item.decision?.errorMessage ?? null,
    nativeContinuation: Boolean(item.plan.sourceToolCallId),
  };
}

function errorRow(item: ErrorItem): ErrorRow {
  return {
    id: item.itemId,
    turnId: item.turnId,
    kind: "error",
    message: item.message,
    code: item.code,
  };
}

/**
 * One short, non-interactive line per `ContentPart` variant — covers the
 * full union (`text`/`reasoning` are surfaced on their own item kinds, not
 * repeated here as tool-call summary lines; `tool_call` identifies the item
 * itself, not a summary of it).
 */
function summarizeContentPart(part: ContentPart): string | null {
  switch (part.type) {
    case "text":
    case "reasoning":
    case "tool_call":
      return null;
    case "terminal_output":
      if (part.event === "exit") {
        return part.exitCode != null ? `Exited (${part.exitCode})` : "Exited";
      }
      return part.data ? previewText(part.data) : null;
    case "file_read":
      return `Read ${part.workspacePath ?? part.path}`;
    case "file_change":
      return fileChangeSummary(part);
    case "plan":
      return formatCount(part.entries.length, "plan step");
    case "proposed_plan":
      return `Plan: ${part.title}`;
    case "plan_reference":
      return `Plan reference: ${part.title}`;
    case "proposed_plan_decision":
      return `Plan ${part.decisionState}`;
    case "tool_input_text":
    case "tool_result_text":
      return previewText(part.text);
    case "image":
      return part.name ? `Image: ${part.name}` : "Image";
    case "resource":
      return part.name ? `Resource: ${part.name}` : "Resource";
    case "resource_link":
      return `Link: ${part.title ?? part.name}`;
    default:
      return null;
  }
}

function fileChangeSummary(
  part: Extract<ContentPart, { type: "file_change" }>,
): string {
  const path = part.newWorkspacePath ?? part.workspacePath ?? part.newPath ?? part.path;
  const verb = fileChangeVerb(part.operation);
  const delta = [
    part.additions ? `+${part.additions}` : null,
    part.deletions ? `-${part.deletions}` : null,
  ].filter((value): value is string => Boolean(value)).join(" ");
  return delta ? `${verb} ${path} (${delta})` : `${verb} ${path}`;
}

function fileChangeVerb(operation: string): string {
  switch (operation) {
    case "create":
      return "Created";
    case "delete":
      return "Deleted";
    case "move":
      return "Moved";
    case "edit":
    default:
      return "Edited";
  }
}

function formatCount(count: number, singular: string): string | null {
  if (count <= 0) {
    return null;
  }
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

/** Mirrors `previewText` in
 * `@proliferate/product-domain/src/chats/cloud/transcript-view-utils.ts`
 * (not itself a public subpath export) — same truncation threshold, kept in
 * sync deliberately rather than importing a private module path. */
function previewText(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.length <= MAX_PREVIEW_LENGTH
    ? trimmed
    : `${trimmed.slice(0, MAX_PREVIEW_LENGTH).trimEnd()}\n...`;
}

function pendingInteractionRow(
  interaction: PendingInteraction,
): PermissionInteractionRow | UserInputInteractionRow | McpElicitationInteractionRow | null {
  // Stable, requestId-derived id (unchanged prefix from E1) — this is what
  // a future push deep-link handler (`proliferate://workspace/{id}
  // ?interaction={requestId}`) resolves against to scroll/focus the row;
  // `requestId` is also carried as its own field so a handler doesn't need
  // to parse it back out of `id`.
  const id = `pending-interaction:${interaction.requestId}`;
  switch (interaction.kind) {
    case "permission":
      return {
        id,
        turnId: null,
        kind: "permission_interaction",
        requestId: interaction.requestId,
        title: interaction.title,
        options: interaction.options,
      };
    case "user_input":
      return {
        id,
        turnId: null,
        kind: "user_input_interaction",
        requestId: interaction.requestId,
        title: interaction.title,
        questions: interaction.questions,
      };
    case "mcp_elicitation":
      return {
        id,
        turnId: null,
        kind: "mcp_elicitation_interaction",
        requestId: interaction.requestId,
        title: interaction.title,
        payload: interaction.mcpElicitation,
      };
    default:
      // Fix D (E3 Minor, reviewer finding): `interaction.kind` is
      // exhaustively typed today, but an out-of-union kind used to fall
      // through this switch with no default and return `undefined` — that
      // got pushed straight into `rows` (unlike `transcriptItemToRow`
      // below, whose `| null` + `if (row)` call-site check already guards
      // this), and a row of `undefined` crashes `keyExtractor` downstream.
      // Mirrors the defensive default already in `MobileLiveTranscriptRow`
      // (the RN component) for the same reason.
      return null;
  }
}
