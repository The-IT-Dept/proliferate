import { describe, expect, it } from "vitest";

import {
  buildMobileCloudWorkspaceStatusView,
  descriptionForStartBlockReason,
  isCloudStartBlockReason,
  shouldShowMobileCloudWorkspaceStatusScreen,
  titleForStartBlockReason,
  type MobileCloudWorkspaceStatusInput,
} from "./mobile-cloud-workspace-status";

function workspaceFixture(
  overrides: Partial<MobileCloudWorkspaceStatusInput> = {},
): MobileCloudWorkspaceStatusInput {
  return {
    status: "pending",
    workspaceStatus: "pending",
    actionBlockKind: null,
    actionBlockReason: null,
    lastError: null,
    statusDetail: null,
    runtime: { generation: 0 },
    ...overrides,
  };
}

describe("isCloudStartBlockReason", () => {
  it.each([
    "concurrency_limit",
    "credits_exhausted",
    "overage_disabled",
    "cap_exhausted",
    "payment_failed",
    "admin_hold",
    "external_billing_hold",
  ])("recognizes %s as a real start-block reason", (reason) => {
    expect(isCloudStartBlockReason(reason)).toBe(true);
  });

  it("rejects unknown strings", () => {
    expect(isCloudStartBlockReason("something_else")).toBe(false);
  });

  it("rejects null/undefined", () => {
    expect(isCloudStartBlockReason(null)).toBe(false);
    expect(isCloudStartBlockReason(undefined)).toBe(false);
  });
});

describe("titleForStartBlockReason", () => {
  it("gives concurrency_limit its own title", () => {
    expect(titleForStartBlockReason("concurrency_limit")).toBe("Sandbox limit reached");
  });

  it.each([
    "credits_exhausted",
    "overage_disabled",
    "cap_exhausted",
    "payment_failed",
    "admin_hold",
    "external_billing_hold",
  ])("gives %s the shared 'Cloud usage is paused' title", (reason) => {
    expect(titleForStartBlockReason(reason)).toBe("Cloud usage is paused");
  });

  it("falls back to the shared title for an unrecognized reason", () => {
    expect(titleForStartBlockReason("something_else")).toBe("Cloud usage is paused");
  });
});

describe("descriptionForStartBlockReason", () => {
  it.each([
    {
      reason: "concurrency_limit",
      description: "Archive or delete another cloud workspace before starting this one.",
    },
    {
      reason: "credits_exhausted",
      description: "Cloud usage is paused because your included sandbox hours are exhausted.",
    },
    {
      reason: "overage_disabled",
      description: "Cloud usage is paused because managed cloud overage is disabled.",
    },
    {
      reason: "cap_exhausted",
      description: "Cloud usage is paused because the managed cloud overage cap is exhausted.",
    },
    {
      reason: "payment_failed",
      description: "Cloud usage is paused because billing needs attention.",
    },
    {
      reason: "external_billing_hold",
      description: "Cloud usage is paused because billing needs attention.",
    },
    {
      reason: "admin_hold",
      description: "Cloud usage is paused for this account.",
    },
  ])("maps $reason to its verbatim web copy", ({ description, reason }) => {
    expect(descriptionForStartBlockReason(reason)).toBe(description);
  });

  it("falls back to generic copy for an unrecognized reason", () => {
    expect(descriptionForStartBlockReason("something_else")).toBe(
      "Cloud usage is unavailable for this workspace right now.",
    );
  });
});

describe("shouldShowMobileCloudWorkspaceStatusScreen", () => {
  it("shows for pending", () => {
    expect(shouldShowMobileCloudWorkspaceStatusScreen(workspaceFixture({ status: "pending" }))).toBe(true);
  });

  it("shows for materializing", () => {
    expect(shouldShowMobileCloudWorkspaceStatusScreen(workspaceFixture({ status: "materializing" }))).toBe(true);
  });

  it("shows for needs_rematerialization", () => {
    expect(
      shouldShowMobileCloudWorkspaceStatusScreen(workspaceFixture({ status: "needs_rematerialization" })),
    ).toBe(true);
  });

  it("shows for error", () => {
    expect(shouldShowMobileCloudWorkspaceStatusScreen(workspaceFixture({ status: "error" }))).toBe(true);
  });

  it("shows for archived", () => {
    expect(shouldShowMobileCloudWorkspaceStatusScreen(workspaceFixture({ status: "archived" }))).toBe(true);
  });

  it("shows when actionBlockKind is set even if status is ready", () => {
    expect(
      shouldShowMobileCloudWorkspaceStatusScreen(
        workspaceFixture({ status: "ready", actionBlockKind: "credits_exhausted" }),
      ),
    ).toBe(true);
  });

  it("does not show for a ready, unblocked workspace", () => {
    expect(shouldShowMobileCloudWorkspaceStatusScreen(workspaceFixture({ status: "ready" }))).toBe(false);
  });

  it("does not show when optional block fields are entirely omitted", () => {
    const { actionBlockKind: _actionBlockKind, actionBlockReason: _actionBlockReason, ...workspace } =
      workspaceFixture({ status: "ready" });
    expect(shouldShowMobileCloudWorkspaceStatusScreen(workspace)).toBe(false);
  });

  it("returns false for a null workspace", () => {
    expect(shouldShowMobileCloudWorkspaceStatusScreen(null)).toBe(false);
  });
});

