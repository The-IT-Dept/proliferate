import {
  groupPublishFiles,
  partialFileWarning,
} from "./mobile-publish-file-groups";
import {
  publishPrimaryLabel,
  publishStatusLabel,
  publishWorkflowSummary,
} from "./mobile-publish-workflow-labels";
import type {
  BuildPublishViewStateInput,
  PublishViewState,
} from "./mobile-publish-workflow-model";
import {
  buildPublishWorkflowSteps,
  resolvePublishDisabledReason,
  shouldPush,
} from "./mobile-publish-workflow-steps";

/**
 * Row 29 — ported VERBATIM from web's `publish-workflow.ts`
 * (`product-client/src/lib/domain/workspaces/creation/publish-workflow.ts`):
 * same composition of file-groups + steps + labels into one `PublishViewState`.
 * Mobile's fixed-intent, no-PR-form wrapper lives in `mobile-publish-view.ts`
 * — see that file's module doc for what's layered on top of this port.
 */
export function buildPublishViewState(input: BuildPublishViewStateInput): PublishViewState {
  const gitStatus = input.gitStatus ?? null;
  const existingPr = input.existingPr ?? null;
  const defaultBaseBranch = gitStatus?.suggestedBaseBranch?.trim()
    || input.repoDefaultBranch?.trim()
    || "main";
  const fileGroups = groupPublishFiles(gitStatus?.files ?? []);
  const hasPartialFiles = fileGroups.partial.length > 0;
  const hasStagedChanges = fileGroups.staged.length > 0 || fileGroups.partial.length > 0;
  const hasUnstagedChanges = fileGroups.unstaged.length > 0 || fileGroups.partial.length > 0;
  const wantsPr = input.initialIntent === "pull_request";
  const wantsPublish = input.initialIntent === "publish" || wantsPr;
  const summary = input.commitDraft.summary.trim();
  const branchName = gitStatus?.currentBranch?.trim() || null;
  const hasDirtyChanges = hasStagedChanges || hasUnstagedChanges;
  const partialWarning = partialFileWarning(hasPartialFiles, input.commitDraft.includeUnstaged);
  const publishStatus = publishStatusLabel({
    gitStatus,
    wantsPublish,
    hasDirtyChanges,
  });

  const disabledReason = resolvePublishDisabledReason({
    gitStatus,
    runtimeBlockedReason: input.runtimeBlockedReason,
    branchName,
    summary,
    wantsPublish,
    wantsPr,
    hasStagedChanges,
    hasUnstagedChanges,
    includeUnstaged: input.commitDraft.includeUnstaged,
    existingPr,
    pullRequestDraft: input.pullRequestDraft,
  });
  const needsPush = shouldPush({
    gitStatus,
    wantsPublish,
    wantsPr,
    hasDirtyChanges,
  });

  const workflowSteps = disabledReason
    ? []
    : buildPublishWorkflowSteps({
      fileGroups,
      includeUnstaged: input.commitDraft.includeUnstaged,
      summary,
      wantsPublish,
      wantsPr,
      needsPush,
      existingPr,
      pullRequestDraft: input.pullRequestDraft,
      hasStagedChanges,
      hasUnstagedChanges,
    });

  return {
    branchName,
    defaultBaseBranch,
    existingPr,
    fileGroups,
    hasPartialFiles,
    hasStagedChanges,
    hasUnstagedChanges,
    partialWarning,
    publishStatus,
    summary: publishWorkflowSummary({
      intent: input.initialIntent,
      gitStatus,
      existingPr,
      publishStatus,
      workflowSteps,
    }),
    primaryLabel: publishPrimaryLabel({
      intent: input.initialIntent,
      gitStatus,
      existingPr,
      hasDirtyChanges,
      workflowSteps,
    }),
    disabledReason,
    workflowSteps,
  };
}
