import { describe, expect, it } from "vitest";

import { parsePushDeepLink } from "./parse-push-deep-link";

describe("parsePushDeepLink", () => {
  it("parses the Expo push notification data payload (server's build_expo_payload shape)", () => {
    expect(
      parsePushDeepLink({
        workspaceId: "ws1",
        sessionId: "sess1",
        requestId: "req1",
        kind: "permission",
      }),
    ).toEqual({ workspaceId: "ws1", sessionId: "sess1", requestId: "req1" });
  });

  it("nulls out an absent sessionId/requestId in the data payload", () => {
    expect(parsePushDeepLink({ workspaceId: "ws1", kind: "awaiting" })).toEqual({
      workspaceId: "ws1",
      sessionId: null,
      requestId: null,
    });
  });

  it("returns null when the data payload has no workspaceId", () => {
    expect(parsePushDeepLink({ sessionId: "sess1", requestId: "req1" })).toBeNull();
  });

  it("delegates a deep-link URL string to mobileWorkspaceLinkFromUrl", () => {
    expect(parsePushDeepLink("proliferate://workspace/ws1?interaction=req-42")).toEqual({
      workspaceId: "ws1",
      sessionId: null,
      requestId: "req-42",
    });
  });

  it("returns null for a malformed URL string", () => {
    expect(parsePushDeepLink("not a url")).toBeNull();
  });

  it("returns null for an unrelated custom-scheme URL", () => {
    expect(parsePushDeepLink("proliferate://auth/callback?code=abc")).toBeNull();
  });

  it("returns null for null", () => {
    expect(parsePushDeepLink(null)).toBeNull();
  });

  it("returns null for undefined", () => {
    expect(parsePushDeepLink(undefined)).toBeNull();
  });

  it("returns null for a non-string, non-record value (number)", () => {
    expect(parsePushDeepLink(42)).toBeNull();
  });

  it("returns null for a non-string, non-record value (array)", () => {
    expect(parsePushDeepLink(["ws1"])).toBeNull();
  });

  it("returns null when workspaceId in the data payload is not a string", () => {
    expect(parsePushDeepLink({ workspaceId: 123 })).toBeNull();
  });
});
