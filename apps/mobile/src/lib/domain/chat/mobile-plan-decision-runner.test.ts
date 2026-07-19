import { AnyHarnessError } from "@anyharness/sdk";
import { describe, expect, it, vi } from "vitest";

import {
  PLAN_DECISION_CONFLICT_MESSAGE,
  resolvePlanDecisionErrorMessage,
  runPlanDecision,
  type PlanDecisionInFlightTracker,
  type PlanDecisionState,
} from "./mobile-plan-decision-runner";

/**
 * Row 20 (reviewer follow-up, Fix 4) — `useMobilePlanDecisionActions` had no
 * test at all; this covers the framework-free logic pulled out of it into
 * `mobile-plan-decision-runner.ts` (see that module's doc comment for why
 * the hook itself can't be driven directly here): the mutate-call shape,
 * the friendly 409 toast (Fix 3), the double-tap guard (Fix 2's
 * `decidingPlanId`/in-flight tracking), and the pre-flight blockReason
 * short-circuit.
 */

function conflictError(code: "PLAN_DECISION_VERSION_CONFLICT" | "PLAN_DECISION_TERMINAL"): AnyHarnessError {
  return new AnyHarnessError({
    type: "about:blank",
    title: "Conflict",
    status: 409,
    code,
    detail: "raw server wording nobody should see",
  });
}

function newTracker(): PlanDecisionInFlightTracker {
  return { planId: null };
}

describe("runPlanDecision", () => {
  it("approve calls mutate with {planId, expectedDecisionVersion} for the approve action", async () => {
    const mutate = vi.fn().mockResolvedValue(undefined);
    const showToast = vi.fn();
    const onStateChange = vi.fn();

    await runPlanDecision({
      action: "approve",
      planId: "plan-1",
      decisionVersion: 3,
      mutate,
      failureMessage: "Failed to approve plan.",
      blockReason: null,
      tracker: newTracker(),
      onStateChange,
      showToast,
    });

    expect(mutate).toHaveBeenCalledExactlyOnceWith({ planId: "plan-1", expectedDecisionVersion: 3 });
    expect(showToast).not.toHaveBeenCalled();
  });

  it("reject calls mutate with {planId, expectedDecisionVersion} for the reject action", async () => {
    const mutate = vi.fn().mockResolvedValue(undefined);
    const onStateChange = vi.fn();

    await runPlanDecision({
      action: "reject",
      planId: "plan-2",
      decisionVersion: 5,
      mutate,
      failureMessage: "Failed to reject plan.",
      blockReason: null,
      tracker: newTracker(),
      onStateChange,
      showToast: vi.fn(),
    });

    expect(mutate).toHaveBeenCalledExactlyOnceWith({ planId: "plan-2", expectedDecisionVersion: 5 });
  });

  it("reports the in-flight state (planId + action) before mutate resolves, then clears it", async () => {
    let resolveMutate: () => void = () => {};
    const mutate = vi.fn(() => new Promise<void>((resolve) => { resolveMutate = resolve; }));
    const states: (PlanDecisionState | null)[] = [];

    const pending = runPlanDecision({
      action: "approve",
      planId: "plan-3",
      decisionVersion: 1,
      mutate,
      failureMessage: "Failed to approve plan.",
      blockReason: null,
      tracker: newTracker(),
      onStateChange: (state) => states.push(state),
      showToast: vi.fn(),
    });

    expect(states).toEqual([{ planId: "plan-3", action: "approve" }]);
    resolveMutate();
    await pending;
    expect(states).toEqual([{ planId: "plan-3", action: "approve" }, null]);
  });

  it("shows the friendly conflict message (not the raw error) on a PLAN_DECISION_VERSION_CONFLICT 409", async () => {
    const mutate = vi.fn().mockRejectedValue(conflictError("PLAN_DECISION_VERSION_CONFLICT"));
    const showToast = vi.fn();

    await runPlanDecision({
      action: "approve",
      planId: "plan-4",
      decisionVersion: 2,
      mutate,
      failureMessage: "Failed to approve plan.",
      blockReason: null,
      tracker: newTracker(),
      onStateChange: vi.fn(),
      showToast,
    });

    expect(showToast).toHaveBeenCalledExactlyOnceWith(PLAN_DECISION_CONFLICT_MESSAGE);
  });

  it("shows the friendly conflict message on a PLAN_DECISION_TERMINAL 409 too", async () => {
    const mutate = vi.fn().mockRejectedValue(conflictError("PLAN_DECISION_TERMINAL"));
    const showToast = vi.fn();

    await runPlanDecision({
      action: "reject",
      planId: "plan-5",
      decisionVersion: 2,
      mutate,
      failureMessage: "Failed to reject plan.",
      blockReason: null,
      tracker: newTracker(),
      onStateChange: vi.fn(),
      showToast,
    });

    expect(showToast).toHaveBeenCalledExactlyOnceWith(PLAN_DECISION_CONFLICT_MESSAGE);
  });

  it("shows the raw error message for a non-conflict failure", async () => {
    const mutate = vi.fn().mockRejectedValue(new Error("network dropped"));
    const showToast = vi.fn();

    await runPlanDecision({
      action: "approve",
      planId: "plan-6",
      decisionVersion: 2,
      mutate,
      failureMessage: "Failed to approve plan.",
      blockReason: null,
      tracker: newTracker(),
      onStateChange: vi.fn(),
      showToast,
    });

    expect(showToast).toHaveBeenCalledExactlyOnceWith("network dropped");
  });

  it("falls back to the generic failure message for a non-Error throw", async () => {
    const mutate = vi.fn().mockRejectedValue("boom");
    const showToast = vi.fn();

    await runPlanDecision({
      action: "approve",
      planId: "plan-7",
      decisionVersion: 2,
      mutate,
      failureMessage: "Failed to approve plan.",
      blockReason: null,
      tracker: newTracker(),
      onStateChange: vi.fn(),
      showToast,
    });

    expect(showToast).toHaveBeenCalledExactlyOnceWith("Failed to approve plan.");
  });

  it("double-tap guard: a second concurrent call for the same plan is a no-op", async () => {
    let resolveMutate: () => void = () => {};
    const mutate = vi.fn(() => new Promise<void>((resolve) => { resolveMutate = resolve; }));
    const tracker = newTracker();
    const onStateChange = vi.fn();

    const first = runPlanDecision({
      action: "approve",
      planId: "plan-8",
      decisionVersion: 1,
      mutate,
      failureMessage: "Failed to approve plan.",
      blockReason: null,
      tracker,
      onStateChange,
      showToast: vi.fn(),
    });
    // Second tap (e.g. Reject) fires synchronously before the first
    // resolves, and before any re-render could disable the buttons.
    const second = runPlanDecision({
      action: "reject",
      planId: "plan-8",
      decisionVersion: 1,
      mutate,
      failureMessage: "Failed to reject plan.",
      blockReason: null,
      tracker,
      onStateChange,
      showToast: vi.fn(),
    });

    await second;
    expect(mutate).toHaveBeenCalledOnce();
    expect(onStateChange).toHaveBeenCalledExactlyOnceWith({ planId: "plan-8", action: "approve" });

    resolveMutate();
    await first;
  });

  it("a decision for a different plan is not blocked by one already in flight on the same shared tracker", async () => {
    let resolveFirstMutate: () => void = () => {};
    const firstMutate = vi.fn(() => new Promise<void>((resolve) => { resolveFirstMutate = resolve; }));
    const secondMutate = vi.fn().mockResolvedValue(undefined);
    // Same tracker for both calls — this is what one hook instance's single
    // `trackerRef` looks like when two different plans are decided in
    // overlapping windows; the guard is keyed on `planId`, not "anything in
    // flight at all", so plan-10 must proceed even while plan-9 is pending.
    const tracker = newTracker();

    const first = runPlanDecision({
      action: "approve",
      planId: "plan-9",
      decisionVersion: 1,
      mutate: firstMutate,
      failureMessage: "Failed to approve plan.",
      blockReason: null,
      tracker,
      onStateChange: vi.fn(),
      showToast: vi.fn(),
    });

    await runPlanDecision({
      action: "approve",
      planId: "plan-10",
      decisionVersion: 1,
      mutate: secondMutate,
      failureMessage: "Failed to approve plan.",
      blockReason: null,
      tracker,
      onStateChange: vi.fn(),
      showToast: vi.fn(),
    });

    expect(secondMutate).toHaveBeenCalledOnce();
    resolveFirstMutate();
    await first;
    expect(firstMutate).toHaveBeenCalledOnce();
  });

  it("blockReason short-circuits before mutate: toasts the reason and never calls mutate", async () => {
    const mutate = vi.fn();
    const showToast = vi.fn();
    const onStateChange = vi.fn();

    await runPlanDecision({
      action: "approve",
      planId: "plan-11",
      decisionVersion: 1,
      mutate,
      failureMessage: "Failed to approve plan.",
      blockReason: "Claim this workspace before approving commands from mobile.",
      tracker: newTracker(),
      onStateChange,
      showToast,
    });

    expect(mutate).not.toHaveBeenCalled();
    expect(onStateChange).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledExactlyOnceWith(
      "Claim this workspace before approving commands from mobile.",
    );
  });
});

