import { describe, expect, it } from "vitest";

import { mobileWorkspaceLinkFromUrl } from "./mobile-deep-link";

describe("mobileWorkspaceLinkFromUrl", () => {
  it("returns null for a null url", () => {
    expect(mobileWorkspaceLinkFromUrl(null)).toBeNull();
  });

  it("returns null for a malformed url", () => {
    expect(mobileWorkspaceLinkFromUrl("not a url")).toBeNull();
  });

  it("returns null for unrelated custom-scheme urls (auth callback)", () => {
    expect(mobileWorkspaceLinkFromUrl("proliferate://auth/callback?code=abc&state=xyz")).toBeNull();
  });

  it("returns null for unrelated custom-scheme urls (github app callback)", () => {
    expect(
      mobileWorkspaceLinkFromUrl("proliferate://settings/environments?source=github_app_callback"),
    ).toBeNull();
  });

  it("parses the canonical plural custom-scheme workspace link", () => {
    expect(mobileWorkspaceLinkFromUrl("proliferate://workspaces/ws1")).toEqual({
      workspaceId: "ws1",
      sessionId: null,
      requestId: null,
    });
  });

  it("parses the singular workspace host used by the IA deep-link table", () => {
    expect(mobileWorkspaceLinkFromUrl("proliferate://workspace/ws1?interaction=req-42")).toEqual({
      workspaceId: "ws1",
      sessionId: null,
      requestId: "req-42",
    });
  });

  it("parses the interaction query param into requestId alongside a path sessionId", () => {
    expect(
      mobileWorkspaceLinkFromUrl("proliferate://workspaces/ws1/sessions/sess-2?interaction=req-3"),
    ).toEqual({
      workspaceId: "ws1",
      sessionId: "sess-2",
      requestId: "req-3",
    });
  });

  it("parses sessionId from a /chats/{id} path segment", () => {
    expect(mobileWorkspaceLinkFromUrl("proliferate://workspaces/ws1/chats/sess-1")).toEqual({
      workspaceId: "ws1",
      sessionId: "sess-1",
      requestId: null,
    });
  });

  it("parses sessionId from a ?sessionId= query param when no session path segment is present", () => {
    expect(
      mobileWorkspaceLinkFromUrl("proliferate://workspaces/ws1?sessionId=sess-9&interaction=req-1"),
    ).toEqual({
      workspaceId: "ws1",
      sessionId: "sess-9",
      requestId: "req-1",
    });
  });

  it("parses the web universal link form (/cloud/workspaces/{id})", () => {
    expect(
      mobileWorkspaceLinkFromUrl("https://proliferate.theitdept.au/cloud/workspaces/ws2?interaction=req-7"),
    ).toEqual({
      workspaceId: "ws2",
      sessionId: null,
      requestId: "req-7",
    });
  });

  it("decodes a percent-encoded workspaceId", () => {
    expect(mobileWorkspaceLinkFromUrl("proliferate://workspaces/ws%20one")).toEqual({
      workspaceId: "ws one",
      sessionId: null,
      requestId: null,
    });
  });

  it("decodes a percent-encoded interaction value", () => {
    expect(mobileWorkspaceLinkFromUrl("proliferate://workspaces/ws1?interaction=req%2F1")).toEqual({
      workspaceId: "ws1",
      sessionId: null,
      requestId: "req/1",
    });
  });

  it("returns null when no workspace id is present in the path", () => {
    expect(mobileWorkspaceLinkFromUrl("proliferate://workspaces")).toBeNull();
  });
});
