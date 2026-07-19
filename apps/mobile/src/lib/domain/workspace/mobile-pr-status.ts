import type {
  PullRequestChecksState,
  PullRequestReviewDecision,
  PullRequestState,
} from "@anyharness/sdk";

/**
 * Group G — PR status badge kind/label/tone for the Diff segment's PR row
 * (mockup H: "PR badge with the hollow 'Checks pending' ring"). The seven
 * kinds and their labels are VERBATIM from the web `PrStatusBadge`
 * (`apps/packages/product-ui/src/workspaces/PrStatusBadge.tsx`,
 * `PrStatusKind`/`PR_STATUS_LABEL`) — same names, same seven-way split
 * (open / checks_failing / pending / changes_requested / draft / merged /
 * closed), same tone rules (§3.3 there: every tone opaque, pending is the
 * one hollow/outline state, merged gets its own GitHub-convention purple
 * rather than `info`).
 *
 * `prStatusKindFromSummary` takes the raw SDK shape (`PullRequestSummary`'s
 * `state: "open"|"closed"|"merged"` + separate `draft: boolean`, optionally
 * widened with `BranchPullRequestSummary`'s `checks`/`reviewDecision`) and
 * reproduces the same precedence web's `prStatusKind()`
 * (`product-client/src/lib/domain/workspaces/git-status/pr-status-presentation.ts`)
 * applies to its already-collapsed `WorkspacePrStatus.state` (which folds
 * `draft` into the state enum before that function ever runs): merged/closed
 * win outright; an open+draft PR is always "draft" regardless of
 * checks/review; only a genuinely open, non-draft PR branches further on
 * checks (failing > pending) then review decision.
 */

export type PrStatusKind =
  | "open"
  | "checks_failing"
  | "pending"
  | "changes_requested"
  | "draft"
  | "merged"
  | "closed";

export interface PrStatusSummaryInput {
  state: PullRequestState;
  draft: boolean;
  /** Only present on `BranchPullRequestSummary` (the repo-root PR-statuses
   * feed) — absent/null on the plain `PullRequestSummary` the workspace-scoped
   * `getCurrent` endpoint returns. Absent is treated as "no signal", same as
   * `"none"`. */
  checks?: PullRequestChecksState | null;
  reviewDecision?: PullRequestReviewDecision | null;
}

const PR_STATUS_LABEL: Record<PrStatusKind, string> = {
  open: "Open",
  checks_failing: "Checks failing",
  pending: "Checks pending",
  changes_requested: "Changes requested",
  draft: "Draft",
  merged: "Merged",
  closed: "Closed",
};

/** Semantic tone token — the screen layer maps this to an actual color,
 * same split as terminal-status.ts's `TerminalStatusTone`. `pendingOutline`
 * and `warningFill` are kept distinct (never collapsed to one "warning")
 * because the web spec makes that exact distinction: pending is a hollow
 * ring, changes-requested is a filled dot. */
export type PrStatusTone =
  | "success"
  | "danger"
  | "pendingOutline"
  | "warningFill"
  | "muted"
  | "merged";

const PR_STATUS_TONE: Record<PrStatusKind, PrStatusTone> = {
  open: "success",
  checks_failing: "danger",
  pending: "pendingOutline",
  changes_requested: "warningFill",
  draft: "muted",
  merged: "merged",
  closed: "danger",
};

export function prStatusKindFromSummary(pr: PrStatusSummaryInput): PrStatusKind {
  if (pr.state === "merged") {
    return "merged";
  }
  if (pr.state === "closed") {
    return "closed";
  }
  if (pr.draft) {
    return "draft";
  }
  if (pr.checks === "failing") {
    return "checks_failing";
  }
  if (pr.checks === "pending") {
    return "pending";
  }
  if (pr.reviewDecision === "changes_requested") {
    return "changes_requested";
  }
  return "open";
}

export function prStatusLabel(kind: PrStatusKind): string {
  return PR_STATUS_LABEL[kind];
}

export function prStatusTone(kind: PrStatusKind): PrStatusTone {
  return PR_STATUS_TONE[kind];
}

/**
 * "#482 · Checks pending" — the mobile badge's inline text. Web never
 * renders this as visible text (`PrStatusDot` is a bare colored dot; the
 * compound "PR #482 · Open · Checks failing" string only ever appears in a
 * hover tooltip/aria-label via `prStatusTooltip`/`prStatusCompoundLabel`).
 * Mobile has no hover state, so mockup H inlines the number + state text
 * next to the dot instead — this reproduces exactly what's drawn there
 * (no "PR" prefix, no extra checks/review segments), not the longer hover
 * string.
 */
export function prStatusBadgeText(kind: PrStatusKind, number: number | null): string {
  const label = prStatusLabel(kind);
  return typeof number === "number" ? `#${number} · ${label}` : label;
}
