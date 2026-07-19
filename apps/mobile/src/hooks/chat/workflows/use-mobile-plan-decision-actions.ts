import { useCallback, useRef, useState } from "react";
import { useApprovePlanMutation, useRejectPlanMutation } from "@anyharness/sdk-react";
import type { CloudWorkspaceDetail } from "@proliferate/cloud-sdk";

import {
  runPlanDecision,
  type PlanDecisionActionKind,
  type PlanDecisionInFlightTracker,
  type PlanDecisionState,
} from "../../../lib/domain/chat/mobile-plan-decision-runner";
import { resolveMobileInteractionBlockReason } from "../../../lib/access/anyharness/cloud-sandbox-runtime";
import { useMobileToast } from "../../../providers/MobileToastProvider";

/**
 * Row 20 — Approve/Reject a proposed plan (`ProposedPlanRow` in
 * `mobile-live-transcript-view.ts`). Thin wrapper around the real
 * `@anyharness/sdk-react` mutations, `useApprovePlanMutation`/
 * `useRejectPlanMutation` (`anyharness/sdk-react/src/hooks/plans.ts`) —
 * which call `client.plans.approve`/`.reject`
 * (`/v1/workspaces/{workspaceId}/plans/{planId}/approve|reject`). This is
 * deliberately NOT `useResolveSessionInteractionMutation`
 * (E3's `useMobileChatInteractionActions`): a proposed-plan decision is a
 * workspace-scoped plan endpoint, not a session interaction outcome — see
 * `mobile-live-transcript-view.ts`'s module doc for why the reducer
 * excludes it from the generic pending-interaction selectors in the first
 * place.
 *
 * No optimistic update: like E3's `resolve()`, this leaves the row exactly
 * as it was after a successful call and waits for the live stream
 * (`stream.transcript`, via a new `proposed_plan_decision` content part) to
 * reflect the decision — `buildLiveTranscriptRows` picks the new
 * `decisionState`/`decisionVersion` straight off the item once that
 * arrives. Failure surfaces via `useMobileToast()`.
 *
 * Web additionally recovers from a `PLAN_DECISION_VERSION_CONFLICT`/
 * `PLAN_DECISION_TERMINAL` 409 by refetching the plan and reconciling it
 * into a plan-detail query cache (`useProposedPlanCache`,
 * `use-proposed-plan-actions.ts`). Mobile has no such cache to reconcile —
 * `stream.transcript` is the only source of truth here — so a conflict
 * just surfaces as a toast (the friendly verbatim copy web shows after its
 * refetch, not the raw server `error.message` — Fix 3, see
 * `mobile-plan-decision-runner.ts`'s `resolvePlanDecisionErrorMessage`);
 * the next transcript event naturally carries the real, current decision
 * state and the row updates (buttons re-derive from fresh
 * `decisionVersion`/`decisionState`) without any special-cased retry.
 *
 * "Run here"/"New session" (carrying out an approved plan) are NOT built
 * here — flagged as follow-up. Web's `implementPlanHere` submits a canned
 * prompt with mode-switch/session-config wiring, workspace-directory
 * readiness checks, and latency-flow telemetry
 * (`executePlanImplementation` in `use-proposed-plan-actions.ts`); mobile's
 * prompt path (`use-mobile-chat-prompt-actions.ts`) only sends plain text
 * today, with none of `blocks`/`optimisticContentParts`/session-config-
 * mode-switch support. "New session" opens a whole workspace/session-picker
 * dialog on web (`ConnectedPlanHandoffDialog`/`use-plan-handoff-workflow.ts`,
 * ~550 lines across the dialog + workflow) built on `useHandoffPlanMutation`
 * — a materially separate subsystem, not a small addition to this hook.
 *
 * Fix 2 (reviewer finding): a single `decidingPlanId` used to drive
 * `busy`/"Sending" on the Approve button alone, so tapping Reject wrongly
 * flipped Approve into its busy state while Reject showed no progress.
 * `decidingAction` (alongside `decidingPlanId`) now tracks *which* action
 * is in flight for the plan currently deciding — matching web's separate
 * `isApprovingPlan`/`isRejectingPlan` (`use-proposed-plan-actions.ts`) —
 * so the caller can drive each button from its own action while `deciding`
 * (either action, unchanged) still drives the shared double-tap-guard
 * `disabled` on both buttons.
 *
 * Fix 4 (reviewer finding, "test the actions hook"): the decide-and-report
 * logic (mutate-call shape, the friendly 409 toast, and the double-tap
 * guard) now lives in `mobile-plan-decision-runner.ts`'s `runPlanDecision`
 * — this hook is just the React wiring around it (real mutations, toast,
 * and the `deciding` state this file's `.test.ts` can't reach directly,
 * since there's no RN/DOM render harness in this app; see that module's
 * doc comment for why). Pulling that logic out also hardened the
 * double-tap guard: it used to be enforced only by the UI disabling the
 * button after a re-render, so two taps in the same synchronous tick could
 * both reach `mutate`. `trackerRef` below is a plain ref (not the
 * `deciding` state, which is async/batched) so the guard reads/writes
 * synchronously across both taps.
 */
export function useMobilePlanDecisionActions({
  workspace,
  isUnclaimed,
}: {
  workspace: CloudWorkspaceDetail | null;
  isUnclaimed: boolean;
}) {
  const approveMutation = useApprovePlanMutation();
  const rejectMutation = useRejectPlanMutation();
  const toast = useMobileToast();
  const [deciding, setDeciding] = useState<PlanDecisionState | null>(null);
  const trackerRef = useRef<PlanDecisionInFlightTracker>({ planId: null });

  const decide = useCallback(
    (
      action: PlanDecisionActionKind,
      mutate: (input: { planId: string; expectedDecisionVersion: number }) => Promise<unknown>,
      planId: string,
      decisionVersion: number,
      failureMessage: string,
    ) =>
      runPlanDecision({
        action,
        planId,
        decisionVersion,
        mutate,
        failureMessage,
        blockReason: resolveMobileInteractionBlockReason({ workspace, isUnclaimed }),
        tracker: trackerRef.current,
        onStateChange: setDeciding,
        showToast: (message) => toast.show({ tone: "error", message }),
      }),
    [toast, workspace, isUnclaimed],
  );

  const approvePlan = useCallback(
    (planId: string, decisionVersion: number) =>
      decide("approve", approveMutation.mutateAsync, planId, decisionVersion, "Failed to approve plan."),
    [decide, approveMutation.mutateAsync],
  );

  const rejectPlan = useCallback(
    (planId: string, decisionVersion: number) =>
      decide("reject", rejectMutation.mutateAsync, planId, decisionVersion, "Failed to reject plan."),
    [decide, rejectMutation.mutateAsync],
  );

  return {
    decidingPlanId: deciding?.planId ?? null,
    decidingAction: deciding?.action ?? null,
    approvePlan,
    rejectPlan,
  };
}

export type MobilePlanDecisionActions = ReturnType<typeof useMobilePlanDecisionActions>;