describe("resolvePlanDecisionErrorMessage", () => {
  it("returns the friendly conflict message for PLAN_DECISION_VERSION_CONFLICT", () => {
    expect(
      resolvePlanDecisionErrorMessage(conflictError("PLAN_DECISION_VERSION_CONFLICT"), "fallback"),
    ).toBe(PLAN_DECISION_CONFLICT_MESSAGE);
  });

  it("returns the friendly conflict message for PLAN_DECISION_TERMINAL", () => {
    expect(
      resolvePlanDecisionErrorMessage(conflictError("PLAN_DECISION_TERMINAL"), "fallback"),
    ).toBe(PLAN_DECISION_CONFLICT_MESSAGE);
  });

  it("does not treat a 409 with an unrelated code as a plan-decision conflict", () => {
    const error = new AnyHarnessError({
      type: "about:blank",
      title: "Conflict",
      status: 409,
      code: "SOME_OTHER_CODE",
      detail: "some other 409",
    });
    expect(resolvePlanDecisionErrorMessage(error, "fallback")).toBe("some other 409");
  });

  it("does not treat a non-409 AnyHarnessError with the conflict code as a conflict", () => {
    const error = new AnyHarnessError({
      type: "about:blank",
      title: "Server error",
      status: 500,
      code: "PLAN_DECISION_VERSION_CONFLICT",
      detail: "boom",
    });
    expect(resolvePlanDecisionErrorMessage(error, "fallback")).toBe("boom");
  });
});
