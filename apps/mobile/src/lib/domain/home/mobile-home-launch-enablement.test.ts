import { describe, expect, it } from "vitest";

import {
  deriveMobileHomeLaunchEnablement,
  resolveMobileHomeTargetDisabledReason,
  resolveMobileModelAvailabilityNotice,
  resolveMobileModelAvailabilityState,
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
  modelAvailabilityState: "launchable",
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

describe("resolveMobileModelAvailabilityState", () => {
  it("is launchable once at least one model is launchable", () => {
    expect(
      resolveMobileModelAvailabilityState({
        isLoading: false,
        hasLoadError: false,
        hasLaunchableModel: true,
      }),
    ).toBe("launchable");
  });

  it("stays launchable even while a background refetch is in flight", () => {
    expect(
      resolveMobileModelAvailabilityState({
        isLoading: true,
        hasLoadError: false,
        hasLaunchableModel: true,
      }),
    ).toBe("launchable");
  });

  it("is loading while the catalog request is in flight and nothing is launchable yet", () => {
    expect(
      resolveMobileModelAvailabilityState({
        isLoading: true,
        hasLoadError: false,
        hasLaunchableModel: false,
      }),
    ).toBe("loading");
  });

  it("prioritizes loading over a load error (avoids flashing the error during a refetch)", () => {
    expect(
      resolveMobileModelAvailabilityState({
        isLoading: true,
        hasLoadError: true,
        hasLaunchableModel: false,
      }),
    ).toBe("loading");
  });

  it("is load_error once loading has finished and the catalog request failed", () => {
    expect(
      resolveMobileModelAvailabilityState({
        isLoading: false,
        hasLoadError: true,
        hasLaunchableModel: false,
      }),
    ).toBe("load_error");
  });

  it("is no_launchable_model once loaded cleanly with nothing launchable", () => {
    expect(
      resolveMobileModelAvailabilityState({
        isLoading: false,
        hasLoadError: false,
        hasLaunchableModel: false,
      }),
    ).toBe("no_launchable_model");
  });
});

describe("resolveMobileModelAvailabilityNotice", () => {
  it("maps no_launchable_model to the web-verbatim setup notice plus the Agents affordance", () => {
    expect(resolveMobileModelAvailabilityNotice("no_launchable_model")).toEqual({
      text: "Finish agent setup to start a chat.",
      actionLabel: "Agents",
    });
  });

  it("maps load_error to the web-verbatim transient-failure notice, with no affordance", () => {
    expect(resolveMobileModelAvailabilityNotice("load_error")).toEqual({
      text: "Models are unavailable right now. Try again in a moment.",
      actionLabel: null,
    });
  });

  it("shows no notice while loading", () => {
    expect(resolveMobileModelAvailabilityNotice("loading")).toBeNull();
  });

  it("shows no notice once launchable", () => {
    expect(resolveMobileModelAvailabilityNotice("launchable")).toBeNull();
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

  it("still surfaces the target reason when the model catalog is also unavailable", () => {
    expect(
      deriveMobileHomeLaunchEnablement({
        ...baseInput,
        selectedBaseBranch: null,
        modelAvailabilityState: "load_error",
      }),
    ).toEqual({
      canSubmit: false,
      disabledReason: "Choose a base branch",
    });
  });

  it(
    "blocks canSubmit once the catalog resolves to no_launchable_model, but leaves " +
      "disabledReason null — the mapped notice is its own persistent banner on web " +
      "(modelAvailabilityNotice), never folded into the draft-gated target reason",
    () => {
      expect(
        deriveMobileHomeLaunchEnablement({
          ...baseInput,
          modelAvailabilityState: "no_launchable_model",
        }),
      ).toEqual({
        canSubmit: false,
        disabledReason: null,
      });
    },
  );

  it(
    "blocks canSubmit once the catalog resolves to load_error, but leaves disabledReason null",
    () => {
      expect(
        deriveMobileHomeLaunchEnablement({
          ...baseInput,
          modelAvailabilityState: "load_error",
        }),
      ).toEqual({
        canSubmit: false,
        disabledReason: null,
      });
    },
  );

  it(
    "blocks canSubmit while the catalog is still loading — mobile must not treat an " +
      "in-flight/undefined catalog as all-launchable",
    () => {
      expect(
        deriveMobileHomeLaunchEnablement({
          ...baseInput,
          modelAvailabilityState: "loading",
        }),
      ).toEqual({
        canSubmit: false,
        disabledReason: null,
      });
    },
  );

  it("blocks while a create request is already in flight", () => {
    expect(
      deriveMobileHomeLaunchEnablement({ ...baseInput, submitting: true }),
    ).toEqual({
      canSubmit: false,
      disabledReason: null,
    });
  });
});
