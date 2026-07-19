import type { ProposedPlanDecisionState, ProposedPlanNativeResolutionState } from "@anyharness/sdk";

/**
 * Row 20 (plan decisions) — pure derivations ported verbatim from web's
 * `ProposedPlanCard.tsx` (`apps/packages/product-ui/src/chat/transcript/
 * ProposedPlanCard.tsx`): the status-chip label and the footer's
 * Approve/Reject visibility gates (`canDecide`/`canRetryNativeApproval`).
 * "Run here"/"New session" (carry-out) are a separate, larger subsystem —
 * see `mobile-live-transcript-view.ts`'s `ProposedPlanRow` doc comment —
 * and are out of scope here; this module only covers the decision itself.
 *
 * A `proposed_plan` transcript item's decision starts out `null` (no
 * `proposed_plan_decision` content part has arrived yet) — mapped to
 * `decisionState: "pending"` with `decisionVersion: null` by
 * `mobile-live-transcript-view.ts`. `decisionVersion` is required to act:
 * approving/rejecting sends `expectedDecisionVersion` for optimistic-
 * concurrency (`PlanDecisionRequest`), so there is nothing safe to send
 * until a real version has been observed.
 */

export interface ProposedPlanDecisionStatus {
  label: string;
  tone: "warning" | "neutral" | "muted" | "destructive";
}

/** Fix 1 (reviewer finding) — mirrors web's `ProposedPlanCard.tsx` chip
 * gate: `decisionState && decisionState !== "streaming" ? resolveDecisionStatus(...)
 * : null`, i.e. no chip while the `ExitPlanMode` tool call's plan body is
 * still streaming. Mobile has no distinct "streaming" `decisionState` (see
 * this module's doc comment) — the same pre-decision window is exactly
 * `decisionVersion === null`, so that's the gate here instead. Call this
 * *before* `resolveProposedPlanDecisionStatus` and skip rendering the chip
 * entirely when it returns `false`, rather than baking the check into that
 * function — keeps `resolveProposedPlanDecisionStatus`'s signature a
 * verbatim mirror of web's `resolveDecisionStatus`, which never sees the
 * streaming case at all (the caller filters it out first). */
export function shouldShowProposedPlanDecisionChip(decisionVersion: number | null): boolean {
  return decisionVersion !== null;
}

/** Mirrors `resolveDecisionStatus` — fixed Title-case vocabulary, with a
 * native-resolution failure overriding the chip regardless of
 * `decisionState` (a failed native continuation retry still shows "Failed",
 * not "Approved"). Only meaningful once `shouldShowProposedPlanDecisionChip`
 * is true — see that function's doc comment. */
export function resolveProposedPlanDecisionStatus(input: {
  decisionState: ProposedPlanDecisionState;
  nativeResolutionState: ProposedPlanNativeResolutionState | null;
}): ProposedPlanDecisionStatus {
  if (input.nativeResolutionState === "failed") {
    return { label: "Failed", tone: "destructive" };
  }
  switch (input.decisionState) {
    case "approved":
      return { label: "Approved", tone: "neutral" };
    case "rejected":
      return { label: "Rejected", tone: "muted" };
    case "superseded":
      return { label: "Superseded", tone: "muted" };
    case "pending":
    default:
      return { label: "Awaiting approval", tone: "warning" };
  }
}

export interface ProposedPlanDecisionActions {
  canApprove: boolean;
  canReject: boolean;
}

/** Mirrors `canDecide`/`canRetryNativeApproval` — Approve is available
 * either for a fresh pending decision or to retry a native continuation
 * that approved but is still waiting to link up
 * (`nativeResolutionState === "pending_link"`); Reject is only ever
 * available for a fresh pending decision. */
export function resolveProposedPlanDecisionActions(input: {
  decisionState: ProposedPlanDecisionState;
  decisionVersion: number | null;
  nativeResolutionState: ProposedPlanNativeResolutionState | null;
  nativeContinuation: boolean;
}): ProposedPlanDecisionActions {
  const canDecide = input.decisionState === "pending" && input.decisionVersion !== null;
  const canRetryNativeApproval =
    input.nativeContinuation
    && input.decisionState === "approved"
    && input.nativeResolutionState === "pending_link"
    && input.decisionVersion !== null;
  return {
    canApprove: canDecide || canRetryNativeApproval,
    canReject: canDecide,
  };
}

/** Mirrors the failure line under the chip — the chip itself never carries
 * the raw error string (fixed vocabulary only); the message renders
 * separately, and only once the native resolution has actually failed. */
export function resolveProposedPlanFailureMessage(input: {
  nativeResolutionState: ProposedPlanNativeResolutionState | null;
  errorMessage: string | null;
}): string | null {
  if (input.nativeResolutionState !== "failed") {
    return null;
  }
  const trimmed = input.errorMessage?.trim();
  return trimmed ? trimmed : null;
}
