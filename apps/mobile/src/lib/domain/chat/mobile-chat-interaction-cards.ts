import type {
  InteractionDecision,
  McpElicitationField,
  McpElicitationSubmittedField,
  PermissionInteractionOption,
  UserInputQuestion,
  UserInputSubmittedAnswer,
} from "@anyharness/sdk";

/**
 * Group E3 — pure view-model helpers for the three inline interaction
 * cards (permission / user_input / mcp_elicitation). Ported from the web
 * client's card components — `ApprovalCard.tsx`, `UserInputCard.tsx`,
 * `McpElicitationCard.tsx` (all under
 * `apps/packages/product-client/src/components/workspace/chat/input/`) —
 * since those pure derivations live inline in React components there and
 * can't be imported into React Native. The logic (fallback options,
 * destructive-kind detection, the synthetic "None of the above" row, MCP
 * field validation) is copied verbatim and re-verified here with its own
 * tests, not reinvented.
 */

// ---------------------------------------------------------------------------
// Permission card (mirrors ApprovalCard.tsx)
// ---------------------------------------------------------------------------

export interface PermissionCardOption {
  /** Stable React key. */
  key: string;
  label: string;
  destructive: boolean;
  /** Which `ResolveInteractionRequest` outcome this option resolves via. */
  resolve: "selected" | "decision";
  /** Set when `resolve === "selected"`. */
  optionId?: string;
  /** Set when `resolve === "decision"`. */
  decision?: InteractionDecision;
}

/**
 * The harness-provided options when present (resolved via
 * `{outcome:"selected", optionId}`); otherwise the fallback Allow/Deny pair
 * (resolved via `{outcome:"decision", decision}`) — matches
 * `ApprovalCard`'s `useMemo` exactly, including which resolve path each
 * branch uses (web's fallback calls `onAllow`/`onDeny`, which
 * `useChatPermissionActions`/`useSessionInteractionResolutionActions.resolvePermission`
 * wire to the `decision` outcome, not `selected` with a synthetic option id).
 * Takes the raw `PendingApproval.options` array directly (not the whole
 * interaction) — that's all this derivation needs.
 */
export function permissionCardOptions(
  options: readonly PermissionInteractionOption[],
): PermissionCardOption[] {
  if (options.length > 0) {
    return options.map((option) => ({
      key: option.optionId,
      label: option.label,
      destructive: isDestructivePermissionOptionKind(option.kind),
      resolve: "selected",
      optionId: option.optionId,
      decision: undefined,
    }));
  }
  return [
    { key: "allow", label: "Allow", destructive: false, resolve: "decision", optionId: undefined, decision: "allow" },
    { key: "deny", label: "Deny", destructive: true, resolve: "decision", optionId: undefined, decision: "deny" },
  ];
}

/** Mirrors `ApprovalCard.tsx`'s `isDestructiveActionKind`. */
export function isDestructivePermissionOptionKind(kind: string | null | undefined): boolean {
  if (!kind) return false;
  return kind.startsWith("reject") || kind.startsWith("deny") || kind.startsWith("cancel");
}

// ---------------------------------------------------------------------------
// User input card (mirrors UserInputCard.tsx)
// ---------------------------------------------------------------------------

export const OTHER_OPTION_LABEL = "None of the above";
export const OTHER_OPTION_DESCRIPTION = "Write a custom answer";

export interface UserInputOptionRow {
  label: string;
  description?: string;
}

/** The agent-provided options plus the synthetic "None of the above" row
 * when `question.isOther` — mirrors `optionsForQuestion`. */
export function userInputQuestionOptions(question: UserInputQuestion): UserInputOptionRow[] {
  return [
    ...(question.options ?? []),
    ...(question.isOther
      ? [{ label: OTHER_OPTION_LABEL, description: OTHER_OPTION_DESCRIPTION }]
      : []),
  ];
}

/** Whether the free-text field should be shown/submitted for the current
 * draft selection — mirrors `allowsDraftText`. */
