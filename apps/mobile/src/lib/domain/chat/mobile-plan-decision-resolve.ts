import type { PlanDecisionRequest } from "@anyharness/sdk";

/**
 * Row 20 — pure builder for `PlanDecisionRequest`
 * (`anyharness/sdk/src/types/plans.ts`, generated from the
 * `PlanDecisionRequest` OpenAPI schema: `{ expectedDecisionVersion: number
 * }`), the body `client.plans.approve`/`client.plans.reject` send. This is
 * a *different* wire call than `mobile-chat-interaction-resolve.ts`'s
 * `ResolveInteractionRequest` builders — a proposed-plan decision is never
 * resolved through `client.sessions.resolveInteraction`
 * (`{outcome:"decision", decision:"allow"|"deny"}`); the reducer excludes
 * it from `selectPrimaryPendingInteraction` for exactly this reason (see
 * `mobile-live-transcript-view.ts`'s module doc). Web's
 * `useApprovePlanMutation`/`useRejectPlanMutation`
 * (`anyharness/sdk-react/src/hooks/plans.ts`) both pass
 * `{planId, expectedDecisionVersion}` straight through to
 * `client.plans.approve`/`.reject`; `planId` isn't part of this builder's
 * output since it's a path param on the client call, not a request-body
 * field — verified against `PlanDecisionRequest`'s real shape, not
 * invented.
 */
export function buildPlanDecisionRequest(expectedDecisionVersion: number): PlanDecisionRequest {
  return { expectedDecisionVersion };
}
