import { describe, expect, it } from "vitest";
import type { AutomationInventoryStatusKind } from "@proliferate/product-domain/automations/inventory";

import { mobileAutomationStatusDotTone } from "./mobile-automation-status-dot";

describe("mobileAutomationStatusDotTone", () => {
  const cases: Array<[AutomationInventoryStatusKind, string]> = [
    ["waiting", "idle"],
    ["working", "running"],
    ["review", "idle"],
    ["blocked", "failed"],
    ["done", "done"],
  ];

  it.each(cases)("maps automation run statusKind %s to MobileStatusDot tone %s", (kind, expected) => {
    expect(mobileAutomationStatusDotTone(kind)).toBe(expected);
  });
});
