import { describe, expect, it } from "vitest";
import type { GitStatusSnapshot } from "@anyharness/sdk";
import {
  publishPrimaryLabel,
  publishStatusLabel,
  publishWorkflowSummary,
} from "./mobile-publish-workflow-labels";
import type { PublishWorkflowStep } from "./mobile-publish-workflow-model";

function status(overrides: Partial<GitStatusSnapshot> = {}): GitStatusSnapshot {
  return {
    workspaceId: "workspace-1",
    workspacePath: "/repo",
    repoRootPath: "/repo",
    currentBranch: "feature/demo",
    headOid: "abc",
    detached: false,
    upstreamBranch: "origin/feature/demo",
    suggestedBaseBranch: "main",
    ahead: 0,
    behind: 0,
    operation: "none",
    conflicted: false,
    clean: false,
    summary: {
      changedFiles: 1,
      additions: 1,
      deletions: 1,
      includedFiles: 1,
      conflictedFiles: 0,
    },
    actions: {
      canCommit: true,
      canPush: false,
      pushLabel: "Push",
      canCreatePullRequest: false,
      canCreateDraftPullRequest: false,
      canCreateBranchWorkspace: true,
      reasonIfBlocked: undefined,
    },
    files: [],
    ...overrides,
  };
}

// A compact, targeted unit test over the label functions in isolation (web
// only exercised them transitively via `publish-workflow.test.ts`'s
// `buildPublishViewState` assertions — this file adds direct coverage per
// the "label mapping" pure logic called out in scope).
describe("publishStatusLabel", () => {
  it("returns null when there is nothing to publish or changes are dirty", () => {
    expect(publishStatusLabel({ gitStatus: null, wantsPublish: true, hasDirtyChanges: false })).toBeNull();
    expect(publishStatusLabel({ gitStatus: status(), wantsPublish: false, hasDirtyChanges: false })).toBeNull();
    expect(publishStatusLabel({ gitStatus: status(), wantsPublish: true, hasDirtyChanges: true })).toBeNull();
  });

  it("reports ahead commits against the upstream branch", () => {
    expect(publishStatusLabel({
      gitStatus: status({ ahead: 3, upstreamBranch: "origin/feature/demo" }),
      wantsPublish: true,
      hasDirtyChanges: false,
    })).toBe("Push 3 local commits to origin/feature/demo.");
    expect(publishStatusLabel({
      gitStatus: status({ ahead: 1, upstreamBranch: "origin/feature/demo" }),
      wantsPublish: true,
      hasDirtyChanges: false,
    })).toBe("Push 1 local commit to origin/feature/demo.");
  });

  it("offers to set an upstream when the branch can push but has none", () => {
    expect(publishStatusLabel({
      gitStatus: status({ upstreamBranch: undefined, actions: { ...status().actions, canPush: true } }),
      wantsPublish: true,
      hasDirtyChanges: false,
    })).toBe("Publish this branch and set its upstream.");
  });

  it("reports up to date when there is an upstream and nothing ahead", () => {
    expect(publishStatusLabel({
      gitStatus: status({ upstreamBranch: "origin/feature/demo", ahead: 0 }),
      wantsPublish: true,
      hasDirtyChanges: false,
    })).toBe("This branch is up to date with origin/feature/demo.");
  });

  it("falls back to no-upstream copy when the branch can't push either", () => {
    expect(publishStatusLabel({
      gitStatus: status({ upstreamBranch: undefined, actions: { ...status().actions, canPush: false } }),
      wantsPublish: true,
      hasDirtyChanges: false,
    })).toBe("This branch has no upstream yet.");
  });
});

describe("publishWorkflowSummary", () => {
  it("describes an empty pull_request workflow with an existing PR", () => {
    expect(publishWorkflowSummary({
      intent: "pull_request",
      gitStatus: status(),
      existingPr: { title: "x", url: "u", state: "open", number: 1, headBranch: "h", baseBranch: "main", draft: false },
      publishStatus: null,
      workflowSteps: [],
    })).toBe("A pull request already exists for this branch.");
  });

  it("describes the full commit+publish+create-PR sequence", () => {
    const steps: PublishWorkflowStep[] = [
      { kind: "stage", paths: ["a.ts"] },
      { kind: "commit", summary: "x" },
      { kind: "push" },
      { kind: "create_pull_request", request: { title: "x", baseBranch: "main", draft: false } },
    ];
    expect(publishWorkflowSummary({
      intent: "pull_request",
      gitStatus: status(),
      existingPr: null,
      publishStatus: null,
      workflowSteps: steps,
    })).toBe("Stage unstaged changes, commit them, publish the branch, then create a pull request.");
  });

  it("describes updating an existing PR's branch", () => {
    const steps: PublishWorkflowStep[] = [
      { kind: "commit", summary: "x" },
      { kind: "push" },
    ];
    expect(publishWorkflowSummary({
      intent: "pull_request",
      gitStatus: status(),
      existingPr: { title: "x", url: "u", state: "open", number: 1, headBranch: "h", baseBranch: "main", draft: false },
      publishStatus: null,
      workflowSteps: steps,
    })).toBe("Commit changes, then update the existing pull request branch.");
  });
});

describe("publishPrimaryLabel", () => {
  it("labels the full create flow for a dirty branch with no existing PR", () => {
    expect(publishPrimaryLabel({
      intent: "pull_request",
      gitStatus: status(),
      existingPr: null,
      hasDirtyChanges: true,
      workflowSteps: [],
    })).toBe("Commit, publish, create PR");
  });

  it("offers to view an existing PR when there is nothing left to run", () => {
    expect(publishPrimaryLabel({
      intent: "pull_request",
      gitStatus: status({ ahead: 0, actions: { ...status().actions, canPush: false } }),
      existingPr: { title: "x", url: "u", state: "open", number: 1, headBranch: "h", baseBranch: "main", draft: false },
      hasDirtyChanges: false,
      workflowSteps: [],
    })).toBe("View pull request");
  });

  it("labels a commit-only intent as Commit regardless of workflow steps", () => {
    expect(publishPrimaryLabel({
      intent: "commit",
      gitStatus: status(),
      existingPr: null,
      hasDirtyChanges: true,
      workflowSteps: [{ kind: "commit", summary: "x" }],
    })).toBe("Commit");
  });
});
