import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import {
  useCommitGitMutation,
  useCreatePullRequestMutation,
  useCurrentPullRequestQuery,
  useGitStatusQuery,
  usePushGitMutation,
  useStageGitPathsMutation,
} from "@anyharness/sdk-react";

import { useMobileToast } from "../../../providers/MobileToastProvider";
import {
  buildMobilePublishView,
  type MobilePublishView,
} from "../../../lib/domain/workspace/mobile-publish-view";
import {
  INITIAL_PUBLISH_RUN_STATE,
  publishRunReducer,
  type PublishRunPhase,
} from "../../../lib/domain/workspace/mobile-publish-run-state";
import { runMobilePublishWorkflow } from "../../../lib/domain/workspace/mobile-publish-workflow-runner";
import type { PublishCommitDraft } from "../../../lib/domain/workspace/mobile-publish-workflow-model";

const EMPTY_COMMIT_DRAFT: PublishCommitDraft = { summary: "", includeUnstaged: false };

/**
 * Row 29 — wires the real `@anyharness/sdk-react` git/PR hooks
 * (`useGitStatusQuery`, `useCurrentPullRequestQuery`,
 * `useStageGitPathsMutation`, `useCommitGitMutation`, `usePushGitMutation`,
 * `useCreatePullRequestMutation` — all exist already, none hand-rolled) to
 * the pure `buildMobilePublishView`/`runMobilePublishWorkflow` domain logic.
 * Mirrors web's `useWorkspacePublishWorkflow`
 * (`product-client/src/hooks/workspaces/workflows/use-workspace-publish-workflow.ts`)
 * shape — draft state + a `submit()` that runs the ordered steps and
 * refetches on completion — minus the AI-magic commit-message generation and
 * the multi-intent/PR-authoring-form state that hook also owns (see
 * `mobile-publish-view.ts`'s module doc for why those are out of scope here).
 *
 * No optimistic updates: `useCommitGitMutation`/`usePushGitMutation`/
 * `useCreatePullRequestMutation` already invalidate the git-status/PR query
 * keys on success (`anyharness/sdk-react/src/hooks/git.ts`,
 * `pull-requests.ts`), and this hook's own `Promise.allSettled` refetch in
 * `submit()`'s `finally` (mirroring web's) makes sure the Diff surface's
 * changes list and PR badge are showing real server state by the time the
 * sheet closes, not a guessed one. Failures toast
 * (`useMobileToast`); they never get silently swallowed into a stale view.
 */
export function useMobilePublishWorkflow() {
  const [commitDraft, setCommitDraft] = useState<PublishCommitDraft>(EMPTY_COMMIT_DRAFT);
  const [runState, dispatch] = useReducer(publishRunReducer, INITIAL_PUBLISH_RUN_STATE);
  const runningRef = useRef(false);
  const toast = useMobileToast();

  const statusQuery = useGitStatusQuery();
  const currentBranch = statusQuery.data?.currentBranch?.trim();
  const prQuery = useCurrentPullRequestQuery({ enabled: !!currentBranch });

  const stageMutation = useStageGitPathsMutation();
  const commitMutation = useCommitGitMutation();
  const pushMutation = usePushGitMutation();
  const createPullRequestMutation = useCreatePullRequestMutation();

  const view: MobilePublishView = useMemo(
    () => buildMobilePublishView({
      gitStatus: statusQuery.data,
      existingPr: prQuery.data?.pullRequest ?? null,
      // Mobile has no repo-preferences store / RepoRoot query yet — same
      // documented gap as Group G's `resolveMobileDiffBaseRef`
      // (`mobile-diff-base-ref.ts`) — so only `gitStatus.suggestedBaseBranch`
      // feeds the base-branch fallback, never a repo-level default.
      repoDefaultBranch: null,
      runtimeBlockedReason: null,
      commitDraft,
    }),
    [commitDraft, prQuery.data?.pullRequest, statusQuery.data],
  );

  const reset = useCallback(() => {
    setCommitDraft(EMPTY_COMMIT_DRAFT);
    dispatch({ type: "reset" });
  }, []);

  const submit = useCallback(async (): Promise<boolean> => {
    if (runningRef.current) {
      return false;
    }
    if (view.disabledReason) {
      // Defensive only — the sheet's primary action is disabled whenever
      // `view.disabledReason` is set, so this guards a double-invocation
      // rather than a real user-facing failure; nothing to toast.
      return false;
    }
    runningRef.current = true;
    let completed = false;
    try {
      await runMobilePublishWorkflow(
        view.workflowSteps,
        {
          stagePaths: (paths) => stageMutation.mutateAsync(paths),
          commit: (input) => commitMutation.mutateAsync(input),
          push: () => pushMutation.mutateAsync({}),
          createPullRequest: (input) => createPullRequestMutation.mutateAsync(input),
        },
        dispatch,
      );
      dispatch({ type: "completed" });
      completed = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to publish.";
      dispatch({ type: "failed", message });
      toast.show({ tone: "error", message });
    } finally {
      await Promise.allSettled([
        statusQuery.refetch(),
        currentBranch ? prQuery.refetch() : Promise.resolve(),
      ]);
      runningRef.current = false;
    }
    if (completed) {
      setCommitDraft(EMPTY_COMMIT_DRAFT);
    }
    return completed;
  }, [
    commitMutation,
    createPullRequestMutation,
    currentBranch,
    prQuery,
    pushMutation,
    stageMutation,
    statusQuery,
    toast,
    view.disabledReason,
    view.workflowSteps,
  ]);

  const phase: PublishRunPhase = runState.phase;
  const isSubmitting = phase === "committing" || phase === "pushing" || phase === "creatingPr";

  const retry = useCallback(() => {
    void statusQuery.refetch();
    if (currentBranch) {
      void prQuery.refetch();
    }
  }, [currentBranch, prQuery, statusQuery]);

  return {
    view,
    isLoading: statusQuery.isLoading || (!!currentBranch && prQuery.isLoading),
    // A query failure (not just "still loading") gets its own inline
    // "Couldn't load / tap to retry" state in the sheet (same idiom as
    // `MobileWorkspaceDiffSegment`'s list/diff error states) rather than
    // falling through to `view.disabledReason`'s generic "Git status is
    // still loading." text, which would be misleading once the query has
    // actually settled into an error.
    isError: statusQuery.isError || (!!currentBranch && prQuery.isError),
    retry,
    isSubmitting,
    phase,
    runError: runState.error,
    commitSummary: commitDraft.summary,
    includeUnstaged: commitDraft.includeUnstaged,
    setCommitSummary: useCallback((summary: string) => {
      setCommitDraft((draft) => ({ ...draft, summary }));
    }, []),
    setIncludeUnstaged: useCallback((includeUnstaged: boolean) => {
      setCommitDraft((draft) => ({ ...draft, includeUnstaged }));
    }, []),
    submit,
    reset,
  };
}

export type MobilePublishWorkflow = ReturnType<typeof useMobilePublishWorkflow>;
