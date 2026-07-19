import { describe, expect, it } from "vitest";
import type { TerminalRecord } from "@anyharness/sdk";

import {
  selectActiveTerminal,
  sortTerminalsForRoster,
  terminalDisplayTitle,
} from "./terminal-roster";

/**
 * F-build — the roster's derivation/sort + active-terminal selection logic.
 * `sortTerminalsForRoster` and `selectActiveTerminal` back both the roster
 * sheet's ordering and `MobileWorkspaceTerminalSegment`'s single-attached-
 * WebView selection (only one `MobileTerminalView` is ever mounted; this is
 * the pure logic that decides *which* `TerminalRecord` that is).
 */

function terminal(overrides: Partial<TerminalRecord> & { id: string }): TerminalRecord {
  return {
    workspaceId: "workspace-1",
    title: "Terminal",
    purpose: "general",
    status: "running",
    cwd: "/workspace",
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    ...overrides,
  };
}

describe("terminalDisplayTitle", () => {
  it("falls back to \"Terminal {n}\" (1-indexed) when the record still has the default title", () => {
    expect(terminalDisplayTitle(terminal({ id: "a", title: "Terminal" }), 0)).toBe("Terminal 1");
    expect(terminalDisplayTitle(terminal({ id: "b", title: "Terminal" }), 2)).toBe("Terminal 3");
  });

  it("uses the record's own title once it's been renamed away from the default", () => {
    expect(terminalDisplayTitle(terminal({ id: "a", title: "refund-webhooks" }), 0))
      .toBe("refund-webhooks");
  });
});

describe("sortTerminalsForRoster", () => {
  it("surfaces live (starting/running) terminals before exited/failed ones", () => {
    const exited = terminal({ id: "exited", status: "exited" });
    const running = terminal({ id: "running", status: "running" });
    const failed = terminal({ id: "failed", status: "failed" });
    const starting = terminal({ id: "starting", status: "starting" });

    const sorted = sortTerminalsForRoster([exited, running, failed, starting]);

    expect(sorted.map((t) => t.id)).toEqual(["running", "starting", "exited", "failed"]);
  });

  it("preserves relative order within the live group and within the dead group (stable partition)", () => {
    const a = terminal({ id: "a", status: "running" });
    const b = terminal({ id: "b", status: "exited" });
    const c = terminal({ id: "c", status: "starting" });
    const d = terminal({ id: "d", status: "failed" });

    expect(sortTerminalsForRoster([a, b, c, d]).map((t) => t.id)).toEqual(["a", "c", "b", "d"]);
  });

  it("returns an empty array unchanged", () => {
    expect(sortTerminalsForRoster([])).toEqual([]);
  });
});

describe("selectActiveTerminal", () => {
  it("keeps the explicitly active terminal when it's still present, regardless of roster order", () => {
    const running = terminal({ id: "running", status: "running" });
    const exited = terminal({ id: "exited", status: "exited" });
    expect(selectActiveTerminal([running, exited], "exited")?.id).toBe("exited");
  });

  it("falls back to the best live terminal when nothing is explicitly active", () => {
    const exited = terminal({ id: "exited", status: "exited" });
    const running = terminal({ id: "running", status: "running" });
    expect(selectActiveTerminal([exited, running], null)?.id).toBe("running");
  });

  it("falls back to the best live terminal when the explicitly active one no longer exists (closed elsewhere)", () => {
    const exited = terminal({ id: "exited", status: "exited" });
    const running = terminal({ id: "running", status: "running" });
    expect(selectActiveTerminal([exited, running], "closed-elsewhere")?.id).toBe("running");
  });

  it("falls back to the first exited/failed terminal when none are live", () => {
    const exited = terminal({ id: "exited", status: "exited" });
    const failed = terminal({ id: "failed", status: "failed" });
    expect(selectActiveTerminal([exited, failed], null)?.id).toBe("exited");
  });

  it("returns null for an empty roster", () => {
    expect(selectActiveTerminal([], "anything")).toBeNull();
  });
});
