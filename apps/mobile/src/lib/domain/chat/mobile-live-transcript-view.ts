import type {
  AssistantProseItem,
  ContentPart,
  ErrorItem,
  PendingInteraction,
  PlanEntry,
  PlanItem,
  ProposedPlanItem,
  ThoughtItem,
  ToolCallItem,
  TranscriptItem,
  TranscriptState,
  UserMessageItem,
} from "@anyharness/sdk";
import { selectPrimaryPendingInteraction } from "@anyharness/sdk";
import { describeToolCallDisplay } from "@proliferate/product-domain/chats/tools/tool-call-display";

/**
 * Group E1 — the live transcript's pure `TranscriptItem`/`ContentPart` ->
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
 * Interaction handling is explicitly NOT built here (E3's job). When there's
 * a pending interaction that isn't already visible as a tool call's
 * `approvalState` badge (i.e. a `user_input`/`mcp_elicitation` request, or a
 * permission request with no associated tool call), this module appends a
 * single, non-interactive `pending_interaction` placeholder row — no
 * buttons, no card, just "there's something waiting on you". E3 replaces
 * that placeholder with the real permission/user_input/mcp_elicitation
 * cards.
 */

export type TranscriptRowViewModel =
  | UserMessageRow
  | AssistantProseRow
  | ThoughtRow
  | ToolCallRow
  | PlanRow
  | ProposedPlanRow
  | ErrorRow
  | PendingInteractionPlaceholderRow;

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
  title: string;
  bodyMarkdown: string;
  decisionState: "pending" | "approved" | "rejected" | "superseded";
}

export interface ErrorRow extends RowBase {
  kind: "error";
  message: string;
  code: string | null;
}

/** Synthetic — not a `TranscriptItem` kind. See module doc: minimal,
 * non-interactive; E3 replaces this with the real interaction cards. */
export interface PendingInteractionPlaceholderRow {
  id: string;
  turnId: string | null;
  kind: "pending_interaction";
  interactionKind: PendingInteraction["kind"];
  title: string;
  description: string | null;
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

  // One placeholder for the primary pending interaction, full stop — not
  // special-cased per interaction kind. The tool_call row still carries
  // `approvalState` as data (useful, and truthful), but this module doesn't
  // invent unverified badge copy ("Pending approval" etc. don't appear
  // anywhere in the web client's tool row) to justify skipping the
  // placeholder for a permission tied to a tool call. One predictable seam
  // for E3 to replace with the real cards, instead of two.
  const pending = selectPrimaryPendingInteraction(transcript);
  if (pending) {
    rows.push(pendingInteractionPlaceholderRow(pending));
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
    title: item.plan.title || "Plan",
    bodyMarkdown: item.plan.bodyMarkdown,
    decisionState: item.decision?.decisionState ?? "pending",
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

function pendingInteractionPlaceholderRow(
  interaction: PendingInteraction,
): PendingInteractionPlaceholderRow {
  return {
    id: `pending-interaction:${interaction.requestId}`,
    turnId: null,
    kind: "pending_interaction",
    interactionKind: interaction.kind,
    title: interaction.title,
    description: interaction.description,
  };
}
