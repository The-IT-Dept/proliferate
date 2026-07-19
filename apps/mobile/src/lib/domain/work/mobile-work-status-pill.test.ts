import { describe, expect, it } from "vitest";
import type { RecentWorkStatusIndicatorView } from "@proliferate/product-domain/workspaces/cloud-work-inventory";

import { mobileWorkspaceStatusPill } from "./mobile-work-status-pill";

function indicator(
  overrides: Partial<RecentWorkStatusIndicatorView>,
): RecentWorkStatusIndicatorView {
  return {
    kind: "ready",
    tone: "success",
    label: "Ready",
    hollow: false,
    live: false,
    ...overrides,
  };
}

describe("mobileWorkspaceStatusPill", () => {
  it("passes the SDK-sourced label through verbatim, never rewriting it", () => {
    expect(mobileWorkspaceStatusPill(indicator({ label: "Needs input" })).label).toBe(
      "Needs input",
    );
  });

  it("maps the attention tone to the warning color key", () => {
    expect(
      mobileWorkspaceStatusPill(indicator({ kind: "needs_input", tone: "attention", label: "Needs input" }))
        .colorKey,
    ).toBe("warning");
  });

  it("maps the progress tone to the info color key", () => {
    expect(
      mobileWorkspaceStatusPill(indicator({ kind: "running", tone: "progress", label: "In progress", live: true }))
        .colorKey,
    ).toBe("info");
  });

  it("maps the success tone to the success color key", () => {
    expect(
      mobileWorkspaceStatusPill(indicator({ kind: "ready", tone: "success", label: "Ready" })).colorKey,
    ).toBe("success");
  });

  it("maps the danger tone to the destructive color key", () => {
    expect(
      mobileWorkspaceStatusPill(indicator({ kind: "error", tone: "danger", label: "Error" })).colorKey,
    ).toBe("destructive");
  });

  it("maps the muted tone to the borderHeavy color key", () => {
    expect(
      mobileWorkspaceStatusPill(indicator({ kind: "idle", tone: "muted", label: "Idle", hollow: true }))
        .colorKey,
    ).toBe("borderHeavy");
  });

  it("passes live through for a running indicator", () => {
    expect(
      mobileWorkspaceStatusPill(indicator({ kind: "running", tone: "progress", label: "In progress", live: true }))
        .live,
    ).toBe(true);
  });

  it("passes hollow through for an idle indicator", () => {
    expect(
      mobileWorkspaceStatusPill(indicator({ kind: "idle", tone: "muted", label: "Idle", hollow: true }))
        .hollow,
    ).toBe(true);
  });
});
