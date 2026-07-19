import { describe, expect, it, vi } from "vitest";
import type { CreatePullRequestResponse } from "@anyharness/sdk";

import { runPublish, type PublishInFlightTracker } from "./mobile-publish-run";
import type { PublishRunEvent } from "./mobile-publish-run-state";
import type { PublishWorkflowStep } from "./mobile-publish-workflow-model";

/**
 * Row 29 (reviewer follow-up, Fix 2) — `useMobilePublishWorkflow` had no
 * test at all; this covers the framework-free logic pulled out of its
 * `submit()` into `mobile-publish-run.ts`'s `runPublish` (see that module's
 * doc comment for why the hook itself can't be driven directly here): the
 * try/catch/finally refetch, the friendly-vs-raw error/toast path, the
 * synchronous double-submit guard, and partial-failure retry idempotency.
 * Step ordering itself (stage → commit → push → create_pull_request, and
 * dispatching `step_started` per step) is already covered end to end by
 * `mobile-publish-workflow-runner.test.ts`; the stop-on-failure assertions
 * below exercise the same stopping behavior through the full `runPublish`
 * path (guard + dispatch + refetch + toast all engaged), not a duplicate of
 * that file's narrower per-step coverage.
 */

function pullRequestResponse(): CreatePullRequestResponse {
  return {
    pullRequest: {
      title: "x",
      url: "https://github.test/pr/1",
      state: "open",
      number: 1,
      headBranch: "feature/demo",
      baseBranch: "main",
      draft: false,
    },
  };
}

function recordingRunner(calls: string[]) {
  return {
    stagePaths: vi.fn(async (paths: string[]) => {
      calls.push(`stage:${paths.join(",")}`);
    }),
    commit: vi.fn(async (input: { summary: string }) => {
      calls.push(`commit:${input.summary}`);
      return { oid: "sha", summary: input.summary };
    }),
    push: vi.fn(async () => {
      calls.push("push");
      return { branch: "feature/demo", published: true, remote: "origin" };
    }),
    createPullRequest: vi.fn(async () => {
      calls.push("create_pull_request");
      return pullRequestResponse();
    }),
  };
}

function newTracker(): PublishInFlightTracker {
  return { running: false };
}

const COMMIT_STEP: PublishWorkflowStep = { kind: "commit", summary: "Update app" };
const PUSH_STEP: PublishWorkflowStep = { kind: "push" };
const CREATE_PR_STEP: PublishWorkflowStep = {
  kind: "create_pull_request",
  request: { title: "Update app", baseBranch: "main", draft: false },
};

