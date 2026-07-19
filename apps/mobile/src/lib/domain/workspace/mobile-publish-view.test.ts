import { describe, expect, it } from "vitest";
import type { GitChangedFile, GitStatusSnapshot } from "@anyharness/sdk";
import {
  buildMobilePublishView,
  deriveMobilePullRequestTitle,
} from "./mobile-publish-view";

// Mobile-only wrapper over the ported `buildPublishViewState`
// (`mobile-publish-workflow.ts`): fixes intent to "pull_request" (mobile has
// no intent tabs — see the module doc in `mobile-publish-view.ts`), derives
// a PR title from the commit message (mobile has no PR-authoring form), and
// requires a non-blank commit message since mobile doesn't wire the
// AI-magic "leave blank to generate" behavior web's workflow hook has.
function file(path: string, includedState: GitChangedFile["includedState"]): GitChangedFile {
  return {
    path,
    oldPath: undefined,
    status: "modified",
    additions: 1,
    deletions: 1,
    binary: false,
    includedState,
  };
}

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
    files: [file("src/app.ts", "included")],
    ...overrides,
  };
}

const EXISTING_PR = {
  title: "Existing",
  url: "https://github.test/pr/1",
  state: "open" as const,
  number: 1,
  headBranch: "feature/demo",
  baseBranch: "main",
  draft: false,
};

describe("deriveMobilePullRequestTitle", () => {
  it("uses the commit summary's first line", () => {
    expect(deriveMobilePullRequestTitle("Fix the bug\n\nLonger body text.", "feature/demo")).toBe("Fix the bug");
  });

  it("trims the first line", () => {
    expect(deriveMobilePullRequestTitle("  Fix the bug  ", null)).toBe("Fix the bug");
  });

  it("falls back to the branch name when the summary is blank", () => {
    expect(deriveMobilePullRequestTitle("   ", "feature/demo")).toBe("Update feature/demo");
  });

  it("falls back to a generic title when there is neither a summary nor a branch", () => {
    expect(deriveMobilePullRequestTitle("", null)).toBe("Update branch");
  });
});

