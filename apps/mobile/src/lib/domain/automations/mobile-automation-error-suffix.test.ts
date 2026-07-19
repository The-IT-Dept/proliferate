import { describe, expect, it } from "vitest";

import { mobileAutomationErrorSuffix } from "./mobile-automation-error-suffix";

// Regression guard for the Group J dedup: MobileAutomationsScreen.tsx and
// MobileAutomationDetailScreen.tsx each hand-rolled an identical
// `errorSuffix` helper for their action-failure toasts; this pins the
// shared replacement's behavior.
describe("mobileAutomationErrorSuffix", () => {
  it("returns a colon-prefixed message for an Error with a message", () => {
    expect(mobileAutomationErrorSuffix(new Error("network down"))).toBe(": network down");
  });

  it("returns a bare period for an Error with an empty message", () => {
    expect(mobileAutomationErrorSuffix(new Error(""))).toBe(".");
  });

  it("returns a bare period for a non-Error value", () => {
    expect(mobileAutomationErrorSuffix("some string")).toBe(".");
    expect(mobileAutomationErrorSuffix(null)).toBe(".");
    expect(mobileAutomationErrorSuffix(undefined)).toBe(".");
  });
});
