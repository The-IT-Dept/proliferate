import { describe, expect, it } from "vitest";

import { buildMobileAccountSummary } from "./mobile-account-summary";
import type { AuthUser } from "@proliferate/cloud-sdk";

describe("buildMobileAccountSummary", () => {
  it("prefers display_name and builds two-letter initials from it", () => {
    const user = { display_name: "Ada Lovelace", email: "ada@example.com" } as AuthUser;
    expect(buildMobileAccountSummary(user)).toEqual({
      initials: "AL",
      name: "Ada Lovelace",
      handle: "ada@example.com",
    });
  });

  it("falls back to the email local-part when display_name is missing", () => {
    const user = { display_name: null, email: "ada@example.com" } as unknown as AuthUser;
    expect(buildMobileAccountSummary(user)).toEqual({
      initials: "AD",
      name: "ada",
      handle: "ada@example.com",
    });
  });

  it("uses the first two characters of a single-word name for initials", () => {
    const user = { display_name: "Madonna", email: "madonna@example.com" } as AuthUser;
    expect(buildMobileAccountSummary(user).initials).toBe("MA");
  });

  it("falls back to the Proliferate name when there is no user", () => {
    expect(buildMobileAccountSummary(null)).toEqual({
      initials: "PR",
      name: "Proliferate",
      handle: "Signed in",
    });
  });
});