describe("buildMobilePublishView", () => {
  it("fixes the intent to pull_request (commit, publish, create PR when dirty with no existing PR)", () => {
    const view = buildMobilePublishView({
      gitStatus: status(),
      existingPr: null,
      repoDefaultBranch: null,
      runtimeBlockedReason: null,
      commitDraft: { summary: "Update app", includeUnstaged: false },
    });
    expect(view.primaryLabel).toBe("Commit, publish, create PR");
    expect(view.workflowSteps.map((step) => step.kind)).toEqual(["commit", "push", "create_pull_request"]);
  });

  it("blocks submit with a mobile-specific reason when the commit message is blank", () => {
    const view = buildMobilePublishView({
      gitStatus: status(),
      existingPr: null,
      repoDefaultBranch: null,
      runtimeBlockedReason: null,
      commitDraft: { summary: "   ", includeUnstaged: false },
    });
    expect(view.disabledReason).toBe("Enter a commit message.");
    expect(view.workflowSteps).toEqual([]);
  });

  it("does not require a commit message when there are no dirty changes to commit", () => {
    const view = buildMobilePublishView({
      gitStatus: status({
        clean: true,
        files: [],
        ahead: 1,
        actions: { ...status().actions, canPush: true, pushLabel: "Push" },
      }),
      // An existing PR keeps this a push-only "update the PR branch" case —
      // isolates "no commit needed" from "a PR title is derived", which is
      // covered separately below.
      existingPr: EXISTING_PR,
      repoDefaultBranch: null,
      runtimeBlockedReason: null,
      commitDraft: { summary: "", includeUnstaged: false },
    });
    expect(view.disabledReason).toBeNull();
    expect(view.workflowSteps).toEqual([{ kind: "push" }]);
  });

  it("preserves a higher-precedence disabled reason over the blank-message guard", () => {
    const view = buildMobilePublishView({
      gitStatus: status({ conflicted: true }),
      existingPr: null,
      repoDefaultBranch: null,
      runtimeBlockedReason: null,
      commitDraft: { summary: "", includeUnstaged: false },
    });
    expect(view.disabledReason).toBe("Resolve conflicts before publishing.");
  });

  it("derives the create-PR request title from the commit message", () => {
    const view = buildMobilePublishView({
      gitStatus: status(),
      existingPr: null,
      repoDefaultBranch: null,
      runtimeBlockedReason: null,
      commitDraft: { summary: "Fix the flaky test\n\nDetails here.", includeUnstaged: false },
    });
    const createStep = view.workflowSteps.find((step) => step.kind === "create_pull_request");
    expect(createStep).toMatchObject({ request: { title: "Fix the flaky test" } });
  });

  it("marks viewsExistingPrOnly when there is nothing left to run but an existing PR", () => {
    const view = buildMobilePublishView({
      gitStatus: status({
        clean: true,
        files: [],
        actions: { ...status().actions, canPush: false },
      }),
      existingPr: EXISTING_PR,
      repoDefaultBranch: null,
      runtimeBlockedReason: null,
      commitDraft: { summary: "", includeUnstaged: false },
    });
    expect(view.viewsExistingPrOnly).toBe(true);
    expect(view.primaryLabel).toBe("View pull request");
  });

  it("does not mark viewsExistingPrOnly when dirty changes still need publishing", () => {
    const view = buildMobilePublishView({
      gitStatus: status(),
      existingPr: EXISTING_PR,
      repoDefaultBranch: null,
      runtimeBlockedReason: null,
      commitDraft: { summary: "Update app", includeUnstaged: false },
    });
    expect(view.viewsExistingPrOnly).toBe(false);
  });

  describe("showEntryPoint", () => {
    it("is false on a clean, already-published branch with no PR possible", () => {
      const view = buildMobilePublishView({
        gitStatus: status({
          clean: true,
          files: [],
          ahead: 0,
          actions: { ...status().actions, canPush: false, canCreatePullRequest: false },
        }),
        existingPr: null,
        repoDefaultBranch: null,
        runtimeBlockedReason: null,
        commitDraft: { summary: "", includeUnstaged: false },
      });
      expect(view.showEntryPoint).toBe(false);
    });

    it("is true when there are dirty changes", () => {
      const view = buildMobilePublishView({
        gitStatus: status(),
        existingPr: null,
        repoDefaultBranch: null,
        runtimeBlockedReason: null,
        commitDraft: { summary: "", includeUnstaged: false },
      });
      expect(view.showEntryPoint).toBe(true);
    });

    it("is true when the branch is ahead of its upstream", () => {
      const view = buildMobilePublishView({
        gitStatus: status({ clean: true, files: [], ahead: 2 }),
        existingPr: null,
        repoDefaultBranch: null,
        runtimeBlockedReason: null,
        commitDraft: { summary: "", includeUnstaged: false },
      });
      expect(view.showEntryPoint).toBe(true);
    });

    it("is true when there is an existing PR to view", () => {
      const view = buildMobilePublishView({
        gitStatus: status({
          clean: true,
          files: [],
          actions: { ...status().actions, canPush: false },
        }),
        existingPr: EXISTING_PR,
        repoDefaultBranch: null,
        runtimeBlockedReason: null,
        commitDraft: { summary: "", includeUnstaged: false },
      });
      expect(view.showEntryPoint).toBe(true);
    });

    it("is false while git status has not loaded yet", () => {
      const view = buildMobilePublishView({
        gitStatus: null,
        existingPr: null,
        repoDefaultBranch: null,
        runtimeBlockedReason: null,
        commitDraft: { summary: "", includeUnstaged: false },
      });
      expect(view.showEntryPoint).toBe(false);
    });
  });
});
