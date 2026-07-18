import { describe, expect, it } from "vitest";

import { mobileWorkspaceHref } from "./mobile-workspace-route";

describe("mobileWorkspaceHref", () => {
  it("builds a bare workspace href with just an id", () => {
    expect(mobileWorkspaceHref("ws1")).toEqual({
      pathname: "/workspace/[id]",
      params: { id: "ws1" },
    });
  });

  it("includes sessionId when provided", () => {
    expect(mobileWorkspaceHref("ws1", { sessionId: "sess-2" })).toEqual({
      pathname: "/workspace/[id]",
      params: { id: "ws1", sessionId: "sess-2" },
    });
  });

  it("includes interaction (from requestId) when provided", () => {
    expect(mobileWorkspaceHref("ws1", { requestId: "req-3" })).toEqual({
      pathname: "/workspace/[id]",
      params: { id: "ws1", interaction: "req-3" },
    });
  });

  it("omits null/undefined optional fields", () => {
    expect(mobileWorkspaceHref("ws1", { sessionId: null, requestId: null })).toEqual({
      pathname: "/workspace/[id]",
      params: { id: "ws1" },
    });
  });

  it("includes both sessionId and interaction when both are provided", () => {
    expect(mobileWorkspaceHref("ws1", { sessionId: "sess-2", requestId: "req-3" })).toEqual({
      pathname: "/workspace/[id]",
      params: { id: "ws1", sessionId: "sess-2", interaction: "req-3" },
    });
  });
});
