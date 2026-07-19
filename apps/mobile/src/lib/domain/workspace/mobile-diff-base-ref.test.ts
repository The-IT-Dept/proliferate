import { describe, expect, it } from "vitest";
import { resolveMobileDiffBaseRef } from "./mobile-diff-base-ref";

describe("resolveMobileDiffBaseRef", () => {
  it("prefers repoPreferenceDefaultBranch over the other two inputs", () => {
    expect(resolveMobileDiffBaseRef({
      repoPreferenceDefaultBranch: " release ",
      repoRootDefaultBranch: "main",
      suggestedBaseBranch: "develop",
    })).toBe("release");
  });

  it("falls back to repoRootDefaultBranch when there is no preference override", () => {
    expect(resolveMobileDiffBaseRef({
      repoPreferenceDefaultBranch: null,
      repoRootDefaultBranch: "main",
      suggestedBaseBranch: "develop",
    })).toBe("main");
  });

  it("falls back to suggestedBaseBranch when neither preference nor repo-root default exist", () => {
    expect(resolveMobileDiffBaseRef({
      repoPreferenceDefaultBranch: null,
      repoRootDefaultBranch: null,
      suggestedBaseBranch: "develop",
    })).toBe("develop");
  });

  it("returns null when no input resolves to a usable branch", () => {
    expect(resolveMobileDiffBaseRef({})).toBeNull();
    expect(resolveMobileDiffBaseRef({
      repoPreferenceDefaultBranch: null,
      repoRootDefaultBranch: undefined,
      suggestedBaseBranch: null,
    })).toBeNull();
  });

  it("treats a whitespace-only input as absent and falls through to the next preference", () => {
    expect(resolveMobileDiffBaseRef({
      repoPreferenceDefaultBranch: "   ",
      repoRootDefaultBranch: "main",
      suggestedBaseBranch: "develop",
    })).toBe("main");
  });

  it("trims the winning branch name", () => {
    expect(resolveMobileDiffBaseRef({ suggestedBaseBranch: "  develop  " })).toBe("develop");
  });

  it("mirrors the mobile Diff segment's only-available-input case (suggestedBaseBranch alone)", () => {
    expect(resolveMobileDiffBaseRef({ suggestedBaseBranch: "main" })).toBe("main");
    expect(resolveMobileDiffBaseRef({ suggestedBaseBranch: null })).toBeNull();
  });
});
