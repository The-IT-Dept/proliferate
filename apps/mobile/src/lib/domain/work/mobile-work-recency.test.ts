import { describe, expect, it } from "vitest";

import {
  groupByMobileWorkRecency,
  mobileWorkRecencyBucketForTime,
  MOBILE_WORK_RECENCY_BUCKETS,
} from "./mobile-work-recency";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 6, 19, 12, 0, 0);

describe("mobileWorkRecencyBucketForTime", () => {
  it("buckets an item from a few minutes ago as today", () => {
    expect(mobileWorkRecencyBucketForTime(NOW - 5 * 60 * 1000, NOW)).toBe("today");
  });

  it("buckets an item just under a day old as today", () => {
    expect(mobileWorkRecencyBucketForTime(NOW - (DAY_MS - 1), NOW)).toBe("today");
  });

  it("buckets an item exactly a day old as yesterday (the today/yesterday boundary)", () => {
    expect(mobileWorkRecencyBucketForTime(NOW - DAY_MS, NOW)).toBe("yesterday");
  });

  it("buckets an item just under two days old as yesterday", () => {
    expect(mobileWorkRecencyBucketForTime(NOW - (2 * DAY_MS - 1), NOW)).toBe("yesterday");
  });

  it("buckets an item exactly two days old as this_week (the yesterday/this_week boundary)", () => {
    expect(mobileWorkRecencyBucketForTime(NOW - 2 * DAY_MS, NOW)).toBe("this_week");
  });

  it("buckets an item just under seven days old as this_week", () => {
    expect(mobileWorkRecencyBucketForTime(NOW - (7 * DAY_MS - 1), NOW)).toBe("this_week");
  });

  it("buckets an item exactly seven days old as this_month (the this_week/this_month boundary)", () => {
    expect(mobileWorkRecencyBucketForTime(NOW - 7 * DAY_MS, NOW)).toBe("this_month");
  });

  it("buckets an item just under thirty days old as this_month", () => {
    expect(mobileWorkRecencyBucketForTime(NOW - (30 * DAY_MS - 1), NOW)).toBe("this_month");
  });

  it("buckets an item exactly thirty days old as older (the this_month/older boundary)", () => {
    expect(mobileWorkRecencyBucketForTime(NOW - 30 * DAY_MS, NOW)).toBe("older");
  });

  it("buckets a very old item as older", () => {
    expect(mobileWorkRecencyBucketForTime(NOW - 400 * DAY_MS, NOW)).toBe("older");
  });

  it("buckets a future timestamp (clock skew) as today, matching the web behavior of a negative age", () => {
    expect(mobileWorkRecencyBucketForTime(NOW + DAY_MS, NOW)).toBe("today");
  });
});

describe("MOBILE_WORK_RECENCY_BUCKETS", () => {
  it("declares exactly the web WorkspacesPage bucket ids, in display order", () => {
    expect(MOBILE_WORK_RECENCY_BUCKETS.map((bucket) => bucket.id)).toEqual([
      "today",
      "yesterday",
      "this_week",
      "this_month",
      "older",
    ]);
  });

  it("uses the web-verbatim bucket labels", () => {
    expect(MOBILE_WORK_RECENCY_BUCKETS.map((bucket) => bucket.label)).toEqual([
      "Today",
      "Yesterday",
      "This week",
      "This month",
      "Older",
    ]);
  });
});

interface Fixture {
  id: string;
  lastActivityMs: number;
}

function fixture(id: string, ageMs: number): Fixture {
  return { id, lastActivityMs: NOW - ageMs };
}

describe("groupByMobileWorkRecency", () => {
  it("returns no groups for an empty list", () => {
    expect(groupByMobileWorkRecency<Fixture>([], (item) => item.lastActivityMs, NOW)).toEqual([]);
  });

  it("groups items into non-empty buckets only, in bucket display order", () => {
    const items: Fixture[] = [
      fixture("older-1", 400 * DAY_MS),
      fixture("today-1", 5 * 60 * 1000),
      fixture("this-week-1", 3 * DAY_MS),
    ];

    const groups = groupByMobileWorkRecency(items, (item) => item.lastActivityMs, NOW);

    expect(groups.map((group) => group.id)).toEqual(["today", "this_week", "older"]);
    expect(groups.map((group) => group.label)).toEqual(["Today", "This week", "Older"]);
  });

  it("omits empty buckets entirely (no yesterday or this_month rendered here)", () => {
    const items: Fixture[] = [fixture("today-1", 0)];
    const groups = groupByMobileWorkRecency(items, (item) => item.lastActivityMs, NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe("today");
  });

  it("preserves each bucket's input order (already-sorted-by-recency upstream) rather than re-sorting", () => {
    const items: Fixture[] = [
      fixture("today-second", 3 * 60 * 60 * 1000),
      fixture("today-first", 60 * 1000),
    ];
    const groups = groupByMobileWorkRecency(items, (item) => item.lastActivityMs, NOW);
    expect(groups[0].items.map((item) => item.id)).toEqual(["today-second", "today-first"]);
  });

  it("keeps multiple items in the same bucket together", () => {
    const items: Fixture[] = [
      fixture("today-a", 0),
      fixture("today-b", 60 * 1000),
      fixture("this-week-a", 3 * DAY_MS),
    ];
    const groups = groupByMobileWorkRecency(items, (item) => item.lastActivityMs, NOW);
    expect(groups.find((group) => group.id === "today")?.items.map((item) => item.id)).toEqual([
      "today-a",
      "today-b",
    ]);
  });

  it("defaults nowMs to Date.now() when omitted", () => {
    const items: Fixture[] = [{ id: "just-now", lastActivityMs: Date.now() }];
    const groups = groupByMobileWorkRecency(items, (item) => item.lastActivityMs);
    expect(groups[0]?.id).toBe("today");
  });
});
