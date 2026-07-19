import type {
  CreatePullRequestRequest,
  CurrentPullRequestResponse,
  GitChangedFile,
  GitStatusSnapshot,
} from "@anyharness/sdk";

/**
 * Row 29 — shared types for the publish workflow, ported VERBATIM from web's
 * `publish-workflow-model.ts`
 * (`product-client/src/lib/domain/workspaces/creation/publish-workflow-model.ts`):
 * same field names, same shapes. Kept as a genuine parity file (rather than
 * trimmed to only what mobile's single fixed "pull_request" flow uses) so
 * `mobile-publish-workflow.ts`'s port of `buildPublishViewState` stays a real
 * line-for-line mirror of web's — mobile's own simplification (fixed intent,
 * no PR-authoring form) lives one layer up, in `mobile-publish-view.ts`'s
 * `buildMobilePublishView`, not here.
 */

export type PublishIntent = "commit" | "publish" | "pull_request";

export interface PublishCommitDraft {
  summary: string;
  includeUnstaged: boolean;
}

export interface PublishPullRequestDraft {
  title: string;
  body: string;
  baseBranch: string;
  draft: boolean;
}

export type PublishWorkflowStep =
  | { kind: "stage"; paths: string[] }
  | { kind: "commit"; summary: string }
  | { kind: "push" }
  | { kind: "create_pull_request"; request: CreatePullRequestRequest };

export interface PublishFileGroups {
  staged: GitChangedFile[];
  partial: GitChangedFile[];
  unstaged: GitChangedFile[];
}

export interface PublishViewState {
  branchName: string | null;
  defaultBaseBranch: string;
  existingPr: NonNullable<CurrentPullRequestResponse["pullRequest"]> | null;
  fileGroups: PublishFileGroups;
  hasPartialFiles: boolean;
  hasStagedChanges: boolean;
  hasUnstagedChanges: boolean;
  partialWarning: string | null;
  publishStatus: string | null;
  summary: string;
  primaryLabel: string;
  disabledReason: string | null;
  workflowSteps: PublishWorkflowStep[];
}

export interface BuildPublishViewStateInput {
  gitStatus: GitStatusSnapshot | null | undefined;
  existingPr: NonNullable<CurrentPullRequestResponse["pullRequest"]> | null;
  runtimeBlockedReason: string | null;
  repoDefaultBranch: string | null;
  initialIntent: PublishIntent;
  commitDraft: PublishCommitDraft;
  pullRequestDraft: PublishPullRequestDraft;
}
