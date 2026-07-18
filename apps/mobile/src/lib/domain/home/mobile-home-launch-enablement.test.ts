import { describe, expect, it } from "vitest";

import {
  deriveMobileHomeLaunchEnablement,
  resolveMobileHomeTargetDisabledReason,
  type MobileHomeLaunchEnablementInput,
} from "./mobile-home-launch-enablement";

const baseTargetInput = {
  hasSelectedRepo: true,
  branchesLoading: false,
  branchesError: false,
  branchOptionsCount: 2,
  selectedBaseBranch: "main",
};

const baseInput: MobileHomeLaunchEnablementInput = {
  ...baseTargetInput,
  draft: "Add retry logic",
  harnessUnavailableReason: null,
  readinessBlockedReason: null,
  submitting: false,
};

describe("resolveMobileHomeTargetDisabledReason", () => {
  it("requires a repository before anything else", () => {
    expect(
      resolveMobileHomeTargetDisabledReason({ ...baseTargetInput, hasSelectedRepo: false }),
    ).toBe("Choose a repository");
  });

  it("reports branches loading, verbatim", () => {
    expect(
      resolveMobileHomeTargetDisabledReason({ ...baseTargetInput, branchesLoading: true }),
    ).toBe("Loading branches");
  });

  it("reports a branch load failure, verbatim", () => {
    expect(
      resolveMobileHomeTargetDisabledReason({ ...baseTargetInput, branchesError: true }),
    ).toBe("Couldn't load branches");
  });

  it("reports an empty branch list, verbatim", () => {
    expect(
      resolveMobileHomeTargetDisabledReason({ ...baseTargetInput, branchOptionsCount: 0 }),
    ).toBe("No branches found");
  });

  it("requires a resolved base branch even when options exist", () => {
    expect(
      resolveMobileHomeTargetDisabledReason({ ...baseTargetInput, selectedBaseBranch: null }),
    ).toBe("Choose a base branch");
  });

  it("resolves to null once a repo and a base branch are both settled", () => {
    expect(resolveMobileHomeTargetDisabledReason(baseTargetInput)).toBeNull();
  });

  it("prioritizes the repository check over branch loading state", () => {
    expect(
      resolveMobileHomeTargetDisabledReason({
        ...baseTargetInput,
        hasSelectedRepo: false,
        branchesLoading: true,
      }),
    ).toBe("Choose a repository");
  });
});

describe("deriveMobileHomeLaunchEnablement", () => {
  it("can submit once the draft is non-empty and the repo/branch target is fully resolved", () => {
    expect(deriveMobileHomeLaunchEnablement(baseInput)).toEqual({
      canSubmit: true,
      disabledReason: null,
    });
  });

  it("cannot submit an empty (or whitespace-only) draft, and surfaces no reason for it", () => {
    expect(deriveMobileHomeLaunchEnablement({ ...baseInput, draft: "   " })).toEqual({
      canSubmit: false,
      disabledReason: null,
    });
  });

  it("blocks on an unresolved base branch — the parity gap this derivation exists to close", () => {
    expect(
      deriveMobileHomeLaunchEnablement({ ...baseInput, selectedBaseBranch: null }),
    ).toEqual({
      canSubmit: false,
      disabledReason: "Choose a base branch",
    });
  });

  it("blocks while branches are still loading", () => {
    expect(
      deriveMobileHomeLaunchEnablement({ ...baseInput, branchesLoading: true }),
    ).toEqual({
      canSubmit: false,
      disabledReason: "Loading branches",
    });
  });

  it("blocks on a readiness gate once the target itself is resolved", () => {
    expect(
      deriveMobileHomeLaunchEnablement({
        ...baseInput,
        readinessBlockedReason: "Finish agent setup to start a chat.",
      }),
    ).toEqual({
      canSubmit: false,
      disabledReason: "Finish agent setup to start a chat.",
    });
  });

  it("target/readiness checks take priority over the harness-availability reason", () => {
    expect(
      deriveMobileHomeLaunchEnablement({
        ...baseInput,
        selectedBaseBranch: null,
        harnessUnavailableReason: "Models are unavailable right now. Try again in a moment.",
      }),
    ).toEqual({
      canSubmit: false,
      disabledReason: "Choose a base branch",
    });
  });

  it("blocks on harness unavailability once repo/branch/readiness are all resolved", () => {
    expect(
      deriveMobileHomeLaunchEnablement({
        ...baseInput,
        harnessUnavailableReason: "Models are unavailable right now. Try again in a moment.",
      }),
    ).toEqual({
      canSubmit: false,
      disabledReason: "Models are unavailable right now. Try again in a moment.",
    });
  });

  it("blocks while a create request is already in flight", () => {
    expect(
      deriveMobileHomeLaunchEnablement({ ...baseInput, submitting: true }),
    ).toEqual({
      canSubmit: false,
      disabledReason: null,
    });
  });
});
