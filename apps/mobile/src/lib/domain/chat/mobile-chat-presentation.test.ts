import { describe, expect, it } from "vitest";

import {
  contextCapsuleStatusFromMobileStatus,
  contextCapsuleStatusFromSessionActivity,
  mobileStatus,
} from "./mobile-chat-presentation";

describe("contextCapsuleStatusFromMobileStatus", () => {
  it("maps running to running", () => {
    expect(contextCapsuleStatusFromMobileStatus("running")).toBe("running");
  });

  it("maps failed to errored", () => {
    expect(contextCapsuleStatusFromMobileStatus("failed")).toBe("errored");
  });

  it("maps paused to idle", () => {
    expect(contextCapsuleStatusFromMobileStatus("paused")).toBe("idle");
  });

  it("maps done to idle", () => {
    expect(contextCapsuleStatusFromMobileStatus("done")).toBe("idle");
  });

  it("maps idle to idle", () => {
    expect(contextCapsuleStatusFromMobileStatus("idle")).toBe("idle");
  });
});

describe("mobileStatus", () => {
  it("maps the real SessionStatus enum value 'errored' to failed, not idle", () => {
    // Regression: SessionStatus's actual failure value is "errored", not
    // "error"/"failed" — a session in that state used to fall through to the
    // idle branch below, so the always-on capsule showed idle instead of
    // error for an errored session.
    expect(mobileStatus("errored")).toBe("failed");
  });

  it("still maps the workspace/runtime-status vocabulary's 'error' to failed", () => {
    expect(mobileStatus("error")).toBe("failed");
  });
});

describe("contextCapsuleStatusFromSessionActivity", () => {
  it("maps iterating to running", () => {
    expect(contextCapsuleStatusFromSessionActivity("iterating")).toBe("running");
  });

  it("maps waiting_input to awaiting", () => {
    expect(contextCapsuleStatusFromSessionActivity("waiting_input")).toBe("awaiting");
  });

  it("maps waiting_plan to awaiting", () => {
    expect(contextCapsuleStatusFromSessionActivity("waiting_plan")).toBe("awaiting");
  });

  it("maps error to errored", () => {
    expect(contextCapsuleStatusFromSessionActivity("error")).toBe("errored");
  });

  it("maps closed to idle", () => {
    expect(contextCapsuleStatusFromSessionActivity("closed")).toBe("idle");
  });

  it("maps idle to idle", () => {
    expect(contextCapsuleStatusFromSessionActivity("idle")).toBe("idle");
  });
});
