import { describe, expect, it } from "vitest";
import type { GitStatusSnapshot } from "@anyharness/sdk";
import { defaultPublishPullRequestDraft } from "./mobile-publish-draft";

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

describe("defaultPublishPullRequestDraft", () => {
  it("prefers the git status's suggested base branch", () => {
    const draft = defaultPublishPullRequestDraft({
      gitStatus: status({ suggestedBaseBranch: "develop" }),
      repoDefaultBranch: "main",
    });
    expect(draft).toEqual({ title: "", body: "", baseBranch: "develop", draft: false });
  });

  it("falls back to the repo default branch when git status has none", () => {
    const draft = defaultPublishPullRequestDraft({
      gitStatus: status({ suggestedBaseBranch: undefined }),
      repoDefaultBranch: "develop",
    });
    expect(draft.baseBranch).toBe("develop");
  });

  it("falls back to main when neither source has a branch", () => {
    const draft = defaultPublishPullRequestDraft({
      gitStatus: null,
      repoDefaultBranch: null,
    });
    expect(draft.baseBranch).toBe("main");
  });
});
