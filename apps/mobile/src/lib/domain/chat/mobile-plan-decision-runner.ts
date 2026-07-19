import { AnyHarnessError } from "@anyharness/sdk";

import { buildPlanDecisionRequest } from "./mobile-plan-decision-resolve";

/**
 * Row 20 (reviewer follow-up, Fix 4) — the framework-free core of
 * `useMobilePlanDecisionActions` (`use-mobile-plan-decision-actions.ts`),
 * pulled out for the same reason Row 29 pulled `runMobilePublishWorkflow`
 * out of `use-mobile-publish-workflow.ts`: the hook itself calls real
 * `useState`/`useRef` from `react`, and this app has no RN/DOM test harness
 * (`vitest.config.ts` runs plain "node" — no `@testing-library/react`, no
 * `react-test-renderer`, no jsdom in `apps/mobile`'s own dependencies), so a
 * hook that touches real React hook state can't be driven directly in a
 * test. Every behavior the reviewer flagged as untested — the mutate-call
 * shape, the friendly 409 toast (Fix 3), and the double-tap guard (Fix 2)
 * — lives in `runPlanDecision` below instead, as plain async logic the
 * hook just wires up. This also replaces the inline `resolvePlanDecisionErrorMessage`/
 * `isPlanDecisionConflict` Fix 3 added directly to the hook — same logic,
 * now here and unit-tested.
 */

export type PlanDecisionActionKind = "approve" | "reject";

/** Mirrors web's `showToast("Plan decision was updated. Refreshed plan
 * state.")` on a `PLAN_DECISION_VERSION_CONFLICT`/`PLAN_DECISION_TERMINAL`
 * 409 (`use-proposed-plan-actions.ts`'s `runPlanDecisionMutation`) —
 * verbatim copy. Web additionally refetches the plan into a query cache
 * mobile doesn't have; here the live transcript stream is the only source
 * of truth, so this is just the toast text, no refetch. */
export const PLAN_DECISION_CONFLICT_MESSAGE = "Plan decision was updated. Refreshed plan state.";

/**
 * The plan currently "in flight" for the double-tap guard —
 * `runPlanDecision` reads/writes `planId` directly rather than taking a
 * boolean, so a second call for the *same* plan (even one fired
 * synchronously before the caller re-renders to disable the button) is a
 * silent no-op, while a decision for a *different* plan is unaffected. The
 * hook owns one of these per hook instance (a single `useRef`); tests can
 * construct a plain `{ planId: null }` object directly, no React required.
 */
export interface PlanDecisionInFlightTracker {
  planId: string | null;
}

export interface PlanDecisionState {
  planId: string;
  action: PlanDecisionActionKind;
}

export interface RunPlanDecisionInput {
  action: PlanDecisionActionKind;
  planId: string;
  decisionVersion: number;
  /** `approveMutation.mutateAsync`/`rejectMutation.mutateAsync`
   * (`@anyharness/sdk-react`'s `useApprovePlanMutation`/
   * `useRejectPlanMutation`) — the workspace id isn't part of this call's
   * variables; those hooks resolve it from `useAnyHarnessWorkspaceContext`
   * internally (`anyharness/sdk-react/src/hooks/plans.ts`). */
  mutate: (input: { planId: string; expectedDecisionVersion: number }) => Promise<unknown>;
  /** Generic fallback message when `mutate` rejects with something other
   * than a recognized version-conflict error and isn't an `Error` itself. */
  failureMessage: string;
  /** Pre-flight guard result (unclaimed workspace / runtime not ready) —
   * `resolveMobileInteractionBlockReason`'s return value, computed by the
   * caller so this stays free of the `workspace`/`isUnclaimed` inputs. A
   * non-null value short-circuits before `mutate` is ever called. */
  blockReason: string | null;
  tracker: PlanDecisionInFlightTracker;
  /** Fired once the decision is claimed (state -> in flight) and once more
   * with `null` once it settles — mirrors `setDeciding`/`setDeciding(null)`
   * in the hook. Only the call that actually claimed the tracker slot fires
   * the settle notification, so a superseded/no-op call never clobbers a
   * different plan's still-in-flight state. */
  onStateChange: (state: PlanDecisionState | null) => void;
  showToast: (message: string) => void;
}

export async function runPlanDecision(input: RunPlanDecisionInput): Promise<void> {
  const {
    action,
    planId,
    decisionVersion,
    mutate,
    failureMessage,
    blockReason,
    tracker,
    onStateChange,
    showToast,
  } = input;

  // Double-tap guard: a decision for this exact plan is already in flight —
  // ignore the duplicate tap rather than firing a second mutation.
  if (tracker.planId === planId) {
    return;
  }

  if (blockReason) {
    showToast(blockReason);
    return;
  }

  tracker.planId = planId;
  onStateChange({ planId, action });
  try {
    await mutate({ planId, ...buildPlanDecisionRequest(decisionVersion) });
  } catch (error) {
    showToast(resolvePlanDecisionErrorMessage(error, failureMessage));
  } finally {
    if (tracker.planId === planId) {
      tracker.planId = null;
      onStateChange(null);
    }
  }
}

/** Fix 3 (reviewer finding) — a raw `error.message` used to reach the
 * toast verbatim on a version-conflict 409, which for
 * `PLAN_DECISION_VERSION_CONFLICT`/`PLAN_DECISION_TERMINAL` is server
 * wording never meant for end users. Detected the same way web's
 * `isPlanDecisionRefreshConflict` does (`use-proposed-plan-actions.ts`):
 * an `AnyHarnessError` (`@anyharness/sdk`) whose RFC 7807 `problem.status`
 * is 409 and `problem.code` is one of those two. Every other error keeps
 * surfacing `error.message` (or the generic `fallback` for a non-`Error`
 * throw), unchanged from before this fix. */
export function resolvePlanDecisionErrorMessage(error: unknown, fallback: string): string {
  if (isPlanDecisionConflict(error)) {
    return PLAN_DECISION_CONFLICT_MESSAGE;
  }
  return error instanceof Error ? error.message : fallback;
}

function isPlanDecisionConflict(error: unknown): boolean {
  return (
    error instanceof AnyHarnessError
    && error.problem.status === 409
    && (error.problem.code === "PLAN_DECISION_VERSION_CONFLICT" || error.problem.code === "PLAN_DECISION_TERMINAL")
  );
}