describe("buildMobileCloudWorkspaceStatusView", () => {
  it("returns null once the workspace is ready and unblocked", () => {
    expect(buildMobileCloudWorkspaceStatusView(workspaceFixture({ status: "ready" }))).toBeNull();
  });

  it("maps pending to the 'Preparing cloud workspace' progress state, no retry", () => {
    const view = buildMobileCloudWorkspaceStatusView(workspaceFixture({ status: "pending" }));
    expect(view).toMatchObject({
      mode: "pending",
      title: "Preparing cloud workspace",
      description: "Waiting to prepare the cloud workspace.",
    });
    expect(view?.retry).toBeNull();
  });

  it("maps materializing to the runtime-preparing description", () => {
    const view = buildMobileCloudWorkspaceStatusView(workspaceFixture({ status: "materializing" }));
    expect(view).toMatchObject({
      mode: "pending",
      title: "Preparing cloud workspace",
      description: "Preparing the repo runtime and materializing the cloud worktree.",
    });
  });

  it("prefers the server-reported statusDetail over the generic step description", () => {
    const view = buildMobileCloudWorkspaceStatusView(
      workspaceFixture({ status: "materializing", statusDetail: "Cloning repository..." }),
    );
    expect(view?.description).toBe("Cloning repository...");
  });

  it("shows the first-runtime footer message for a brand-new repo (generation 0)", () => {
    const view = buildMobileCloudWorkspaceStatusView(
      workspaceFixture({ status: "materializing", runtime: { generation: 0 } }),
    );
    expect(view?.footerMessage).toBe(
      "First cloud workspace for this repo can take longer while we start the shared runtime. Later workspaces usually reuse it.",
    );
  });

  it("shows the generic auto-refresh footer once the runtime has run before (generation > 0)", () => {
    const view = buildMobileCloudWorkspaceStatusView(
      workspaceFixture({ status: "materializing", runtime: { generation: 2 } }),
    );
    expect(view?.footerMessage).toBe(
      "This view refreshes automatically and will switch into the workspace once the runtime is ready.",
    );
  });

  it("shows the generic auto-refresh footer when runtime is missing entirely", () => {
    const view = buildMobileCloudWorkspaceStatusView(
      workspaceFixture({ status: "materializing", runtime: undefined }),
    );
    expect(view?.footerMessage).toBe(
      "This view refreshes automatically and will switch into the workspace once the runtime is ready.",
    );
  });

  it("maps error to a retryable 'Provisioning failed' state", () => {
    const view = buildMobileCloudWorkspaceStatusView(workspaceFixture({ status: "error" }));
    expect(view).toMatchObject({
      mode: "error",
      title: "Provisioning failed",
      description: "Provisioning hit an error before the workspace became ready.",
    });
    expect(view?.retry).toEqual({
      label: "Retry provisioning",
      helperText: "The workspace record is kept and we will retry setup from there.",
    });
  });

  it("prefers lastError, then statusDetail, then generic copy for the error description", () => {
    expect(
      buildMobileCloudWorkspaceStatusView(
        workspaceFixture({ status: "error", lastError: "Repo clone failed", statusDetail: "ignored" }),
      )?.description,
    ).toBe("Repo clone failed");
    expect(
      buildMobileCloudWorkspaceStatusView(
        workspaceFixture({ status: "error", lastError: null, statusDetail: "Setup script exited 1" }),
      )?.description,
    ).toBe("Setup script exited 1");
  });

  it("maps archived to a non-retryable 'Workspace archived' state", () => {
    const view = buildMobileCloudWorkspaceStatusView(workspaceFixture({ status: "archived" }));
    expect(view).toMatchObject({
      mode: "archived",
      title: "Workspace archived",
      description: "This cloud workspace has been archived.",
    });
    expect(view?.retry).toBeNull();
  });

  it("prefers statusDetail for the archived description when present", () => {
    const view = buildMobileCloudWorkspaceStatusView(
      workspaceFixture({ status: "archived", statusDetail: "Archived by owner" }),
    );
    expect(view?.description).toBe("Archived by owner");
  });

  it("maps a billing block to the specific reason's copy, not a generic message", () => {
    const view = buildMobileCloudWorkspaceStatusView(
      workspaceFixture({
        status: "ready",
        actionBlockKind: "credits_exhausted",
        actionBlockReason: "Cloud usage is paused because your included sandbox hours are exhausted.",
      }),
    );
    expect(view).toMatchObject({
      mode: "blocked",
      title: "Cloud usage is paused",
      description: "Cloud usage is paused because your included sandbox hours are exhausted.",
    });
    expect(view?.retry).toBeNull();
  });

  it("falls back to the reason-derived description when the server sends no actionBlockReason string", () => {
    const view = buildMobileCloudWorkspaceStatusView(
      workspaceFixture({ status: "ready", actionBlockKind: "cap_exhausted", actionBlockReason: null }),
    );
    expect(view?.description).toBe(
      "Cloud usage is paused because the managed cloud overage cap is exhausted.",
    );
  });

  it("gives concurrency_limit its distinct 'Sandbox limit reached' title", () => {
    const view = buildMobileCloudWorkspaceStatusView(
      workspaceFixture({ status: "ready", actionBlockKind: "concurrency_limit", actionBlockReason: null }),
    );
    expect(view).toMatchObject({
      mode: "blocked",
      title: "Sandbox limit reached",
      description: "Archive or delete another cloud workspace before starting this one.",
    });
  });

  it("takes priority over pending/error status when both are present", () => {
    // A workspace can be blocked while its provisioning status is still
    // "pending" (server sets actionBlockKind before it even starts). The
    // block reason must win — matches web's `buildCloudWorkspaceStatusScreenModel`.
    const view = buildMobileCloudWorkspaceStatusView(
      workspaceFixture({ status: "pending", actionBlockKind: "admin_hold", actionBlockReason: null }),
    );
    expect(view?.mode).toBe("blocked");
    expect(view?.title).toBe("Cloud usage is paused");
  });
});
