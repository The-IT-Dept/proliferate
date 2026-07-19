import type {
  InteractionDecision,
  McpElicitationSubmittedField,
  ResolveInteractionRequest,
  UserInputSubmittedAnswer,
} from "@anyharness/sdk";

/**
 * Group E3 — pure builders for `ResolveInteractionRequest`
 * (`anyharness/sdk/src/types/sessions.ts`), the payload every interaction
 * card sends through `useResolveSessionInteractionMutation`
 * (`@anyharness/sdk-react`). One builder per outcome variant in the real
 * generated union:
 *
 *   | { outcome: "selected"; optionId: string }
 *   | { outcome: "decision"; decision: InteractionDecision }
 *   | { outcome: "submitted"; answers: UserInputSubmittedAnswer[] }
 *   | { outcome: "accepted"; fields: McpElicitationSubmittedField[] }
 *   | { outcome: "declined" }
 *   | { outcome: "cancelled" }
 *   | { outcome: "dismissed" }
 *
 * `selected`/`submitted`/`accepted` carry a payload the caller assembles
 * from card state (a chosen harness option id, wizard answers, or MCP form
 * fields); the rest are bare outcome markers. Kept as standalone pure
 * functions (not inlined at the call site) so each one is independently
 * unit-tested against the real union shape rather than trusted by
 * inspection.
 *
 * `dismissed` has no current caller: neither the web client
 * (`use-session-interaction-resolution-actions.ts`) nor
 * `docs/design/mobile/design-system.md` §10 wire a "dismiss" affordance for
 * any interaction card — web's "Cancel" buttons (user_input wizard, MCP
 * elicitation) resolve via `cancelled`, not `dismissed`. Built anyway for
 * full-union coverage per the task's builder list; wire it up if/when a
 * card grows a real dismiss action.
 */

export function buildPermissionSelectedRequest(optionId: string): ResolveInteractionRequest {
  return { outcome: "selected", optionId };
}

export function buildPermissionDecisionRequest(
  decision: InteractionDecision,
): ResolveInteractionRequest {
  return { outcome: "decision", decision };
}

export function buildUserInputSubmittedRequest(
  answers: UserInputSubmittedAnswer[],
): ResolveInteractionRequest {
  return { outcome: "submitted", answers };
}

export function buildUserInputCancelledRequest(): ResolveInteractionRequest {
  return { outcome: "cancelled" };
}

export function buildMcpElicitationAcceptedRequest(
  fields: McpElicitationSubmittedField[],
): ResolveInteractionRequest {
  return { outcome: "accepted", fields };
}

export function buildMcpElicitationDeclinedRequest(): ResolveInteractionRequest {
  return { outcome: "declined" };
}

export function buildMcpElicitationCancelledRequest(): ResolveInteractionRequest {
  return { outcome: "cancelled" };
}

export function buildInteractionDismissedRequest(): ResolveInteractionRequest {
  return { outcome: "dismissed" };
}
