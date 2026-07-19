import type { CreatePullRequestResponse } from "@anyharness/sdk";

import { runMobilePublishWorkflow, type MobilePublishWorkflowRunner } from "./mobile-publish-workflow-runner";
import type { PublishRunEvent } from "./mobile-publish-run-state";
import type { PublishWorkflowStep } from "./mobile-publish-workflow-model";

/**
 * Row 29 (reviewer follow-up, Fix 2) — the framework-free core of
 * `useMobilePublishWorkflow`'s `submit()`, pulled out for the same reason
 * Row 20's Fix 4 pulled `runPlanDecision` out of
 * `use-mobile-plan-decision-actions.ts`: the hook itself calls real
 * `useState`/`useReducer`/`useRef` from `react`, and this app has no RN/DOM
 * test harness (`vitest.config.ts` runs plain "node" — no
 * `@testing-library/react`, no `react-test-renderer`, no jsdom in
 * `apps/mobile`'s own dependencies), so a hook that touches real React hook
 * state can't be driven directly in a test. Every behavior the reviewer
 * flagged as untested — the stop-on-failure step wiring (already covered at
 * the step level by `mobile-publish-workflow-runner.test.ts`, exercised
 * again here through the full run), the try/catch/finally refetch, the
 * toast, and the double-submit in-flight guard — lives in `runPublish`
 * below instead, as plain async logic the hook just wires up.
 *
 * `runMobilePublishWorkflow` (the ordered step executor) is unchanged and
 * still owns the per-step switch; `runPublish` wraps it with exactly what
 * was previously inline in the hook's `submit()`: the in-flight guard, the
 * try/catch that turns a thrown error into a `failed` run-state event plus
 * a toast, and the `finally` refetch that always runs whether the run
 * succeeded or failed.
 */

/**
 * The publish run currently "in flight" for the double-submit guard — a
 * plain mutable object (not a React ref) so tests can construct
 * `{ running: false }` directly, no React required. `runPublish` reads and
 * writes `tracker.running` synchronously before its first `await`, so a
 * second call fired in the same synchronous tick as the first (e.g. two
 * taps handled back-to-back before any re-render could disable the dock)
 * is a no-op rather than a second concurrent run — the same guarantee Row
 * 20's Fix 4 hardened `PlanDecisionInFlightTracker` to provide.
 */
export interface PublishInFlightTracker {
  running: boolean;
}

export interface RunPublishInput {
  /** `view.workflowSteps` (`mobile-publish-view.ts`) — provably empty
   * whenever the final `disabledReason` is set and `viewsExistingPrOnly`
   * is false (see `resolvePublishDisabledReason`'s "no local commits
   * ready to publish" branch, the only path that leaves `disabledReason`
   * null with nothing to run), and the sheet's primary button is disabled
   * in exactly that state — so `runPublish` doesn't need `disabledReason`
   * as a separate input: an empty `steps` array is itself the "nothing to
   * do" signal, guarded below the same as an in-flight run. */
  steps: PublishWorkflowStep[];
  runner: MobilePublishWorkflowRunner;
  tracker: PublishInFlightTracker;
  /** `dispatch` from `publishRunReducer` (`mobile-publish-run-state.ts`) —
   * fired with `step_started` per step (via `runMobilePublishWorkflow`),
   * then `completed` or `failed` once the run settles. */
  dispatch: (event: PublishRunEvent) => void;
  /** Always awaited in `finally`, win or lose — mirrors web's
   * `useWorkspacePublishWorkflow` refetching git-status/PR state so the
   * Diff surface never shows a guessed post-publish view. */
  refetch: () => Promise<unknown>;
  /** The friendly (`Error#message`) or generic fallback failure text —
   * never the raw thrown value. */
  showToast: (message: string) => void;
  /** Shown when a run fails with something other than an `Error`. */
  failureMessage?: string;
}

export interface RunPublishResult {
  /** `false` for both "blocked by an in-flight run" and "the run itself
   * failed" — the hook only needs to know whether it's safe to close the
   * sheet/clear the draft, not which. */
  completed: boolean;
  pullRequest: CreatePullRequestResponse["pullRequest"] | null;
}

const DEFAULT_FAILURE_MESSAGE = "Failed to publish.";

export async function runPublish(input: RunPublishInput): Promise<RunPublishResult> {
  const { steps, runner, tracker, dispatch, refetch, showToast, failureMessage = DEFAULT_FAILURE_MESSAGE } = input;

  // Double-submit guard: a run is already in flight — ignore the duplicate
  // call rather than starting a second concurrent one. Checked and set
  // synchronously, before any `await`, so two calls issued back-to-back in
  // the same tick can't both slip through.
  if (tracker.running) {
    return { completed: false, pullRequest: null };
  }
  // Defensive only, mirrors the pre-extraction hook's `view.disabledReason`
  // check — the sheet's primary button is disabled whenever there's
  // nothing to run, so this guards a stray/defensive invocation rather
  // than a real user-facing failure; nothing to dispatch, toast, or
  // refetch for a run that does nothing.
  if (steps.length === 0) {
    return { completed: false, pullRequest: null };
  }

  tracker.running = true;
  let completed = false;
  let pullRequest: CreatePullRequestResponse["pullRequest"] | null = null;
  try {
    pullRequest = await runMobilePublishWorkflow(steps, runner, dispatch);
    dispatch({ type: "completed" });
    completed = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : failureMessage;
    dispatch({ type: "failed", message });
    showToast(message);
  } finally {
    await refetch();
    tracker.running = false;
  }
  return { completed, pullRequest };
}
