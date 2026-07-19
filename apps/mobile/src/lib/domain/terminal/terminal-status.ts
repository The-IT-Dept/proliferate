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
 *   close-button gating). With no web label to copy, "verbatim" here means
 *   the raw enum string itself, lower-case exactly like the design doc's own
 *   status copy ("connected", "exited (code)", "disconnected") — never an
 *   invented word like "Running"/"Failed".
 * - `TerminalStreamConnectionState` (`terminal-stream-controller.ts`) — this
 *   client's *live WebSocket* state, which is what the mockup's status line
 *   copy ("connected"/"connecting"/"disconnected") actually describes.
 */

export function terminalStatusLabel(status: TerminalStatus): string {
  return status;
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
