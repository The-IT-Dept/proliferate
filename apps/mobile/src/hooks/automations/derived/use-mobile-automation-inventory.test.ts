import { describe, expect, it } from "vitest";
import type { AutomationResponse } from "@proliferate/cloud-sdk";

import { buildMobileAutomationInventory } from "./use-mobile-automation-inventory";

/**
 * Minimal fixture satisfying AutomationResponse's full wire shape (the SDK
 * type has no optional fields) — mirrors the `workspace()` helper pattern in
 * use-mobile-work-inventory.test.ts.
 */
function automation(overrides: Partial<AutomationResponse> = {}): AutomationResponse {
  return {
    id: "automation-1",
    ownerScope: "personal",
    ownerUserId: "user-1",
    organizationId: null,
    createdByUserId: "user-1",
    gitOwner: "proliferate-ai",
    gitRepoName: "proliferate",
    title: "Nightly dependency bump",
    prompt: "Check for dependency updates and open a PR.",
    schedule: {
      rrule: "RRULE:FREQ=DAILY;BYHOUR=3;BYMINUTE=0",
      timezone: "UTC",
      summary: "Daily at 03:00 in UTC",
      nextRunAt: "2026-07-20T03:00:00.000Z",
    },
    targetMode: "personal_cloud",
    cloudAgentRunConfigId: "config-1",
    enabled: true,
    pausedAt: null,
    lastScheduledAt: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  } as AutomationResponse;
}

const NOW = new Date("2026-07-19T12:00:00.000Z");

describe("buildMobileAutomationInventory", () => {
  it("labels an enabled automation 'Enabled' — verbatim, matching web's inventory-list.ts", () => {
    const { items } = buildMobileAutomationInventory([automation({ enabled: true })], NOW);
    expect(items[0]?.statusLabel).toBe("Enabled");
  });

  it("labels a paused automation 'Paused' — verbatim, matching web's inventory-list.ts", () => {
    const { items } = buildMobileAutomationInventory([automation({ enabled: false })], NOW);
    expect(items[0]?.statusLabel).toBe("Paused");
  });

  it("passes the server-computed schedule summary through unchanged", () => {
    const { items } = buildMobileAutomationInventory(
      [automation({ schedule: { rrule: "x", timezone: "UTC", summary: "Weekdays at 09:00 in UTC", nextRunAt: null } })],
      NOW,
    );
    expect(items[0]?.scheduleLabel).toBe("Weekdays at 09:00 in UTC");
  });

  it("labels scope 'Personal' vs 'Team' from ownerScope", () => {
    const { items } = buildMobileAutomationInventory(
      [
        automation({ id: "a", ownerScope: "personal" }),
        automation({ id: "b", ownerScope: "organization" }),
      ],
      NOW,
    );
    expect(items.find((item) => item.id === "a")?.scopeLabel).toBe("Personal");
    expect(items.find((item) => item.id === "b")?.scopeLabel).toBe("Team");
  });

  it("groups into 'Active' and 'Paused' sections with correct counts", () => {
    const { groups } = buildMobileAutomationInventory(
      [
        automation({ id: "a", enabled: true }),
        automation({ id: "b", enabled: true }),
        automation({ id: "c", enabled: false }),
      ],
      NOW,
    );
    const active = groups.find((group) => group.id === "active");
    const paused = groups.find((group) => group.id === "paused");
    expect(active?.label).toBe("Active");
    expect(active?.count).toBe(2);
    expect(paused?.label).toBe("Paused");
    expect(paused?.count).toBe(1);
  });

  it("omits an empty group rather than rendering a zero-count section", () => {
    const { groups } = buildMobileAutomationInventory([automation({ enabled: true })], NOW);
    expect(groups.map((group) => group.id)).toEqual(["active"]);
  });

  it("disables run-now for a local/desktop-required target with web's verbatim reason", () => {
    const { items } = buildMobileAutomationInventory(
      [automation({ targetMode: "local", enabled: true })],
      NOW,
    );
    expect(items[0]?.runNowDisabledReason).toBe("Check this out on the desktop.");
  });

  it("returns no groups/items for an empty automations list", () => {
    const { groups, items } = buildMobileAutomationInventory([], NOW);
    expect(groups).toEqual([]);
    expect(items).toEqual([]);
  });
});
