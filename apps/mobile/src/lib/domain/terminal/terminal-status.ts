import type { TerminalStatus } from "@anyharness/sdk";

import type { TerminalStreamConnectionState } from "../../../hooks/terminal/derived/terminal-stream-controller";

/**
 * F-build — status vocabulary for the roster + status line (IA `Term (G)`:
 * `"Terminal 1 · 80×24 · connected"` status line; `"exited (code)"` state
 * copy; roster "unread dots"/close gating). Two distinct status spaces feed
 * the UI and are kept separate on purpose:
 *
 * - `TerminalStatus` (`starting` | `running` | `exited` | `failed`) — the
 *   *record's* server-side lifecycle, from `TerminalRecord.status`
 *   (`anyharness/sdk`, generated from the OpenAPI `TerminalStatus` enum).
 *   Neither `TerminalTopBar` nor `TerminalPanel` (web) render this as
 *   user-facing text anywhere — they only branch on it (read-only replay,
 *   close-button gating). With no web label to copy, there's no "verbatim"
 *   web string to match; this roster-row label is a mobile-only addition
 *   (the roster is itself mobile-only), so it's Title-cased for polish
 *   ("Starting"/"Running"/"Exited"/"Failed") rather than echoing the raw
 *   lower-case SDK enum value.
 * - `TerminalStreamConnectionState` (`terminal-stream-controller.ts`) — this
 *   client's *live WebSocket* state, which is what the mockup's status line
 *   copy ("connected"/"connecting"/"disconnected") actually describes; that
 *   copy IS verbatim from the design doc and stays lower-case (see
 *   `terminalConnectionStatusLabel`/`terminalExitedLabel` below).
 */

const TERMINAL_STATUS_TITLE_CASE_LABEL: Record<TerminalStatus, string> = {
  starting: "Starting",
  running: "Running",
  exited: "Exited",
  failed: "Failed",
};

/** Title-cased roster-row label for `TerminalRecord.status` — mobile has no
 * web label to mirror here (see module doc), so this Title-cases the raw
 * enum for roster polish rather than showing it lower-case. */
export function terminalStatusLabel(status: TerminalStatus): string {
  return TERMINAL_STATUS_TITLE_CASE_LABEL[status];
}

export type TerminalStatusTone = "positive" | "default" | "muted" | "danger";

const TERMINAL_STATUS_TONE: Record<TerminalStatus, TerminalStatusTone> = {
  starting: "default",
  running: "positive",
  exited: "muted",
  failed: "danger",
};

export function terminalStatusTone(status: TerminalStatus): TerminalStatusTone {
  return TERMINAL_STATUS_TONE[status];
}

/** `starting`/`running` are attachable/resizable live PTYs; `exited`/`failed`
 * are terminal (pun intended) records that only support read-only replay +
 * close — mirrors web's `ensureTabConnection` gate
 * (`use-terminal-stream-controller.ts`: `status === "exited" || status ===
 * "failed"` -> `markReadOnly`). */
export function isTerminalLive(status: TerminalStatus): boolean {
  return status === "starting" || status === "running";
}

/** The IA's verbatim `exited (code)` state copy; omits the parenthetical
 * when no exit code was reported (matches `TerminalRecord.exitCode`'s
 * `number | null | undefined`). */
export function terminalExitedLabel(exitCode: number | null | undefined): string {
  return exitCode === null || exitCode === undefined ? "exited" : `exited (${exitCode})`;
}

const CONNECTION_STATE_LABEL: Record<TerminalStreamConnectionState, string> = {
  idle: "idle",
  connecting: "connecting",
  open: "connected",
  reconnecting: "reconnecting",
  closed: "disconnected",
  error: "error",
};

export function terminalConnectionStatusLabel(state: TerminalStreamConnectionState): string {
  return CONNECTION_STATE_LABEL[state];
}

/** The IA's verbatim status-line format: `"Terminal 1 · 80×24 · connected"`.
 * `cols`/`rows` are `null` before the WebView's first `onReady`/`onResize`
 * (nothing measured yet) — the size segment is dropped rather than showing a
 * placeholder measurement. */
export function terminalStatusLine(input: {
  title: string;
  cols: number | null;
  rows: number | null;
  connectionLabel: string;
}): string {
  const segments = [input.title];
  if (input.cols !== null && input.rows !== null) {
    segments.push(`${input.cols}×${input.rows}`);
  }
  segments.push(input.connectionLabel);
  return segments.join(" · ");
}
