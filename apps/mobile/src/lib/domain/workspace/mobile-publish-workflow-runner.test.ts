import { describe, expect, it, vi } from "vitest";
import type { CreatePullRequestResponse } from "@anyharness/sdk";
import { runMobilePublishWorkflow } from "./mobile-publish-workflow-runner";
import type { PublishRunEvent } from "./mobile-publish-run-state";
import type { PublishWorkflowStep } from "./mobile-publish-workflow-model";

// Ported in shape from web's `run-workspace-publish-workflow.ts`
// (`product-client/src/lib/workflows/workspaces/run-workspace-publish-workflow.ts`)
// — same ordered step-kind switch calling into an injected runner — plus a
// `dispatch` callback so each step announces itself to
// `mobile-publish-run-state.ts`'s reducer before it runs (web has no
// equivalent per-step signal, see that reducer's module doc).
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

describe("runMobilePublishWorkflow", () => {
  it("runs steps in order, dispatching a step_started event before each", async () => {
    const calls: string[] = [];
    const runner = recordingRunner(calls);
    const events: PublishRunEvent[] = [];
    const steps: PublishWorkflowStep[] = [
      { kind: "stage", paths: ["a.ts"] },
      { kind: "commit", summary: "Update app" },
      { kind: "push" },
      { kind: "create_pull_request", request: { title: "Update app", baseBranch: "main", draft: false } },
    ];

    const created = await runMobilePublishWorkflow(steps, runner, (event) => events.push(event));

    expect(calls).toEqual(["stage:a.ts", "commit:Update app", "push", "create_pull_request"]);
    expect(events.map((event) => event.type)).toEqual([
      "step_started",
      "step_started",
      "step_started",
      "step_started",
    ]);
    expect(events.map((event) => (event as { step: PublishWorkflowStep }).step.kind)).toEqual([
      "stage",
      "commit",
      "push",
      "create_pull_request",
    ]);
    expect(created).toEqual(pullRequestResponse().pullRequest);
  });

  it("skips staging an empty path list without calling the runner", async () => {
    const calls: string[] = [];
    const runner = recordingRunner(calls);
    const steps: PublishWorkflowStep[] = [{ kind: "stage", paths: [] }, { kind: "commit", summary: "x" }];

    await runMobilePublishWorkflow(steps, runner, () => {});

    expect(runner.stagePaths).not.toHaveBeenCalled();
    expect(calls).toEqual(["commit:x"]);
  });

  it("returns null when no create_pull_request step runs", async () => {
    const calls: string[] = [];
    const runner = recordingRunner(calls);
    const steps: PublishWorkflowStep[] = [{ kind: "commit", summary: "x" }, { kind: "push" }];

    const created = await runMobilePublishWorkflow(steps, runner, () => {});

    expect(created).toBeNull();
    expect(runner.createPullRequest).not.toHaveBeenCalled();
  });

  it("stops at the failing step and propagates the error without running later steps", async () => {
    const calls: string[] = [];
    const runner = recordingRunner(calls);
    runner.push.mockRejectedValueOnce(new Error("network down"));
    const steps: PublishWorkflowStep[] = [
      { kind: "commit", summary: "x" },
      { kind: "push" },
      { kind: "create_pull_request", request: { title: "x", baseBranch: "main", draft: false } },
    ];

    await expect(runMobilePublishWorkflow(steps, runner, () => {})).rejects.toThrow("network down");
    // "push" itself rejected before recording, so only the completed commit
    // step shows up in `calls` — the push attempt is asserted separately.
    expect(calls).toEqual(["commit:x"]);
    expect(runner.push).toHaveBeenCalledTimes(1);
    expect(runner.createPullRequest).not.toHaveBeenCalled();
  });
});
