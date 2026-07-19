import { describe, expect, it } from "vitest";

import { contextCapsuleStatusFromMobileStatus } from "./mobile-chat-presentation";

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
