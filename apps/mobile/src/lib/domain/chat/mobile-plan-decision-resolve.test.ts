import { describe, expect, it } from "vitest";

import { buildPlanDecisionRequest } from "./mobile-plan-decision-resolve";

/**
 * Row 20 — the payload for `client.plans.approve`/`client.plans.reject`
 * (`anyharness/sdk/src/client/plans.ts`), the real endpoints web's
 * `useApprovePlanMutation`/`useRejectPlanMutation`
 * (`anyharness/sdk-react/src/hooks/plans.ts`) call — NOT
 * `client.sessions.resolveInteraction`. A plan decision is a workspace-
 * scoped `/plans/{planId}/approve|reject` call carrying only the
 * optimistic-concurrency version, `PlanDecisionRequest` (openapi.ts) —
 * there is no `requestId`/interaction outcome involved.
 */
describe("buildPlanDecisionRequest", () => {
  it("carries the observed decision version as expectedDecisionVersion", () => {
    expect(buildPlanDecisionRequest(1)).toEqual({ expectedDecisionVersion: 1 });
  });

  it("carries a later version verbatim (no off-by-one/increment)", () => {
    expect(buildPlanDecisionRequest(7)).toEqual({ expectedDecisionVersion: 7 });
  });
});
