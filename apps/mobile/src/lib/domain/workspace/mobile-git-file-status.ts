import type { GitFileStatus } from "@anyharness/sdk";
import type { MobileIconName } from "../../../components/primitives/MobileIcon";

/**
 * Group G — per-file status presentation for the Diff segment's changes
 * list (mockup H). `GitFileStatus` (`anyharness/sdk/src/types/git.ts`,
 * generated from the OpenAPI `GitFileStatus` enum: "modified" | "added" |
 * "deleted" | "renamed" | "copied" | "untracked" | "conflicted") has no
 * rendered text label anywhere on the web client — `FileDiffCard`
 * (`product-client/src/components/content/ui/FileDiffCard.tsx`), the only
 * web component that renders a changed-file row, shows just the path and
 * +N/-N stats; it never prints "Modified"/"Added"/etc, and the mockup H
 * file-list rows use icon color alone (no status word) too. So there is no
 * verbatim web STRING to copy here — same situation `terminal-status.ts`
 * documents for `TerminalStatus`. This mirrors that precedent: Title-case
 * the raw SDK enum value for the row label (mobile has no hover state to
 * fall back on the way FileDiffCard's stats-only row can), and reuse the raw
 * enum value itself verbatim as the vocabulary (never invent new status
 * names).
 */

export type GitFileStatusTone = "positive" | "caution" | "danger" | "neutral";

export interface GitFileStatusPresentation {
  label: string;
  icon: MobileIconName;
  tone: GitFileStatusTone;
}

const GIT_FILE_STATUS_PRESENTATION: Record<GitFileStatus, GitFileStatusPresentation> = {
  added: { label: "Added", icon: "plus", tone: "positive" },
  untracked: { label: "Untracked", icon: "plus", tone: "positive" },
  modified: { label: "Modified", icon: "pencil", tone: "caution" },
  deleted: { label: "Deleted", icon: "trash", tone: "danger" },
  conflicted: { label: "Conflicted", icon: "close", tone: "danger" },
  renamed: { label: "Renamed", icon: "chevron-right", tone: "neutral" },
  copied: { label: "Copied", icon: "copy", tone: "neutral" },
};

export function gitFileStatusPresentation(status: GitFileStatus): GitFileStatusPresentation {
  return GIT_FILE_STATUS_PRESENTATION[status];
}
