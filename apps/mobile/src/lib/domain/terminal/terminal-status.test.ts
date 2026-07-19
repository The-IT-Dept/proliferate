import { describe, expect, it } from "vitest";

import {
  isTerminalLive,
  terminalConnectionStatusLabel,
  terminalExitedLabel,
  terminalStatusLabel,
  terminalStatusLine,
  terminalStatusTone,
} from "./terminal-status";

/**
 * F-build — status vocabulary for the terminal roster + status line (IA
 * `Term (G)`: "status line `Terminal 1 · 80×24 · connected`" +
 * "exited shows `exited (code)` line"). `TerminalStatus` (`starting` |
 * `running` | `exited` | `failed`, `anyharness/sdk`'s generated
 * `TerminalRecord.status`) has no dedicated web-UI label anywhere — the web
 * `TerminalTopBar`/`TerminalPanel` only branch on it for read-only/close
 * gating, never render it as text — so there's no web copy to mirror
 * verbatim. This roster-row label is a mobile-only addition, Title-cased for
 * polish ("Starting"/"Running"/"Exited"/"Failed") rather than echoing the raw
 * lower-case SDK enum value.
 */

describe("terminalStatusLabel", () => {
  it("returns a Title-cased label for each status", () => {
    expect(terminalStatusLabel("starting")).toBe("Starting");
    expect(terminalStatusLabel("running")).toBe("Running");
    expect(terminalStatusLabel("exited")).toBe("Exited");
    expect(terminalStatusLabel("failed")).toBe("Failed");
  });
});

describe("terminalStatusTone", () => {
  it("marks running as positive and starting as default", () => {
    expect(terminalStatusTone("running")).toBe("positive");
    expect(terminalStatusTone("starting")).toBe("default");
  });

  it("marks exited as muted and failed as danger", () => {
    expect(terminalStatusTone("exited")).toBe("muted");
    expect(terminalStatusTone("failed")).toBe("danger");
  });
});

describe("isTerminalLive", () => {
  it("treats starting and running as live", () => {
    expect(isTerminalLive("starting")).toBe(true);
    expect(isTerminalLive("running")).toBe(true);
  });

  it("treats exited and failed as not live", () => {
    expect(isTerminalLive("exited")).toBe(false);
    expect(isTerminalLive("failed")).toBe(false);
  });
});

describe("terminalExitedLabel", () => {
  it("includes the numeric exit code verbatim per the IA's `exited (code)` copy", () => {
    expect(terminalExitedLabel(0)).toBe("exited (0)");
    expect(terminalExitedLabel(137)).toBe("exited (137)");
  });

  it("omits the parenthetical when the exit code is unknown", () => {
    expect(terminalExitedLabel(null)).toBe("exited");
  });
});

describe("terminalConnectionStatusLabel", () => {
  it("maps every TerminalStreamConnectionState to the design doc's lowercase copy", () => {
    expect(terminalConnectionStatusLabel("idle")).toBe("idle");
    expect(terminalConnectionStatusLabel("connecting")).toBe("connecting");
    expect(terminalConnectionStatusLabel("open")).toBe("connected");
    expect(terminalConnectionStatusLabel("reconnecting")).toBe("reconnecting");
    expect(terminalConnectionStatusLabel("closed")).toBe("disconnected");
    expect(terminalConnectionStatusLabel("error")).toBe("error");
  });
});

describe("terminalStatusLine", () => {
  it("formats title · cols×rows · connection verbatim, mirroring the mockup's \"Terminal 1 · 80×24 · connected\"", () => {
    expect(terminalStatusLine({ title: "Terminal 1", cols: 80, rows: 24, connectionLabel: "connected" }))
      .toBe("Terminal 1 · 80×24 · connected");
  });

  it("omits the size segment when no size has been measured yet", () => {
    expect(terminalStatusLine({ title: "Terminal 1", cols: null, rows: null, connectionLabel: "connecting" }))
      .toBe("Terminal 1 · connecting");
  });
});
