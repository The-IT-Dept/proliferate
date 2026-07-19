const DAY_MS = 24 * 60 * 60 * 1000;

export type MobileWorkRecencyBucketId = "today" | "yesterday" | "this_week" | "this_month" | "older";

export interface MobileWorkRecencyBucketDefinition {
  id: MobileWorkRecencyBucketId;
  label: string;
  maxAgeMs: number;
}

/**
 * Mirrors `RECENCY_BUCKETS` in product-client's `WorkspacesPage`
 * (apps/packages/product-client/src/pages/WorkspacesPage.tsx) — the web
 * workspaces-list this mobile screen is parity-mapped to (IA row 7:
 * "WorkspacesPage (recency command list) -> Workspaces tab"). Boundaries and
 * labels are verbatim; do not add/rename/reorder buckets without re-checking
 * that source, since it's the single spec for "recent" on this surface.
 */
export const MOBILE_WORK_RECENCY_BUCKETS: readonly MobileWorkRecencyBucketDefinition[] = [
  { id: "today", label: "Today", maxAgeMs: DAY_MS },
  { id: "yesterday", label: "Yesterday", maxAgeMs: 2 * DAY_MS },
  { id: "this_week", label: "This week", maxAgeMs: 7 * DAY_MS },
  { id: "this_month", label: "This month", maxAgeMs: 30 * DAY_MS },
  { id: "older", label: "Older", maxAgeMs: Number.POSITIVE_INFINITY },
];

export function mobileWorkRecencyBucketForTime(timeMs: number, nowMs: number): MobileWorkRecencyBucketId {
  const ageMs = nowMs - timeMs;
  const bucket = MOBILE_WORK_RECENCY_BUCKETS.find((candidate) => ageMs < candidate.maxAgeMs)
    ?? MOBILE_WORK_RECENCY_BUCKETS[MOBILE_WORK_RECENCY_BUCKETS.length - 1];
  return bucket.id;
}

export interface MobileWorkRecencyGroup<T> {
  id: MobileWorkRecencyBucketId;
  label: string;
  items: T[];
}

/**
 * Buckets `items` by recency (today/yesterday/this week/this month/older),
 * dropping empty buckets and keeping bucket display order. Each bucket keeps
 * the relative order items arrived in — callers are expected to hand in an
 * already recency-sorted list (as `useMobileWorkInventory` does), so this
 * only partitions, it never re-sorts.
 */
export function groupByMobileWorkRecency<T>(
  items: readonly T[],
  getTimestampMs: (item: T) => number,
  nowMs: number = Date.now(),
): MobileWorkRecencyGroup<T>[] {
  const buckets = new Map<MobileWorkRecencyBucketId, T[]>();
  for (const item of items) {
    const bucketId = mobileWorkRecencyBucketForTime(getTimestampMs(item), nowMs);
    const existing = buckets.get(bucketId);
    if (existing) {
      existing.push(item);
    } else {
      buckets.set(bucketId, [item]);
    }
  }
  return MOBILE_WORK_RECENCY_BUCKETS.flatMap((bucket) => {
    const groupItems = buckets.get(bucket.id);
    return groupItems && groupItems.length > 0
      ? [{ id: bucket.id, label: bucket.label, items: groupItems }]
      : [];
  });
}
