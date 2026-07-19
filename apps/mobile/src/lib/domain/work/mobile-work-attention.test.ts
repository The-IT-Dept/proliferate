import { describe, expect, it } from "vitest";

import {
  deriveMobileWorkAttentionCount,
  mobileWorkItemNeedsAttention,
  type MobileWorkAttentionFacts,
} from "./mobile-work-attention";

function facts(overrides: Partial<MobileWorkAttentionFacts> = {}): MobileWorkAttentionFacts {
  return {
    status: "ready",
    unclaimed: false,
    statusIndicator: { kind: "ready", tone: "success", label: "Ready", hollow: false, live: false },
    ...overrides,
  };
}

describe("mobileWorkItemNeedsAttention", () => {
  it("does not flag a ready, claimed, idle workspace", () => {
    expect(mobileWorkItemNeedsAttention(facts())).toBe(false);
  });

  it("flags a blocked workspace", () => {
    expect(mobileWorkItemNeedsAttention(facts({ status: "blocked" }))).toBe(true);
  });

  it("flags an unclaimed (shared, not yet claimed) workspace", () => {
    expect(mobileWorkItemNeedsAttention(facts({ unclaimed: true }))).toBe(true);
  });

  it("flags a workspace whose status indicator is needs_input, even if status itself reads ready", () => {
    expect(
      mobileWorkItemNeedsAttention(
        facts({
          statusIndicator: { kind: "needs_input", tone: "attention", label: "Needs input", hollow: false, live: false },
        }),
      ),
    ).toBe(true);
  });

  it("does not flag a running workspace with no pending input", () => {
    expect(
      mobileWorkItemNeedsAttention(
        facts({
          status: "running",
          statusIndicator: { kind: "running", tone: "progress", label: "In progress", hollow: false, live: true },
        }),
      ),
    ).toBe(false);
  });

  it("does not flag an archived workspace on that basis alone", () => {
    expect(mobileWorkItemNeedsAttention(facts({ status: "archived" }))).toBe(false);
  });
});

describe("deriveMobileWorkAttentionCount", () => {
  it("is zero for an empty list", () => {
    expect(deriveMobileWorkAttentionCount([])).toBe(0);
  });

  it("is zero when nothing needs attention", () => {
    expect(deriveMobileWorkAttentionCount([facts(), facts({ status: "running" })])).toBe(0);
  });

  it("counts only the items that need attention", () => {
    const items = [
      facts(),
      facts({ status: "blocked" }),
      facts({ unclaimed: true }),
      facts({ status: "running" }),
      facts({
        statusIndicator: { kind: "needs_input", tone: "attention", label: "Needs input", hollow: false, live: false },
      }),
    ];
    expect(deriveMobileWorkAttentionCount(items)).toBe(3);
  });

  it("counts each qualifying item once even if it matches more than one attention rule", () => {
    const items = [
      facts({
        status: "blocked",
        unclaimed: true,
        statusIndicator: { kind: "needs_input", tone: "attention", label: "Needs input", hollow: false, live: false },
      }),
    ];
    expect(deriveMobileWorkAttentionCount(items)).toBe(1);
  });
});
