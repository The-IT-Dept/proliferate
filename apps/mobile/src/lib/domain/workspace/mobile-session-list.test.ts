import { describe, expect, it } from "vitest";
import type { Session, SessionExecutionSummary } from "@anyharness/sdk";

import {
  chatSegmentAttentionCount,
  compareMobileSessions,
  groupWorkspaceSessions,
  isSessionClosed,
  isSessionHidden,
  mobileSessionAttentionDetail,
  mobileSessionStatusLabel,
  pendingInteractionKindLabel,
} from "./mobile-session-list";

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: overrides.id ?? "s1",
    workspaceId: overrides.workspaceId ?? "ws",
    agentKind: overrides.agentKind ?? "claude",
    status: overrides.status ?? "idle",
    createdAt: overrides.createdAt ?? "2026-07-19T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-07-19T00:00:00.000Z",
    actionCapabilities: overrides.actionCapabilities ?? { fork: false, targetedFork: false },
    ...overrides,
  } as Session;
}

function executionSummary(
  overrides: Partial<SessionExecutionSummary> = {},
): SessionExecutionSummary {
  return {
    phase: "idle",
    hasLiveHandle: true,
    updatedAt: "2026-07-19T00:00:00.000Z",
    ...overrides,
  };
}

describe("mobileSessionStatusLabel", () => {
  it("labels a running session 'Iterating' with the live tone (verbatim from web sidebar-indicators)", () => {
    const result = mobileSessionStatusLabel(
      session({ status: "running", executionSummary: executionSummary({ phase: "running" }) }),
    );
    expect(result).toEqual({ label: "Iterating", tone: "live" });
  });

  it("labels a session awaiting a permission/question interaction 'Waiting for input' with the attention tone", () => {
    const result = mobileSessionStatusLabel(
      session({
        status: "running",
        executionSummary: executionSummary({
          phase: "awaiting_interaction",
          pendingInteractions: [
            {
              requestId: "r1",
              kind: "permission",
              title: "Run tests?",
              payload: {} as never,
              source: {} as never,
            },
          ],
        }),
      }),
    );
    expect(result).toEqual({ label: "Waiting for input", tone: "attention" });
  });

  it("labels a plan-approval interaction 'Waiting for plan approval' with the attention tone", () => {
    const result = mobileSessionStatusLabel(
      session({
        status: "running",
        executionSummary: executionSummary({
          phase: "awaiting_interaction",
          pendingInteractions: [
            {
              requestId: "r1",
              kind: "user_input",
              title: "Approve plan",
              payload: {} as never,
              source: { linkedPlanId: "plan-1" } as never,
              linkedPlanId: "plan-1",
            } as never,
          ],
        }),
      }),
    );
    expect(result).toEqual({ label: "Waiting for plan approval", tone: "attention" });
  });

  it("labels an errored session 'Error' with the failed tone", () => {
    const result = mobileSessionStatusLabel(session({ status: "errored" }));
    expect(result).toEqual({ label: "Error", tone: "failed" });
  });

  it("labels a closed session 'Closed' with the stopped tone", () => {
    const result = mobileSessionStatusLabel(session({ status: "closed" }));
    expect(result).toEqual({ label: "Closed", tone: "stopped" });
  });

  it("labels an idle (commandable) session 'Idle' with the ready tone", () => {
    const result = mobileSessionStatusLabel(session({ status: "idle" }));
    expect(result).toEqual({ label: "Idle", tone: "ready" });
  });

  it("labels a dismissed session 'Hidden' (verbatim from web ChatTabsMenu), regardless of underlying status", () => {
    const result = mobileSessionStatusLabel(
      session({ status: "running", dismissedAt: "2026-07-18T00:00:00.000Z" }),
    );
    expect(result).toEqual({ label: "Hidden", tone: "stopped" });
  });
});

describe("pendingInteractionKindLabel", () => {
  it("maps each InteractionKind to its verbatim card title", () => {
    expect(pendingInteractionKindLabel("permission")).toBe("Permission request");
    expect(pendingInteractionKindLabel("user_input")).toBe("Question");
    expect(pendingInteractionKindLabel("mcp_elicitation")).toBe("MCP elicitation");
  });
});

