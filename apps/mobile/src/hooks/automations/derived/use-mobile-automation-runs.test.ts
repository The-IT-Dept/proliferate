import { describe, expect, it } from "vitest";
import type { AutomationRunResponse } from "@proliferate/cloud-sdk";

import { buildMobileAutomationRunInventory } from "./use-mobile-automation-runs";

function run(overrides: Partial<AutomationRunResponse> = {}): AutomationRunResponse {
  return {
    id: "run-1",
    automationId: "automation-1",
    ownerScope: "personal",
    ownerUserId: "user-1",
    organizationId: null,
    createdByUserId: "user-1",
    triggerKind: "scheduled",
    scheduledFor: "2026-07-19T03:00:00.000Z",
    targetMode: "personal_cloud",
    status: "dispatched",
    titleSnapshot: "Nightly dependency bump",
    promptSnapshot: "Check for dependency updates.",
    gitProviderSnapshot: "github",
    gitOwnerSnapshot: "proliferate-ai",
    gitRepoNameSnapshot: "proliferate",
    cloudRepoConfigIdSnapshot: "repo-config-1",
    cloudTargetIdSnapshot: null,
    cloudTargetKindSnapshot: "managed_cloud",
    sandboxProfileId: null,
    cloudWorkspaceExposureId: null,
    agentRunConfigSnapshot: null,
    cascadeAttempt: 0,
    lastCascadeCommandId: null,
    lastCascadeReason: null,
    claimExpiresAt: null,
    dispatchStartedAt: null,
    dispatchedAt: "2026-07-19T03:00:05.000Z",
    failedAt: null,
    cloudWorkspaceId: "workspace-1",
    anyharnessWorkspaceId: null,
    anyharnessSessionId: null,
    cancelledAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    createdAt: "2026-07-19T03:00:00.000Z",
    updatedAt: "2026-07-19T03:00:05.000Z",
    ...overrides,
  } as AutomationRunResponse;
}

// Verbatim run-status vocabulary, pinned against
// apps/packages/product-domain/src/automations/inventory-runs.ts
// (== AUTOMATION_RUN_COPY in product-client/src/copy/automations) so a
// future change to either doesn't silently desync from what web renders.
describe("buildMobileAutomationRunInventory status labels (verbatim, matches web)", () => {
  const cases: Array<[AutomationRunResponse["status"], string]> = [
    ["queued", "Queued"],
    ["claimed", "Claimed by executor"],
    ["creating_workspace", "Creating cloud workspace"],
    ["provisioning_workspace", "Preparing runtime"],
    ["creating_session", "Creating session"],
    ["dispatching", "Sending prompt"],
    ["dispatched", "Session started"],
    ["failed", "Failed"],
    ["cancelled", "Cancelled"],
  ];

  it.each(cases)("status %s -> %s", (status, expectedLabel) => {
    const [item] = buildMobileAutomationRunInventory([run({ status, lastErrorMessage: null })]);
    expect(item?.statusLabel).toBe(expectedLabel);
  });

  it("uses the local-executor queued variant for a local-target run", () => {
    const [item] = buildMobileAutomationRunInventory([
      run({ status: "queued", targetMode: "local" }),
    ]);
    expect(item?.statusLabel).toBe("Queued, local executor not available yet");
  });
});

describe("buildMobileAutomationRunInventory trigger + timestamp labels", () => {
  it("labels a scheduled run's trigger 'Scheduled' and timestamp 'Scheduled {ts}'", () => {
    const [item] = buildMobileAutomationRunInventory([
      run({ triggerKind: "scheduled", scheduledFor: "2026-07-19T03:00:00.000Z" }),
    ]);
    expect(item?.triggerLabel).toBe("Scheduled");
    expect(item?.timestampLabel.startsWith("Scheduled ")).toBe(true);
  });

  it("labels a manual run's trigger 'Manual' and timestamp 'Requested {ts}'", () => {
    const [item] = buildMobileAutomationRunInventory([
      run({ triggerKind: "manual", scheduledFor: null }),
    ]);
    expect(item?.triggerLabel).toBe("Manual");
    expect(item?.timestampLabel.startsWith("Requested ")).toBe(true);
  });
});

describe("buildMobileAutomationRunInventory failure detail", () => {
  it("surfaces the compacted error message as the row title for a failed run", () => {
    const [item] = buildMobileAutomationRunInventory([
      run({ status: "failed", lastErrorMessage: "GitHub push rejected: protected branch" }),
    ]);
    expect(item?.title).toBe("GitHub push rejected: protected branch");
    expect(item?.errorLabel).toBe("GitHub push rejected: protected branch");
  });

  it("falls back to the status label as the title when there is no error message", () => {
    const [item] = buildMobileAutomationRunInventory([run({ status: "dispatched" })]);
    expect(item?.title).toBe("Session started");
    expect(item?.errorLabel).toBeNull();
  });
});

describe("buildMobileAutomationRunInventory empty input", () => {
  it("returns an empty array for no runs", () => {
    expect(buildMobileAutomationRunInventory([])).toEqual([]);
  });
});
