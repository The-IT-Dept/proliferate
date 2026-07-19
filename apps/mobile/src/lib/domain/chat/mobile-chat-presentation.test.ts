import { describe, expect, it } from "vitest";
import type { CloudSessionProjection, CloudWorkspaceDetail } from "@proliferate/cloud-sdk";

import {
  contextCapsuleStatusFromMobileStatus,
  contextCapsuleStatusFromSessionActivity,
  hasReadyAgentKind,
  mobileStatus,
  resolveActiveSession,
  resolveAgentKind,
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

function workspaceFixture(overrides: Partial<CloudWorkspaceDetail> = {}): CloudWorkspaceDetail {
  return {
    readyAgentKinds: [],
    allowedAgentKinds: [],
    ...overrides,
  } as unknown as CloudWorkspaceDetail;
}

describe("resolveAgentKind", () => {
  it("resolves to codex for a codex-only workspace, not the previously hardcoded 'claude'", () => {
    const workspace = workspaceFixture({
      readyAgentKinds: ["codex"],
      allowedAgentKinds: ["claude", "codex"],
    });
    expect(resolveAgentKind(workspace)).toBe("codex");
  });

  it("resolves to the ready kind when codex isn't ready", () => {
    const workspace = workspaceFixture({
      readyAgentKinds: ["claude"],
      allowedAgentKinds: ["claude", "codex"],
    });
    expect(resolveAgentKind(workspace)).toBe("claude");
  });
});

describe("hasReadyAgentKind", () => {
  it("is true once at least one agent kind is ready", () => {
    expect(hasReadyAgentKind(workspaceFixture({ readyAgentKinds: ["codex"] }))).toBe(true);
  });

  it("is false when nothing is ready yet, even if kinds are allowed", () => {
    const workspace = workspaceFixture({
      readyAgentKinds: [],
      allowedAgentKinds: ["claude", "codex"],
    });
    expect(hasReadyAgentKind(workspace)).toBe(false);
  });
});

function sessionFixture(overrides: Partial<CloudSessionProjection> & { sessionId: string }): CloudSessionProjection {
  return {
    workspaceId: "ws-runtime",
    targetId: "target-1",
    title: overrides.sessionId,
    status: "idle",
    lastEventSeq: 0,
    pendingInteractionCount: 0,
    ...overrides,
  };
}

// The list `resolveActiveSession` receives is always pre-sorted most-recent
// first (via `compareSessions`), so index 0 is "most recent" by contract.
const recent = sessionFixture({ sessionId: "s-recent", title: "Recent" });
const older = sessionFixture({ sessionId: "s-older", title: "Older" });
const oldest = sessionFixture({ sessionId: "s-oldest", title: "Oldest" });
const sortedSessions = [recent, older, oldest];

describe("resolveActiveSession", () => {
  it("defaults a bare open to the most-recent session, not an empty state", () => {
    // The core fix: no routed sessionId + no explicit pick + multiple sessions
    // must land on the most-recent session (streams its transcript/history),
    // not leave `session` null / require a choice.
    const result = resolveActiveSession({
      sessions: sortedSessions,
      selectedSessionId: null,
      chatSessionId: null,
      fallbackSession: null,
      newSessionMode: false,
    });
    expect(result.session).toBe(recent);
    expect(result.sessionChoiceRequired).toBe(false);
  });

  it("still defaults to the single session when there is exactly one", () => {
    const result = resolveActiveSession({
      sessions: [older],
      selectedSessionId: null,
      chatSessionId: null,
      fallbackSession: null,
      newSessionMode: false,
    });
    expect(result.session).toBe(older);
  });

  it("has no session (and no forced choice) when the workspace has zero sessions", () => {
    const result = resolveActiveSession({
      sessions: [],
      selectedSessionId: null,
      chatSessionId: null,
      fallbackSession: null,
      newSessionMode: false,
    });
    expect(result.session).toBeNull();
    expect(result.sessionChoiceRequired).toBe(false);
  });

  it("honours an explicit selection over the most-recent default", () => {
    // A tap on an existing (older) session must win — this is the exact path
    // that used to be clobbered back to 'New session'.
    const result = resolveActiveSession({
      sessions: sortedSessions,
      selectedSessionId: "s-oldest",
      chatSessionId: null,
      fallbackSession: null,
      newSessionMode: false,
    });
    expect(result.session).toBe(oldest);
  });

  it("honours the explicit selection even while the routed sessionId points elsewhere", () => {
    const result = resolveActiveSession({
      sessions: sortedSessions,
      selectedSessionId: "s-older",
      chatSessionId: "s-recent",
      fallbackSession: null,
      newSessionMode: false,
    });
    expect(result.session).toBe(older);
  });

  it("resolves the routed sessionId when there is no explicit selection", () => {
    const result = resolveActiveSession({
      sessions: sortedSessions,
      selectedSessionId: null,
      chatSessionId: "s-older",
      fallbackSession: null,
      newSessionMode: false,
    });
    expect(result.session).toBe(older);
  });

  it("falls back to the synthesized chat projection while the routed session isn't in the list yet", () => {
    const fallback = sessionFixture({ sessionId: "s-pending", title: "Pending" });
    const result = resolveActiveSession({
      sessions: [],
      selectedSessionId: null,
      chatSessionId: "s-pending",
      fallbackSession: fallback,
      newSessionMode: false,
    });
    expect(result.session).toBe(fallback);
  });

  it("forces no active session in new-session mode, even with sessions present", () => {
    const result = resolveActiveSession({
      sessions: sortedSessions,
      selectedSessionId: "s-older",
      chatSessionId: null,
      fallbackSession: null,
      newSessionMode: true,
    });
    expect(result.session).toBeNull();
  });

  it("does not default to most-recent when a routed sessionId is present but unresolved", () => {
    // A routed sessionId that matches nothing (stale link, no fallback) yields
    // no session rather than silently jumping to the most-recent one.
    const result = resolveActiveSession({
      sessions: sortedSessions,
      selectedSessionId: null,
      chatSessionId: "s-gone",
      fallbackSession: null,
      newSessionMode: false,
    });
    expect(result.session).toBeNull();
  });
});
