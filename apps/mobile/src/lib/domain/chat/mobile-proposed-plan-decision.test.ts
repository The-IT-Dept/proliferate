import { describe, expect, it } from "vitest";

import {
  resolveProposedPlanDecisionActions,
  resolveProposedPlanDecisionStatus,
  resolveProposedPlanFailureMessage,
  shouldShowProposedPlanDecisionChip,
} from "./mobile-proposed-plan-decision";

/**
 * Group Row 20 (plan decisions) — pure derivations ported verbatim from
 * web's `ProposedPlanCard.tsx` (`resolveDecisionStatus`, the `canDecide`/
 * `canRetryNativeApproval` footer-action gates, and the destructive
 * failure-message line). Verified against
 * `apps/packages/product-client/src/components/workspace/chat/transcript/ProposedPlanCard.test.tsx`
 * case-by-case — every branch below has a matching web assertion.
 */
describe("resolveProposedPlanDecisionStatus", () => {
  it("labels a pending decision as Awaiting approval", () => {
    expect(
      resolveProposedPlanDecisionStatus({ decisionState: "pending", nativeResolutionState: null }),
    ).toEqual({ label: "Awaiting approval", tone: "warning" });
  });

  it("labels an approved decision as Approved", () => {
    expect(
      resolveProposedPlanDecisionStatus({
        decisionState: "approved",
        nativeResolutionState: "finalized",
      }),
    ).toEqual({ label: "Approved", tone: "neutral" });
  });

  it("labels a rejected decision as Rejected", () => {
    expect(
      resolveProposedPlanDecisionStatus({ decisionState: "rejected", nativeResolutionState: null }),
    ).toEqual({ label: "Rejected", tone: "muted" });
  });

  it("labels a superseded decision as Superseded", () => {
    expect(
      resolveProposedPlanDecisionStatus({ decisionState: "superseded", nativeResolutionState: null }),
    ).toEqual({ label: "Superseded", tone: "muted" });
  });

  it("overrides to Failed when the native resolution failed, regardless of decisionState", () => {
    expect(
      resolveProposedPlanDecisionStatus({
        decisionState: "approved",
        nativeResolutionState: "failed",
      }),
    ).toEqual({ label: "Failed", tone: "destructive" });
  });
});

describe("shouldShowProposedPlanDecisionChip", () => {
  it("hides the chip while the plan body is still streaming (no decision content part observed yet)", () => {
    expect(shouldShowProposedPlanDecisionChip(null)).toBe(false);
  });

  it("shows the chip once a decision content part has arrived, whatever the version", () => {
    expect(shouldShowProposedPlanDecisionChip(1)).toBe(true);
    expect(shouldShowProposedPlanDecisionChip(0)).toBe(true);
  });
});

describe("resolveProposedPlanDecisionActions", () => {
  it("allows Approve + Reject while the decision is pending with a known version", () => {
    expect(
      resolveProposedPlanDecisionActions({
        decisionState: "pending",
        decisionVersion: 1,
        nativeResolutionState: null,
        nativeContinuation: false,
      }),
    ).toEqual({ canApprove: true, canReject: true });
  });

  it("hides both actions while the decision version hasn't arrived yet (decision content part not seen)", () => {
    expect(
      resolveProposedPlanDecisionActions({
        decisionState: "pending",
        decisionVersion: null,
        nativeResolutionState: null,
        nativeContinuation: false,
      }),
    ).toEqual({ canApprove: false, canReject: false });
  });

  it("offers a retry-Approve (no Reject) when an approved native plan is still link-pending", () => {
    expect(
      resolveProposedPlanDecisionActions({
        decisionState: "approved",
        decisionVersion: 2,
        nativeResolutionState: "pending_link",
        nativeContinuation: true,
      }),
    ).toEqual({ canApprove: true, canReject: false });
  });

  it("does not offer retry-Approve for a non-native-continuation plan once approved", () => {
    expect(
      resolveProposedPlanDecisionActions({
        decisionState: "approved",
        decisionVersion: 2,
        nativeResolutionState: "pending_link",
        nativeContinuation: false,
      }),
    ).toEqual({ canApprove: false, canReject: false });
  });

  it("hides the carry-out retry once native continuation has finalized", () => {
    expect(
      resolveProposedPlanDecisionActions({
        decisionState: "approved",
        decisionVersion: 2,
        nativeResolutionState: "finalized",
        nativeContinuation: true,
      }),
    ).toEqual({ canApprove: false, canReject: false });
  });

  it("hides both actions once rejected", () => {
    expect(
      resolveProposedPlanDecisionActions({
        decisionState: "rejected",
        decisionVersion: 3,
        nativeResolutionState: null,
        nativeContinuation: false,
      }),
    ).toEqual({ canApprove: false, canReject: false });
  });
});

describe("resolveProposedPlanFailureMessage", () => {
  it("surfaces the trimmed error message when the native resolution failed", () => {
    expect(
      resolveProposedPlanFailureMessage({
        nativeResolutionState: "failed",
        errorMessage: "  agent crashed mid-run  ",
      }),
    ).toBe("agent crashed mid-run");
  });

  it("returns null when there is no error message despite a failed resolution", () => {
    expect(
      resolveProposedPlanFailureMessage({ nativeResolutionState: "failed", errorMessage: null }),
    ).toBeNull();
  });

  it("returns null when the native resolution did not fail, even with an error message set", () => {
    expect(
      resolveProposedPlanFailureMessage({
        nativeResolutionState: "pending_link",
        errorMessage: "stale error from a prior attempt",
      }),
    ).toBeNull();
  });
});