describe("runPublish", () => {
  it("runs commit -> push -> create_pull_request in order, dispatches completed, and refetches", async () => {
    const calls: string[] = [];
    const runner = recordingRunner(calls);
    const events: PublishRunEvent[] = [];
    const refetch = vi.fn().mockResolvedValue(undefined);
    const showToast = vi.fn();

    const result = await runPublish({
      steps: [COMMIT_STEP, PUSH_STEP, CREATE_PR_STEP],
      runner,
      tracker: newTracker(),
      dispatch: (event) => events.push(event),
      refetch,
      showToast,
    });

    expect(calls).toEqual(["commit:Update app", "push", "create_pull_request"]);
    expect(events.at(-1)).toEqual({ type: "completed" });
    expect(refetch).toHaveBeenCalledOnce();
    expect(showToast).not.toHaveBeenCalled();
    expect(result).toEqual({ completed: true, pullRequest: pullRequestResponse().pullRequest });
  });

  it("stop-on-failure: a commit failure stops before push runs", async () => {
    const calls: string[] = [];
    const runner = recordingRunner(calls);
    runner.commit.mockRejectedValueOnce(new Error("commit rejected"));
    const events: PublishRunEvent[] = [];
    const refetch = vi.fn().mockResolvedValue(undefined);

    const result = await runPublish({
      steps: [COMMIT_STEP, PUSH_STEP, CREATE_PR_STEP],
      runner,
      tracker: newTracker(),
      dispatch: (event) => events.push(event),
      refetch,
      showToast: vi.fn(),
    });

    expect(runner.commit).toHaveBeenCalledOnce();
    expect(runner.push).not.toHaveBeenCalled();
    expect(runner.createPullRequest).not.toHaveBeenCalled();
    expect(result).toEqual({ completed: false, pullRequest: null });
    expect(events.at(-1)).toEqual({ type: "failed", message: "commit rejected" });
    // The finally refetch still runs on failure.
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("stop-on-failure: a push failure stops before create_pull_request runs", async () => {
    const calls: string[] = [];
    const runner = recordingRunner(calls);
    runner.push.mockRejectedValueOnce(new Error("push rejected"));
    const events: PublishRunEvent[] = [];

    const result = await runPublish({
      steps: [COMMIT_STEP, PUSH_STEP, CREATE_PR_STEP],
      runner,
      tracker: newTracker(),
      dispatch: (event) => events.push(event),
      refetch: vi.fn().mockResolvedValue(undefined),
      showToast: vi.fn(),
    });

    expect(runner.commit).toHaveBeenCalledOnce();
    expect(runner.push).toHaveBeenCalledOnce();
    expect(runner.createPullRequest).not.toHaveBeenCalled();
    expect(result.completed).toBe(false);
    expect(events.at(-1)).toEqual({ type: "failed", message: "push rejected" });
  });

  it("shows the Error#message on the toast (friendly path) for a real Error rejection", async () => {
    const calls: string[] = [];
    const runner = recordingRunner(calls);
    runner.push.mockRejectedValueOnce(new Error("network dropped"));
    const showToast = vi.fn();

    await runPublish({
      steps: [COMMIT_STEP, PUSH_STEP],
      runner,
      tracker: newTracker(),
      dispatch: () => {},
      refetch: vi.fn().mockResolvedValue(undefined),
      showToast,
    });

    expect(showToast).toHaveBeenCalledExactlyOnceWith("network dropped");
  });

  it("falls back to the generic failure message (raw path) for a non-Error rejection", async () => {
    const calls: string[] = [];
    const runner = recordingRunner(calls);
    runner.push.mockRejectedValueOnce("boom");
    const showToast = vi.fn();

    await runPublish({
      steps: [COMMIT_STEP, PUSH_STEP],
      runner,
      tracker: newTracker(),
      dispatch: () => {},
      refetch: vi.fn().mockResolvedValue(undefined),
      showToast,
      failureMessage: "Failed to publish.",
    });

    expect(showToast).toHaveBeenCalledExactlyOnceWith("Failed to publish.");
  });

  it("double-submit guard: a second concurrent call is a synchronous no-op", async () => {
    const calls: string[] = [];
    const runner = recordingRunner(calls);
    let resolveCommit: () => void = () => {};
    runner.commit.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveCommit = () => resolve({ oid: "sha", summary: "Update app" });
        }),
    );
    const tracker = newTracker();
    const refetch = vi.fn().mockResolvedValue(undefined);

    // Fired synchronously back-to-back, before the first call's commit
    // promise (or any re-render that would disable the dock/sheet button)
    // has a chance to settle.
    const first = runPublish({
      steps: [COMMIT_STEP, PUSH_STEP],
      runner,
      tracker,
      dispatch: () => {},
      refetch,
      showToast: vi.fn(),
    });
    const second = runPublish({
      steps: [COMMIT_STEP, PUSH_STEP],
      runner,
      tracker,
      dispatch: () => {},
      refetch,
      showToast: vi.fn(),
    });

    const secondResult = await second;
    expect(secondResult).toEqual({ completed: false, pullRequest: null });
    expect(runner.commit).toHaveBeenCalledOnce();
    // The blocked second call never touches the refetch either.
    expect(refetch).not.toHaveBeenCalled();

    resolveCommit();
    const firstResult = await first;
    expect(firstResult.completed).toBe(true);
    expect(runner.commit).toHaveBeenCalledOnce();
    expect(runner.push).toHaveBeenCalledOnce();
  });

  it("clears the tracker after a failed run so a subsequent call can proceed", async () => {
    const calls: string[] = [];
    const runner = recordingRunner(calls);
    runner.push.mockRejectedValueOnce(new Error("push rejected"));
    const tracker = newTracker();

    await runPublish({
      steps: [COMMIT_STEP, PUSH_STEP],
      runner,
      tracker,
      dispatch: () => {},
      refetch: vi.fn().mockResolvedValue(undefined),
      showToast: vi.fn(),
    });

    expect(tracker.running).toBe(false);
  });

  it("partial-failure retry idempotency: after commit succeeds/push fails, a retry with a clean tree (no commit step) does not re-commit", async () => {
    const calls: string[] = [];
    const runner = recordingRunner(calls);
    runner.push.mockRejectedValueOnce(new Error("push rejected"));
    const tracker = newTracker();
    const refetch = vi.fn().mockResolvedValue(undefined);

    const firstRun = await runPublish({
      steps: [COMMIT_STEP, PUSH_STEP],
      runner,
      tracker,
      dispatch: () => {},
      refetch,
      showToast: vi.fn(),
    });
    expect(firstRun.completed).toBe(false);
    expect(runner.commit).toHaveBeenCalledOnce();

    // A fresh git-status refetch after the partial failure shows a clean
    // working tree (the commit already landed) with only the unpushed
    // commit left — `buildMobilePublishView` would derive `workflowSteps`
    // without a `commit` step in that state, so the retry is given
    // `[PUSH_STEP]` only, the same as real call-site wiring would compute.
    const retry = await runPublish({
      steps: [PUSH_STEP],
      runner,
      tracker,
      dispatch: () => {},
      refetch,
      showToast: vi.fn(),
    });

    expect(retry.completed).toBe(true);
    // Still exactly once from the first run — the retry must not re-commit.
    expect(runner.commit).toHaveBeenCalledOnce();
    expect(runner.push).toHaveBeenCalledTimes(2);
  });

  it("an empty steps array (nothing to run) is a defensive no-op: no dispatch, refetch, or toast", async () => {
    const calls: string[] = [];
    const runner = recordingRunner(calls);
    const dispatch = vi.fn();
    const refetch = vi.fn().mockResolvedValue(undefined);
    const showToast = vi.fn();

    const result = await runPublish({
      steps: [],
      runner,
      tracker: newTracker(),
      dispatch,
      refetch,
      showToast,
    });

    expect(result).toEqual({ completed: false, pullRequest: null });
    expect(dispatch).not.toHaveBeenCalled();
    expect(refetch).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
  });
});
