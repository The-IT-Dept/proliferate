import type { CurrentPullRequestResponse, GitStatusSnapshot } from "@anyharness/sdk";
import { defaultPublishPullRequestDraft } from "./mobile-publish-draft";
import { buildPublishViewState } from "./mobile-publish-workflow";
import type {
  PublishCommitDraft,
  PublishPullRequestDraft,
  PublishViewState,
} from "./mobile-publish-workflow-model";

/**
 * Row 29 — mobile's single fixed publish flow, layered over the verbatim
 * `buildPublishViewState` port (`mobile-publish-workflow.ts`). Two
 * deliberate divergences from web's `PublishDialog`, both because mobile has
 * no intent-tab UI and no PR-authoring form (scope: "select which changed
 * files to include, a commit message input, and the publish action that
 * commits + pushes and creates/updates a PR" — no separate commit-only or
 * publish-only mode, no PR title/body/base-branch fields):
 *
 * 1. `initialIntent` is always `"pull_request"`. That single web intent
 *    already covers exactly "commit + push + create/update PR": when there's
 *    no existing PR the derived `workflowSteps` end with a
 *    `create_pull_request` step; when a PR already exists, the same intent's
 *    `wantsPr`/`wantsPublish` combination naturally drops that step and
 *    leaves just commit+push (i.e. "update" the PR branch) — see
 *    `publish-workflow.ts`'s `buildPublishWorkflowSteps`. No separate
 *    "commit only" / "publish only" surfaces are exposed.
 * 2. The PR title web collects from a form field is derived here instead
 *    (`deriveMobilePullRequestTitle`, from the commit message's first line,
 *    falling back to the branch name) — see that function's doc comment.
 *
 * On top of that, this also requires a non-blank commit message whenever
 * there are dirty changes: web's `resolvePublishDisabledReason` allows a
 * blank summary because `use-workspace-publish-workflow`'s `submit()`
 * generates one from the pending diff via AI magic
 * (`generateCommitMessage`/`fetchGitDiffPatches`) before running the
 * workflow. Mobile does not wire that generation path (flagged as a
 * follow-up, not a regression — see the publish-workflow test file's note on
 * `buildPublishViewState`'s own "blank summary stays submittable" case,
 * which is intentionally left as-is at that layer), so it blocks submit with
 * an explicit "Enter a commit message." reason instead of silently sending
 * an empty summary to `client.git.commit`.
 */

export interface MobilePublishViewInput {
  gitStatus: GitStatusSnapshot | null | undefined;
  existingPr: NonNullable<CurrentPullRequestResponse["pullRequest"]> | null;
  repoDefaultBranch: string | null;
  runtimeBlockedReason: string | null;
  commitDraft: PublishCommitDraft;
}

export interface MobilePublishView extends PublishViewState {
  /** Nothing left to run — the primary action just opens the existing PR
   * (mirrors `PublishDialog`'s `primaryActionViewsExistingPr`, minus the
   * `intent === "pull_request"` check since mobile's intent is always
   * fixed). */
  viewsExistingPrOnly: boolean;
  /** Whether the Diff surface's publish entry point (dock button) should
   * render at all — there's dirty working-tree state, unpushed commits, a
   * push-ready clean branch, a creatable PR, or an existing PR to view. */
  showEntryPoint: boolean;
}

/** PR title web collects via a form field; mobile has none, so it's derived
 * from the commit message's first line (trimmed), falling back to the
 * current branch name, and finally a generic placeholder — always non-blank
 * so `resolvePublishDisabledReason`'s "Enter a pull request title." branch
 * never fires on mobile. */
export function deriveMobilePullRequestTitle(commitSummary: string, branchName: string | null): string {
  const firstLine = commitSummary.trim().split("\n")[0]?.trim() ?? "";
  if (firstLine) return firstLine;
  if (branchName) return `Update ${branchName}`;
  return "Update branch";
}

export function buildMobilePublishView(input: MobilePublishViewInput): MobilePublishView {
  const gitStatus = input.gitStatus ?? null;
  const branchName = gitStatus?.currentBranch?.trim() || null;

  const pullRequestDraft: PublishPullRequestDraft = {
    ...defaultPublishPullRequestDraft({ gitStatus, repoDefaultBranch: input.repoDefaultBranch }),
    title: deriveMobilePullRequestTitle(input.commitDraft.summary, branchName),
  };

  const base = buildPublishViewState({
    gitStatus,
    existingPr: input.existingPr,
    runtimeBlockedReason: input.runtimeBlockedReason,
    repoDefaultBranch: input.repoDefaultBranch,
    initialIntent: "pull_request",
    commitDraft: input.commitDraft,
    pullRequestDraft,
  });

  const hasDirtyChanges = base.hasStagedChanges || base.hasUnstagedChanges;
  const needsCommitMessage = hasDirtyChanges && !input.commitDraft.summary.trim();
  const blankMessageBlocked = !base.disabledReason && needsCommitMessage;
  const disabledReason = blankMessageBlocked ? "Enter a commit message." : base.disabledReason;
  const workflowSteps = blankMessageBlocked ? [] : base.workflowSteps;

  const viewsExistingPrOnly = Boolean(
    base.existingPr && !hasDirtyChanges && base.workflowSteps.length === 0,
  );

  const showEntryPoint = Boolean(
    gitStatus
    && (
      hasDirtyChanges
      || gitStatus.ahead > 0
      || gitStatus.actions.canPush
      || base.existingPr
      || gitStatus.actions.canCreatePullRequest
    ),
  );

  return {
    ...base,
    disabledReason,
    workflowSteps,
    viewsExistingPrOnly,
    showEntryPoint,
  };
}