describe("mobileSessionAttentionDetail", () => {
  it("returns the first pending interaction's kind label when the session is waiting", () => {
    const detail = mobileSessionAttentionDetail(
      session({
        status: "running",
        executionSummary: executionSummary({
          phase: "awaiting_interaction",
          pendingInteractions: [
            { requestId: "r1", kind: "permission", title: "x", payload: {} as never, source: {} as never },
          ],
        }),
      }),
    );
    expect(detail).toBe("Permission request");
  });

  it("returns null when there is no pending interaction", () => {
    expect(mobileSessionAttentionDetail(session({ status: "idle" }))).toBeNull();
  });
});

describe("isSessionHidden / isSessionClosed", () => {
  it("treats a session with dismissedAt as hidden", () => {
    expect(isSessionHidden(session({ dismissedAt: "2026-07-18T00:00:00.000Z" }))).toBe(true);
    expect(isSessionHidden(session({}))).toBe(false);
  });

  it("treats closed/completed status or a closedAt timestamp as closed", () => {
    expect(isSessionClosed(session({ status: "closed" }))).toBe(true);
    expect(isSessionClosed(session({ status: "completed" }))).toBe(true);
    expect(isSessionClosed(session({ closedAt: "2026-07-18T00:00:00.000Z" }))).toBe(true);
    expect(isSessionClosed(session({ status: "running" }))).toBe(false);
  });
});

describe("compareMobileSessions", () => {
  it("orders more-recently-active sessions first (lastPromptAt over updatedAt over createdAt)", () => {
    const older = session({ id: "old", updatedAt: "2026-07-19T10:00:00.000Z" });
    const newer = session({ id: "new", updatedAt: "2026-07-19T12:00:00.000Z" });
    expect([older, newer].sort(compareMobileSessions).map((s) => s.id)).toEqual(["new", "old"]);
  });

  it("prefers lastPromptAt as the recency signal when present", () => {
    const a = session({ id: "a", updatedAt: "2026-07-19T12:00:00.000Z", lastPromptAt: "2026-07-19T09:00:00.000Z" });
    const b = session({ id: "b", updatedAt: "2026-07-19T08:00:00.000Z", lastPromptAt: "2026-07-19T11:00:00.000Z" });
    expect([a, b].sort(compareMobileSessions).map((s) => s.id)).toEqual(["b", "a"]);
  });
});

describe("groupWorkspaceSessions", () => {
  it("splits open sessions into Active and closed/hidden into Earlier, each sorted by recency", () => {
    const activeNewer = session({ id: "active-new", status: "running", updatedAt: "2026-07-19T12:00:00.000Z" });
    const activeOlder = session({ id: "active-old", status: "idle", updatedAt: "2026-07-19T10:00:00.000Z" });
    const closed = session({ id: "closed", status: "closed", updatedAt: "2026-07-18T00:00:00.000Z" });
    const hidden = session({ id: "hidden", status: "idle", dismissedAt: "2026-07-17T00:00:00.000Z", updatedAt: "2026-07-19T13:00:00.000Z" });

    const grouped = groupWorkspaceSessions([closed, activeOlder, hidden, activeNewer]);
    expect(grouped.active.map((s) => s.id)).toEqual(["active-new", "active-old"]);
    expect(grouped.earlier.map((s) => s.id)).toEqual(["hidden", "closed"]);
  });

  it("returns empty groups for no sessions", () => {
    expect(groupWorkspaceSessions([])).toEqual({ active: [], earlier: [] });
  });
});

describe("chatSegmentAttentionCount", () => {
  it("counts sessions that need attention (waiting for input/plan or errored)", () => {
    const waiting = session({
      id: "w",
      status: "running",
      executionSummary: executionSummary({
        phase: "awaiting_interaction",
        pendingInteractions: [
          { requestId: "r", kind: "permission", title: "x", payload: {} as never, source: {} as never },
        ],
      }),
    });
    const errored = session({ id: "e", status: "errored" });
    const iterating = session({ id: "i", status: "running", executionSummary: executionSummary({ phase: "running" }) });
    const idle = session({ id: "d", status: "idle" });
    expect(chatSegmentAttentionCount([waiting, errored, iterating, idle])).toBe(2);
  });
});
