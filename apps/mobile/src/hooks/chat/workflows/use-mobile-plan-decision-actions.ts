import { useCallback, useState } from "react";
import { useApprovePlanMutation, useRejectPlanMutation } from "@anyharness/sdk-react";
import type { CloudWorkspaceDetail } from "@proliferate/cloud-sdk";

import { buildPlanDecisionRequest } from "../../../lib/domain/chat/mobile-plan-decision-resolve";
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
 * just surfaces as a toast; the next transcript event naturally carries the
 * real, current decision state and the row updates (buttons re-derive from
 * fresh `decisionVersion`/`decisionState`) without any special-cased retry.
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
  const [decidingPlanId, setDecidingPlanId] = useState<string | null>(null);

  const decide = useCallback(
    async (
      mutate: (input: { planId: string; expectedDecisionVersion: number }) => Promise<unknown>,
      planId: string,
      decisionVersion: number,
      failureMessage: string,
    ) => {
      const blockReason = resolveMobileInteractionBlockReason({ workspace, isUnclaimed });
      if (blockReason) {
        toast.show({ tone: "error", message: blockReason });
        return;
      }
      setDecidingPlanId(planId);
      try {
        await mutate({ planId, ...buildPlanDecisionRequest(decisionVersion) });
      } catch (error) {
        toast.show({
          tone: "error",
          message: error instanceof Error ? error.message : failureMessage,
        });
      } finally {
        setDecidingPlanId((current) => (current === planId ? null : current));
      }
    },
    [toast, workspace, isUnclaimed],
  );

  const approvePlan = useCallback(
    (planId: string, decisionVersion: number) =>
      decide(approveMutation.mutateAsync, planId, decisionVersion, "Failed to approve plan."),
    [decide, approveMutation.mutateAsync],
  );

  const rejectPlan = useCallback(
    (planId: string, decisionVersion: number) =>
      decide(rejectMutation.mutateAsync, planId, decisionVersion, "Failed to reject plan."),
    [decide, rejectMutation.mutateAsync],
  );

  return {
    decidingPlanId,
    approvePlan,
    rejectPlan,
  };
}

export type MobilePlanDecisionActions = ReturnType<typeof useMobilePlanDecisionActions>;
