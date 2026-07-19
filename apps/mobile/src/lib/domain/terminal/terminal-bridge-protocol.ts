import { encodeBytesToBase64 } from "./terminal-base64";

/**
 * Group F spike — the `MobileTerminalView` <-> xterm-host-page wire
 * contract. "Host" is React Native (owns the live `connectTerminal`
 * WebSocket stream); "guest" is the xterm.js page running inside the
 * `WebView`. `WebView.postMessage`/`onMessage` only carries strings, so both
 * directions are JSON-encoded here — this module is the single source of
 * truth for that shape, independent of any WebView/RN rendering so it's
 * plain-vitest testable.
 */

// ---- Host (RN) -> Guest (xterm page) --------------------------------------

export type TerminalHostToGuestMessage =
  | { type: "data"; dataBase64: string }
  | { type: "gap" }
  | { type: "exit"; code: number | null };

export function encodeHostToGuestMessage(message: TerminalHostToGuestMessage): string {
  return JSON.stringify(message);
}

/** PTY output bytes (already decoded by the SDK's `connectTerminal`) ->
 * base64 data message, ready to hand to `WebView.postMessage`. */
export function encodeTerminalDataMessage(bytes: Uint8Array): string {
  return encodeHostToGuestMessage({ type: "data", dataBase64: encodeBytesToBase64(bytes) });
}

// ---- Guest (xterm page) -> Host (RN) ---------------------------------------

export type TerminalGuestToHostMessage =
  | { type: "ready"; cols: number; rows: number }
  | { type: "input"; data: string }
  | { type: "resize"; cols: number; rows: number }
  | { type: "error"; message: string };

export const MIN_TERMINAL_COLS = 2;
export const MIN_TERMINAL_ROWS = 2;
export const MAX_TERMINAL_COLS = 500;
export const MAX_TERMINAL_ROWS = 500;

function isFiniteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value);
}

/** Guards a webview-supplied size before it's forwarded to `sendResize()`
 * (the live PTY resize) — mirrors the bounds xterm itself enforces
 * internally (`Terminal._verifyPositiveIntegers`), applied on the RN side of
 * the bridge so a malformed/hostile postMessage can't reach the wire. */
export function isValidTerminalDimensions(cols: unknown, rows: unknown): boolean {
  return (
    isFiniteInteger(cols)
    && isFiniteInteger(rows)
    && cols >= MIN_TERMINAL_COLS
    && cols <= MAX_TERMINAL_COLS
    && rows >= MIN_TERMINAL_ROWS
    && rows <= MAX_TERMINAL_ROWS
  );
}

export function parseGuestToHostMessage(raw: string): TerminalGuestToHostMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const value = parsed as Record<string, unknown>;

  switch (value.type) {
    case "ready": {
      if (!isValidTerminalDimensions(value.cols, value.rows)) return null;
      return { type: "ready", cols: value.cols as number, rows: value.rows as number };
    }
    case "input": {
      if (typeof value.data !== "string") return null;
      return { type: "input", data: value.data };
    }
    case "resize": {
      if (!isValidTerminalDimensions(value.cols, value.rows)) return null;
      return { type: "resize", cols: value.cols as number, rows: value.rows as number };
    }
    case "error": {
      if (typeof value.message !== "string") return null;
      return { type: "error", message: value.message };
    }
    default:
      return null;
  }
}
