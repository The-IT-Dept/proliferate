import { describe, expect, it } from "vitest";
import type { CloudWorkspaceSummary } from "@proliferate/cloud-sdk";

import { buildMobileWorkInventory } from "./use-mobile-work-inventory";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Minimal fixture mirroring product-domain's cloud-work-inventory.test.ts
 * `workspace()` helper (same package, same shape) — cast at the end since
 * CloudWorkspaceSummary's off-wire app extras are optional and this only
 * needs the fields cloudWorkItemForWorkspace actually reads.
 */
function workspace(overrides: Partial<CloudWorkspaceSummary> = {}): CloudWorkspaceSummary {
  return {
    id: "workspace",
    targetId: "target",
    displayName: "Workspace",
    repo: {
      provider: "github",
      owner: "proliferate-ai",
      name: "proliferate",
      branch: "main",
      baseBranch: "main",
    },
    workspaceStatus: "ready",
    runtime: { status: "running" },
    statusDetail: null,
    lastError: null,
    templateVersion: null,
    updatedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    actionBlockKind: null,
    actionBlockReason: null,
    postReadyPhase: "complete",
    postReadyFilesTotal: 0,
    postReadyFilesApplied: 0,
    postReadyStartedAt: null,
    postReadyCompletedAt: null,
    repoFilesLastFailedPath: null,
    origin: { kind: "human", entrypoint: "mobile" },
    creatorContext: null,
    directTargetContext: null,
    visibility: "private",
    exposure: null,
    exposureState: "untracked",
    sandboxType: "managed_personal",
    lastActivityAt: new Date().toISOString(),
    lastSessionSummary: null,
    claimedByUserId: null,
    claimId: null,
    claimedAt: null,
    claimSourceKind: null,
    billing: null,
    status: "ready",
    ...overrides,
  } as CloudWorkspaceSummary;
}

describe("buildMobileWorkInventory recency bucketing field", () => {
  it("groups by view.lastActivityMs, not createdAtMs — a workspace created long ago but active moments ago lands in today", () => {
    const recentlyActiveButOldlyCreated = workspace({
      id: "old-created-recently-active",
      createdAt: new Date(Date.now() - 400 * DAY_MS).toISOString(),
      lastActivityAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    });

    const { groups } = buildMobileWorkInventory([recentlyActiveButOldlyCreated]);

    expect(groups).toHaveLength(1);
    expect(groups[0].view.id).toBe("today");
    expect(groups[0].items.map((item) => item.view.id)).toEqual(["old-created-recently-active"]);
  });

  it("the inverse: a workspace created moments ago but inactive for a long time lands in older, not today", () => {
    const recentlyCreatedButOldlyActive = workspace({
      id: "recently-created-old-active",
      createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      lastActivityAt: new Date(Date.now() - 400 * DAY_MS).toISOString(),
    });

    const { groups } = buildMobileWorkInventory([recentlyCreatedButOldlyActive]);

    expect(groups).toHaveLength(1);
    expect(groups[0].view.id).toBe("older");
  });

  it("two workspaces with swapped createdAt/lastActivity sort and bucket by lastActivity alone", () => {
    const activeNowCreatedLongAgo = workspace({
      id: "a-active-now",
      createdAt: new Date(Date.now() - 400 * DAY_MS).toISOString(),
      lastActivityAt: new Date(Date.now() - 60 * 1000).toISOString(),
    });
    const activeLongAgoCreatedNow = workspace({
      id: "b-active-long-ago",
      createdAt: new Date(Date.now() - 60 * 1000).toISOString(),
      lastActivityAt: new Date(Date.now() - 400 * DAY_MS).toISOString(),
    });

    const { groups, recentItems } = buildMobileWorkInventory([
      activeLongAgoCreatedNow,
      activeNowCreatedLongAgo,
    ]);

    // If this regressed to bucket/sort by createdAtMs instead, "b" (created
    // just now) would show as the most recent and "a" would be relegated to
    // "older" — the opposite of what actually happened.
    expect(recentItems.map((item) => item.view.id)).toEqual(["a-active-now", "b-active-long-ago"]);
    expect(groups.find((group) => group.view.id === "today")?.items.map((item) => item.view.id)).toEqual([
      "a-active-now",
    ]);
    expect(groups.find((group) => group.view.id === "older")?.items.map((item) => item.view.id)).toEqual([
      "b-active-long-ago",
    ]);
  });
});
