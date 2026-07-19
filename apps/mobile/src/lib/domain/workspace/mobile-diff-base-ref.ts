/**
 * Group G — mirrors web's base-ref preference chain for the Diff segment's
 * "Branch" mode. Web's `resolveGitPanelBaseRef`
 * (`product-client/src/lib/domain/workspaces/changes/git-panel-diff.ts`,
 * wired in `hooks/workspaces/derived/use-git-panel-state.ts`) prefers,
 * in order:
 *
 *   1. `repoPreferenceDefaultBranch` — a user override read from
 *      `useRepoPreferencesStore`, keyed by the repo's root path.
 *   2. `repoRootDefaultBranch` — the repo's own default branch, read off
 *      the `RepoRoot` resolved for the active workspace
 *      (`resolveGitPanelWorkspaceContext`).
 *   3. `suggestedBaseBranch` — the harness's best-guess base branch,
 *      returned on `GitStatusSnapshot` (`client.git.getStatus`).
 *
 * `MobileWorkspaceDiffSegment` currently has none of the plumbing behind
 * inputs 1 or 2: this cloud-only mobile client has no repo-preferences
 * store and no `RepoRoot`/`useWorkspaces()` collections query the way
 * web's `use-git-panel-state.ts` does — see `apps/mobile/src/hooks` (no
 * `RepoRoot` type is referenced anywhere under `apps/mobile/src`). Only
 * input 3 (`suggestedBaseBranch`, already on the `useGitStatusQuery` result
 * the segment fetches) is available today. That's the narrow, documented
 * divergence from web: until mobile grows repo-preference and RepoRoot
 * plumbing, Branch-mode diffs against `suggestedBaseBranch` only, same as
 * before this fix — this helper exists so the *precedence itself* is
 * correct and tested now, and wiring the other two inputs later is a
 * call-site change, not a rewrite of this logic.
 */

export interface ResolveMobileDiffBaseRefInput {
  repoPreferenceDefaultBranch?: string | null;
  repoRootDefaultBranch?: string | null;
  suggestedBaseBranch?: string | null;
}

function normalizeBaseRef(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function resolveMobileDiffBaseRef({
  repoPreferenceDefaultBranch,
  repoRootDefaultBranch,
  suggestedBaseBranch,
}: ResolveMobileDiffBaseRefInput): string | null {
  return normalizeBaseRef(repoPreferenceDefaultBranch)
    ?? normalizeBaseRef(repoRootDefaultBranch)
    ?? normalizeBaseRef(suggestedBaseBranch)
    ?? null;
}
