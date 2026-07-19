import { describe, expect, it } from "vitest";

import { mobileWorkspaceHref, mobileWorkspacePath } from "./mobile-workspace-route";

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

describe("mobileWorkspacePath", () => {
  it("builds a bare workspace path with just an id", () => {
    expect(mobileWorkspacePath("ws1")).toBe("/workspace/ws1");
  });

  it("includes sessionId as a query param when provided", () => {
    expect(mobileWorkspacePath("ws1", { sessionId: "sess-2" })).toBe("/workspace/ws1?sessionId=sess-2");
  });

  it("includes interaction (from requestId) as a query param when provided", () => {
    expect(mobileWorkspacePath("ws1", { requestId: "req-3" })).toBe("/workspace/ws1?interaction=req-3");
  });

  it("omits null/undefined optional fields", () => {
    expect(mobileWorkspacePath("ws1", { sessionId: null, requestId: null })).toBe("/workspace/ws1");
  });

  it("includes both sessionId and interaction when both are provided", () => {
    expect(mobileWorkspacePath("ws1", { sessionId: "sess-2", requestId: "req-3" })).toBe(
      "/workspace/ws1?sessionId=sess-2&interaction=req-3",
    );
  });

  it("percent-encodes the workspace id segment", () => {
    expect(mobileWorkspacePath("ws one")).toBe("/workspace/ws%20one");
  });
});