export function userInputAllowsDraftText(
  question: UserInputQuestion,
  selectedOptionLabel: string | null,
): boolean {
  const options = userInputQuestionOptions(question);
  if (options.length === 0) {
    return true;
  }
  return question.isOther && selectedOptionLabel === OTHER_OPTION_LABEL;
}

export interface UserInputDraft {
  selectedOptionLabel: string | null;
  text: string;
}

/** Mirrors `buildSubmittedAnswer`. */
export function buildUserInputAnswer(
  question: UserInputQuestion,
  draft: UserInputDraft,
): UserInputSubmittedAnswer {
  const text = userInputAllowsDraftText(question, draft.selectedOptionLabel)
    ? draft.text.trim()
    : "";
  return {
    questionId: question.questionId,
    selectedOptionLabel: draft.selectedOptionLabel ?? undefined,
    text: text.length > 0 ? text : undefined,
  };
}

// ---------------------------------------------------------------------------
// MCP elicitation card (mirrors McpElicitationCard.tsx)
// ---------------------------------------------------------------------------

export type McpDraftValue = string | boolean | string[];
export type McpDrafts = Partial<Record<string, McpDraftValue>>;

/** Mirrors `initialDrafts`. */
export function initialMcpElicitationDrafts(fields: McpElicitationField[]): McpDrafts {
  const drafts: McpDrafts = {};
  for (const field of fields) {
    if (field.fieldType === "boolean") {
      if (field.required) drafts[field.fieldId] = false;
    } else if (field.fieldType === "multi_select") {
      drafts[field.fieldId] = [];
    } else {
      drafts[field.fieldId] = "";
    }
  }
  return drafts;
}

/** Mirrors `buildSubmittedFields` — validates + converts the draft record
 * into the wire `McpElicitationSubmittedField[]`, or returns a
 * human-readable error string on the first validation failure. */
export function buildMcpElicitationSubmittedFields(
  fields: McpElicitationField[],
  drafts: McpDrafts,
): McpElicitationSubmittedField[] | string {
  const submitted: McpElicitationSubmittedField[] = [];
  for (const field of fields) {
    const value = drafts[field.fieldId];
    if (field.fieldType === "boolean") {
      if (typeof value !== "boolean") {
        if (field.required) return `${field.label} is required.`;
        continue;
      }
      submitted.push({ fieldId: field.fieldId, value: { type: "boolean", value } });
      continue;
    }

    if (field.fieldType === "multi_select") {
      const optionIds = Array.isArray(value) ? value : [];
      if (field.required && optionIds.length === 0) {
        return `${field.label} is required.`;
      }
      if (field.minItems != null && optionIds.length < field.minItems) {
        return `${field.label} needs at least ${field.minItems} option${field.minItems === 1 ? "" : "s"}.`;
      }
      if (field.maxItems != null && optionIds.length > field.maxItems) {
        return `${field.label} allows at most ${field.maxItems} option${field.maxItems === 1 ? "" : "s"}.`;
      }
      if (optionIds.length > 0) {
        submitted.push({
          fieldId: field.fieldId,
          value: { type: "option_array", option_ids: optionIds },
        });
      }
      continue;
    }

    const textValue = typeof value === "string" ? value.trim() : "";
    if (!textValue) {
      if (field.required) return `${field.label} is required.`;
      continue;
    }

    if (field.fieldType === "single_select") {
      submitted.push({ fieldId: field.fieldId, value: { type: "option", option_id: textValue } });
    } else if (field.fieldType === "number") {
      const numberValue = Number(textValue);
      if (!Number.isFinite(numberValue)) {
        return `${field.label} must be a valid number.`;
      }
      if (field.integer && !Number.isSafeInteger(numberValue)) {
        return `${field.label} must be a safe integer.`;
      }
      submitted.push({
        fieldId: field.fieldId,
        value: field.integer ? { type: "integer", value: numberValue } : { type: "number", value: numberValue },
      });
    } else {
      submitted.push({ fieldId: field.fieldId, value: { type: "string", value: textValue } });
    }
  }
  return submitted;
}
