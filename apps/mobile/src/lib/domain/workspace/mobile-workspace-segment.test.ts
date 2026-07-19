import { describe, expect, it } from "vitest";

import {
  WORKSPACE_SEGMENTS,
  defaultWorkspaceSegment,
  isWorkspaceSegmentId,
} from "./mobile-workspace-segment";

describe("WORKSPACE_SEGMENTS", () => {
  it("lists the four shell segments in mockup order: Sessions, Chat, Term, Diff", () => {
    expect(WORKSPACE_SEGMENTS.map((segment) => segment.id)).toEqual([
      "sessions",
      "chat",
      "term",
      "diff",
    ]);
    expect(WORKSPACE_SEGMENTS.map((segment) => segment.label)).toEqual([
      "Sessions",
      "Chat",
      "Term",
      "Diff",
    ]);
  });

  it("gives every segment an icon", () => {
    for (const segment of WORKSPACE_SEGMENTS) {
      expect(segment.icon).toBeTruthy();
    }
  });
});

describe("defaultWorkspaceSegment", () => {
  it("opens on Chat when a session is already targeted (deep link / launch)", () => {
    expect(defaultWorkspaceSegment("session-1")).toBe("chat");
  });

  it("opens on Chat by default so the open-workspace loop lands where the work is", () => {
    expect(defaultWorkspaceSegment(null)).toBe("chat");
  });
});

describe("isWorkspaceSegmentId", () => {
  it("accepts the four known segment ids and rejects anything else", () => {
    expect(isWorkspaceSegmentId("sessions")).toBe(true);
    expect(isWorkspaceSegmentId("chat")).toBe(true);
    expect(isWorkspaceSegmentId("term")).toBe(true);
    expect(isWorkspaceSegmentId("diff")).toBe(true);
    expect(isWorkspaceSegmentId("changes")).toBe(false);
    expect(isWorkspaceSegmentId(null)).toBe(false);
  });
});
