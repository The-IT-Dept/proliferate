import type { GitChangedFile } from "@anyharness/sdk";
import type { PublishFileGroups } from "./mobile-publish-workflow-model";

/**
 * Row 29 — ported VERBATIM from web's `publish-file-groups.ts`
 * (`product-client/src/lib/domain/workspaces/creation/publish-file-groups.ts`):
 * same grouping rule (staged / partial / unstaged by `includedState`), same
 * `.claude/worktrees/` housekeeping-path filter (shared with Group G's
 * `mobile-diff-changes.ts`), same two warning strings verbatim.
 */

const PARTIAL_WARNING =
  "Including unstaged changes will also include all unstaged hunks in partially staged files.";
const PARTIAL_STAGED_ONLY_WARNING =
  "Partially staged files can show combined file totals; with Include unstaged off, only staged hunks are committed.";

export function partialFileWarning(hasPartialFiles: boolean, includeUnstaged: boolean): string | null {
  if (!hasPartialFiles) return null;
  return includeUnstaged ? PARTIAL_WARNING : PARTIAL_STAGED_ONLY_WARNING;
}

export function groupPublishFiles(files: GitChangedFile[]): PublishFileGroups {
  const publishable = files.filter((file) =>
    file.path.length > 0 && !file.path.startsWith(".claude/worktrees/")
  );
  return {
    staged: publishable.filter((file) => file.includedState === "included"),
    partial: publishable.filter((file) => file.includedState === "partial"),
    unstaged: publishable.filter((file) => file.includedState === "excluded"),
  };
}
