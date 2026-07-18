import { describe, expect, it } from "vitest";

import {
  buildBranchName,
  buildMobileBranchOptions,
  buildMobileRepoOptions,
  buildWorkspaceDisplayName,
  resolveMobileSelectedBaseBranch,
} from "./mobile-home-launch";

describe("buildMobileRepoOptions", () => {
  it("maps configured cloud repos to owner/repo options", () => {
    expect(
      buildMobileRepoOptions([
        { gitOwner: "theitdept", gitRepoName: "billing-api" },
        { gitOwner: "theitdept", gitRepoName: "storefront" },
      ]),
    ).toEqual([
      {
        id: "theitdept/billing-api",
        gitOwner: "theitdept",
        gitRepoName: "billing-api",
        label: "theitdept/billing-api",
        description: "Configured cloud repo",
      },
      {
        id: "theitdept/storefront",
        gitOwner: "theitdept",
        gitRepoName: "storefront",
        label: "theitdept/storefront",
        description: "Configured cloud repo",
      },
    ]);
  });

  it("returns an empty list when there are no configured repos", () => {
    expect(buildMobileRepoOptions([])).toEqual([]);
  });
});

describe("buildMobileBranchOptions", () => {
  it("puts the default branch first, then the selected override, then the rest, de-duplicated", () => {
    expect(
      buildMobileBranchOptions({
        branches: ["main", "feature/a", "develop"],
        defaultBranch: "main",
        selectedBranch: "feature/a",
      }),
    ).toEqual(["main", "feature/a", "develop"]);
  });

  it("skips blank/whitespace-only branch names", () => {
    expect(
      buildMobileBranchOptions({
        branches: ["  ", "main", ""],
        defaultBranch: null,
        selectedBranch: undefined,
      }),
    ).toEqual(["main"]);
  });

  it("returns an empty list when no branches, default, or selection are present", () => {
    expect(
      buildMobileBranchOptions({ branches: null, defaultBranch: null, selectedBranch: null }),
    ).toEqual([]);
  });

  it("does not duplicate the default branch when it also appears in the branch list", () => {
    expect(
      buildMobileBranchOptions({
        branches: ["main", "develop"],
        defaultBranch: "main",
        selectedBranch: null,
      }),
    ).toEqual(["main", "develop"]);
  });
});

describe("resolveMobileSelectedBaseBranch", () => {
  it("prefers an explicit per-repo override even when it isn't in the branch options", () => {
    expect(
      resolveMobileSelectedBaseBranch({
        overrideBranch: "feature/manual",
        defaultBranch: "main",
        branchOptions: ["main", "develop"],
      }),
    ).toBe("feature/manual");
  });

  it("falls back to the repo's default branch when there's no override", () => {
    expect(
      resolveMobileSelectedBaseBranch({
        overrideBranch: null,
        defaultBranch: "main",
        branchOptions: ["main", "develop"],
      }),
    ).toBe("main");
  });

  it("falls back to the first branch option when there's no override or default", () => {
    expect(
      resolveMobileSelectedBaseBranch({
        overrideBranch: null,
        defaultBranch: null,
        branchOptions: ["develop", "main"],
      }),
    ).toBe("develop");
  });

  it("resolves to null when nothing is available yet", () => {
    expect(
      resolveMobileSelectedBaseBranch({
        overrideBranch: null,
        defaultBranch: null,
        branchOptions: [],
      }),
    ).toBeNull();
  });
});

describe("buildBranchName", () => {
  it("slugifies the prompt and prefixes it with proliferate/", () => {
    const branch = buildBranchName("Add retry with exponential backoff!");
    expect(branch).toMatch(/^proliferate\/add-retry-with-exponential-backo-[a-z0-9]+$/);
  });

  it("falls back to a generic slug for prompts with no alphanumeric characters", () => {
    const branch = buildBranchName("!!!");
    expect(branch).toMatch(/^proliferate\/mobile-chat-[a-z0-9]+$/);
  });
});

describe("buildWorkspaceDisplayName", () => {
  it("returns the trimmed prompt when it fits within the limit", () => {
    expect(buildWorkspaceDisplayName("  Add retry logic  ")).toBe("Add retry logic");
  });

  it("truncates long prompts to 42 characters with an ellipsis", () => {
    const longPrompt = "Add retry with exponential backoff to the refund webhook worker and also logging";
    const name = buildWorkspaceDisplayName(longPrompt);
    expect(name.length).toBeLessThanOrEqual(42);
    expect(name.endsWith("...")).toBe(true);
  });

  it("falls back to a generic name for an empty prompt", () => {
    expect(buildWorkspaceDisplayName("   ")).toBe("Mobile chat");
  });
});
