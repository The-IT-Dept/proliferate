import { describe, expect, it } from "vitest";

import { formatMobileHomeDateEyebrow } from "./mobile-home-date";

describe("formatMobileHomeDateEyebrow", () => {
  it("formats as '<weekday> <day> <month>', matching mockup A's date eyebrow", () => {
    // Saturday 18 July 2026.
    expect(formatMobileHomeDateEyebrow(new Date(2026, 6, 18))).toBe("Saturday 18 July");
  });

  it("does not zero-pad the day", () => {
    // Wednesday 1 July 2026.
    expect(formatMobileHomeDateEyebrow(new Date(2026, 6, 1))).toBe("Wednesday 1 July");
  });

  it("omits the year, unlike a locale date string", () => {
    expect(formatMobileHomeDateEyebrow(new Date(2026, 0, 5))).not.toMatch(/2026/);
  });
});
