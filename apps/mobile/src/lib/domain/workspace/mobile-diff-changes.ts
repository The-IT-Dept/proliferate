import type { GitChangedFile, GitDiffFile } from "@anyharness/sdk";

/**
 * Group G — the Diff segment's changes-list model (mockup H file list) and
 * mode switcher (mockup H top pills: "Working tree" / "Branch" / "Last
 * turn"). Normalizes the two shapes `client.git` returns changed files as
 * (`GitChangedFile` from `getStatus`, `GitDiffFile` from
 * `listBranchDiffFiles`) into one row model, mirroring web's `toPanelFile`
 * (`product-client/src/lib/domain/workspaces/changes/git-panel-diff.ts`):
 * same rename `displayPath` format ("old.ts -> new.ts"), same
 * `.claude/worktrees/` housekeeping-path filter. Adds one mobile-only
 * behavior on top — a deterministic alphabetical sort by path, since the
 * scrollable card here (unlike web's virtualized/grouped review pane) has no
 * other ordering affordance and a stable scan order matters more on a phone.
 *
 * Mode labels/empty-copy are VERBATIM from web's `GIT_PANEL_MODE_OPTIONS`/
 * `gitPanelEmptyMessage` (same file) — but only two of its three modes:
 * "Last turn" ties to a specific chat turn's transcript (Group E territory,
 * out of scope for G, which owns only the standalone workspace Diff
 * surface) so it's dropped here rather than half-wired against no data
 * source.
 */

export interface MobileChangedFile {
  key: string;
  path: string;
  oldPath: string | null;
  displayPath: string;
  status: GitChangedFile["status"];
  additions: number;
  deletions: number;
  binary: boolean;
}

function isVisibleGitChangePath(path: string): boolean {
  return path.length > 0 && !path.startsWith(".claude/worktrees/");
}

function toMobileChangedFile(file: GitChangedFile | GitDiffFile): MobileChangedFile {
  const oldPath = file.oldPath ?? null;
  const displayPath = oldPath ? `${oldPath} -> ${file.path}` : file.path;
  return {
    key: `${oldPath ?? ""}:${file.path}:${file.status}`,
    path: file.path,
    oldPath,
    displayPath,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    binary: file.binary,
  };
}

export function buildMobileChangesList(
  files: readonly (GitChangedFile | GitDiffFile)[],
): MobileChangedFile[] {
  return files
    .filter((file) => isVisibleGitChangePath(file.path))
    .map(toMobileChangedFile)
    .sort((a, b) => a.path.localeCompare(b.path));
}

export interface MobileChangesTotals {
  files: number;
  additions: number;
  deletions: number;
}

export function summarizeMobileChanges(
  files: readonly MobileChangedFile[],
): MobileChangesTotals {
  return files.reduce(
    (totals, file) => ({
      files: totals.files + 1,
      additions: totals.additions + file.additions,
      deletions: totals.deletions + file.deletions,
    }),
    { files: 0, additions: 0, deletions: 0 },
  );
}

export type MobileDiffMode = "working_tree" | "branch";

export const MOBILE_DIFF_MODE_OPTIONS: { id: MobileDiffMode; label: string }[] = [
  { id: "working_tree", label: "Working tree" },
  { id: "branch", label: "Branch" },
];

export function mobileDiffModeEmptyMessage(mode: MobileDiffMode): string {
  return mode === "working_tree" ? "Working tree clean" : "No branch changes";
}
