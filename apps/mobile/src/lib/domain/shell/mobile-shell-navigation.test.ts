import { describe, expect, it } from "vitest";

import { mobileLinkedChatForWorkspace, mobileWorkspaceLinkFromUrl } from "./mobile-shell-navigation";
import type { CloudSessionProjection, CloudWorkspaceDetail } from "@proliferate/cloud-sdk";

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

describe("mobileLinkedChatForWorkspace", () => {
  const workspace = {
    id: "ws1",
    displayName: "My Workspace",
    repo: { owner: "acme", name: "widgets", branch: "main", baseBranch: "main" },
    targetId: "target-1",
    anyharnessWorkspaceId: "ah-1",
    workspaceStatus: "running",
    status: "running",
    visibility: "private",
  } as unknown as CloudWorkspaceDetail;

  it("threads a deep-linked requestId through as initialInteractionRequestId", () => {
    const chat = mobileLinkedChatForWorkspace(workspace, [], null, "req-42");
    expect(chat?.initialInteractionRequestId).toBe("req-42");
  });

  it("defaults initialInteractionRequestId to null when no requestId is given", () => {
    const chat = mobileLinkedChatForWorkspace(workspace, [], null);
    expect(chat?.initialInteractionRequestId ?? null).toBeNull();
  });

  it("still resolves the linked session as before when sessions are present", () => {
    const sessions = [
      {
        sessionId: "sess-1",
        targetId: "target-1",
        workspaceId: "ah-1",
        title: "Fix bug",
        status: "iterating",
        lastEventAt: "2026-07-18T00:00:00.000Z",
        startedAt: "2026-07-17T00:00:00.000Z",
        lastEventSeq: 5,
      },
    ] as unknown as CloudSessionProjection[];
    const chat = mobileLinkedChatForWorkspace(workspace, sessions, "sess-1", "req-9");
    expect(chat?.sessionId).toBe("sess-1");
    expect(chat?.initialInteractionRequestId).toBe("req-9");
  });
});
