import { describe, expect, it } from "vitest";
import {
  prStatusBadgeText,
  prStatusKindFromSummary,
  prStatusLabel,
  prStatusTone,
} from "./mobile-pr-status";

describe("prStatusKindFromSummary", () => {
  it("maps a merged PR to 'merged' regardless of draft/checks", () => {
    expect(
      prStatusKindFromSummary({ state: "merged", draft: false }),
    ).toBe("merged");
  });

  it("maps a closed PR to 'closed' regardless of draft/checks", () => {
    expect(
      prStatusKindFromSummary({ state: "closed", draft: false }),
    ).toBe("closed");
  });

  it("maps an open draft PR to 'draft', ignoring checks/review", () => {
    expect(
      prStatusKindFromSummary({
        state: "open",
        draft: true,
        checks: "failing",
        reviewDecision: "changes_requested",
      }),
    ).toBe("draft");
  });

  it("maps an open non-draft PR with failing checks to 'checks_failing'", () => {
    expect(
      prStatusKindFromSummary({ state: "open", draft: false, checks: "failing" }),
    ).toBe("checks_failing");
  });

  it("maps an open non-draft PR with pending checks to 'pending'", () => {
    expect(
      prStatusKindFromSummary({ state: "open", draft: false, checks: "pending" }),
    ).toBe("pending");
  });

  it("maps an open non-draft PR with changes requested to 'changes_requested'", () => {
    expect(
      prStatusKindFromSummary({
        state: "open",
        draft: false,
        checks: "passing",
        reviewDecision: "changes_requested",
      }),
    ).toBe("changes_requested");
  });

  it("maps a plain open non-draft PR with no checks/review signal to 'open'", () => {
    expect(prStatusKindFromSummary({ state: "open", draft: false })).toBe("open");
    expect(
      prStatusKindFromSummary({ state: "open", draft: false, checks: "none", reviewDecision: "none" }),
    ).toBe("open");
  });

  it("prioritizes failing checks over a changes-requested review", () => {
    expect(
      prStatusKindFromSummary({
        state: "open",
        draft: false,
        checks: "failing",
        reviewDecision: "changes_requested",
      }),
    ).toBe("checks_failing");
  });
});

describe("prStatusLabel", () => {
  it("returns the verbatim web PrStatusBadge label for every kind", () => {
    expect(prStatusLabel("open")).toBe("Open");
    expect(prStatusLabel("checks_failing")).toBe("Checks failing");
    expect(prStatusLabel("pending")).toBe("Checks pending");
    expect(prStatusLabel("changes_requested")).toBe("Changes requested");
    expect(prStatusLabel("draft")).toBe("Draft");
    expect(prStatusLabel("merged")).toBe("Merged");
    expect(prStatusLabel("closed")).toBe("Closed");
  });
});

describe("prStatusTone", () => {
  it("gives merged its own distinct tone (never mixed up with open/success)", () => {
    expect(prStatusTone("merged")).toBe("merged");
    expect(prStatusTone("open")).toBe("success");
  });

  it("gives pending a hollow/outline tone distinct from a filled warning", () => {
    expect(prStatusTone("pending")).toBe("pendingOutline");
    expect(prStatusTone("changes_requested")).toBe("warningFill");
  });

  it("gives checks_failing and closed a danger tone", () => {
    expect(prStatusTone("checks_failing")).toBe("danger");
    expect(prStatusTone("closed")).toBe("danger");
  });

  it("gives draft a muted tone", () => {
    expect(prStatusTone("draft")).toBe("muted");
  });
});

describe("prStatusBadgeText", () => {
  it("formats '#{number} · {label}' when a PR number is known", () => {
    expect(prStatusBadgeText("pending", 482)).toBe("#482 · Checks pending");
  });

  it("omits the number segment when the number is null", () => {
    expect(prStatusBadgeText("open", null)).toBe("Open");
  });
});
