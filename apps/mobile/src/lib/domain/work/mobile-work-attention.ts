import type {
  CloudWorkItemView,
  CloudWorkStatusFilter,
  RecentWorkStatusIndicatorView,
} from "@proliferate/product-domain/workspaces/cloud-work-inventory";

export type MobileWorkAttentionFacts = Pick<CloudWorkItemView, "unclaimed"> & {
  status: CloudWorkStatusFilter;
  statusIndicator: Pick<RecentWorkStatusIndicatorView, "kind">;
};

/**
 * Mirrors `cloudWorkItemNeedsAttention` in
 * apps/packages/product-domain/src/workspaces/cloud-work-filters.ts — the
 * same "needs attention" predicate that already drives the app's existing
 * `needsAttention` filter pill (blocked, unclaimed-shared, or a session
 * waiting on input). Not re-exported from that package's public subpath, so
 * this is a deliberate, documented mirror rather than a competing
 * definition — keep the two in sync if either changes.
 */
export function mobileWorkItemNeedsAttention(item: MobileWorkAttentionFacts): boolean {
  return item.status === "blocked"
    || item.unclaimed
    || item.statusIndicator.kind === "needs_input";
}

/** Aggregate count of workspaces needing attention — the pending-interaction
 * queue depth the Workspaces tab badge (IA: "badge = pending-interaction
 * count") is meant to show. Wiring the native tab badge itself is nav-layout
 * territory (app/(tabs)/_layout.tsx), out of this screen's scope; this
 * derivation is the reusable interface for whichever group wires it. */
export function deriveMobileWorkAttentionCount(
  items: readonly MobileWorkAttentionFacts[],
): number {
  return items.reduce((count, item) => count + (mobileWorkItemNeedsAttention(item) ? 1 : 0), 0);
}
