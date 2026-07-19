import { describe, expect, it } from "vitest";

import { decodeBase64ToBytes, encodeBytesToBase64 } from "./terminal-base64";
import {
  encodeHostToGuestMessage,
  encodeTerminalDataMessage,
  isValidTerminalDimensions,
  MAX_TERMINAL_COLS,
  MAX_TERMINAL_ROWS,
  MIN_TERMINAL_COLS,
  MIN_TERMINAL_ROWS,
  parseGuestToHostMessage,
} from "./terminal-bridge-protocol";

/**
 * Group F spike — the `MobileTerminalView` WebView bridge contract. "Host"
 * is the RN side (owns the live `connectTerminal` stream), "guest" is the
 * xterm page running inside the WebView. Both directions are plain JSON over
 * `postMessage`/`onMessage`, which only carries strings — this is the single
 * source of truth for that wire shape, fully testable without a WebView or
 * device.
 */

describe("encodeHostToGuestMessage", () => {
  it("encodes a data message with base64 payload", () => {
    const raw = encodeHostToGuestMessage({ type: "data", dataBase64: "aGVsbG8=" });
    expect(JSON.parse(raw)).toEqual({ type: "data", dataBase64: "aGVsbG8=" });
  });

  it("encodes a gap message", () => {
    const raw = encodeHostToGuestMessage({ type: "gap" });
    expect(JSON.parse(raw)).toEqual({ type: "gap" });
  });

  it("encodes an exit message with a null code", () => {
    const raw = encodeHostToGuestMessage({ type: "exit", code: null });
    expect(JSON.parse(raw)).toEqual({ type: "exit", code: null });
  });

  it("encodes an exit message with a numeric code", () => {
    const raw = encodeHostToGuestMessage({ type: "exit", code: 137 });
    expect(JSON.parse(raw)).toEqual({ type: "exit", code: 137 });
  });
});

describe("encodeTerminalDataMessage", () => {
  it("base64-encodes the given bytes into a data message the guest can decode", () => {
    const bytes = new Uint8Array([0x1b, 0x5b, 0x33, 0x31, 0x6d, 0x00, 0xff]);
    const raw = encodeTerminalDataMessage(bytes);
    const parsed = JSON.parse(raw) as { type: string; dataBase64: string };
    expect(parsed.type).toBe("data");
    expect(decodeBase64ToBytes(parsed.dataBase64)).toEqual(bytes);
  });

  it("round-trips through encodeBytesToBase64 directly (no double-encoding)", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const raw = encodeTerminalDataMessage(bytes);
    const parsed = JSON.parse(raw) as { dataBase64: string };
    expect(parsed.dataBase64).toBe(encodeBytesToBase64(bytes));
  });
});

describe("isValidTerminalDimensions", () => {
  it("accepts sane cols/rows", () => {
    expect(isValidTerminalDimensions(80, 24)).toBe(true);
  });

  it("accepts the minimum boundary", () => {
    expect(isValidTerminalDimensions(MIN_TERMINAL_COLS, MIN_TERMINAL_ROWS)).toBe(true);
  });

  it("rejects one below the minimum boundary", () => {
    expect(isValidTerminalDimensions(MIN_TERMINAL_COLS - 1, MIN_TERMINAL_ROWS)).toBe(false);
    expect(isValidTerminalDimensions(MIN_TERMINAL_COLS, MIN_TERMINAL_ROWS - 1)).toBe(false);
  });

  it("accepts the maximum boundary", () => {
    expect(isValidTerminalDimensions(MAX_TERMINAL_COLS, MAX_TERMINAL_ROWS)).toBe(true);
  });

  it("rejects one above the maximum boundary", () => {
    expect(isValidTerminalDimensions(MAX_TERMINAL_COLS + 1, MAX_TERMINAL_ROWS)).toBe(false);
  });

  it("rejects non-integers, NaN, and Infinity", () => {
    expect(isValidTerminalDimensions(80.5, 24)).toBe(false);
    expect(isValidTerminalDimensions(NaN, 24)).toBe(false);
    expect(isValidTerminalDimensions(80, Infinity)).toBe(false);
  });

  it("rejects zero and negative values", () => {
    expect(isValidTerminalDimensions(0, 24)).toBe(false);
    expect(isValidTerminalDimensions(80, -1)).toBe(false);
  });
});

describe("parseGuestToHostMessage", () => {
  it("parses a valid ready message", () => {
    const raw = JSON.stringify({ type: "ready", cols: 80, rows: 24 });
    expect(parseGuestToHostMessage(raw)).toEqual({ type: "ready", cols: 80, rows: 24 });
  });

  it("parses a valid input message, including an empty string", () => {
    expect(parseGuestToHostMessage(JSON.stringify({ type: "input", data: "ls -la\r" })))
      .toEqual({ type: "input", data: "ls -la\r" });
    expect(parseGuestToHostMessage(JSON.stringify({ type: "input", data: "" })))
      .toEqual({ type: "input", data: "" });
  });

  it("parses a valid resize message", () => {
    const raw = JSON.stringify({ type: "resize", cols: 120, rows: 40 });
    expect(parseGuestToHostMessage(raw)).toEqual({ type: "resize", cols: 120, rows: 40 });
  });

  it("parses a valid error message", () => {
    const raw = JSON.stringify({ type: "error", message: "xterm init failed" });
    expect(parseGuestToHostMessage(raw)).toEqual({ type: "error", message: "xterm init failed" });
  });

  it("returns null for malformed JSON", () => {
    expect(parseGuestToHostMessage("not json{")).toBeNull();
  });

  it("returns null for a JSON value that isn't an object", () => {
    expect(parseGuestToHostMessage("42")).toBeNull();
    expect(parseGuestToHostMessage('"hello"')).toBeNull();
    expect(parseGuestToHostMessage("null")).toBeNull();
  });

  it("returns null for an unknown message type", () => {
    expect(parseGuestToHostMessage(JSON.stringify({ type: "bogus" }))).toBeNull();
  });

  it("returns null when type is missing", () => {
    expect(parseGuestToHostMessage(JSON.stringify({ cols: 80, rows: 24 }))).toBeNull();
  });

  it("returns null for a resize message with an invalid size", () => {
    expect(
      parseGuestToHostMessage(JSON.stringify({ type: "resize", cols: 0, rows: 24 })),
    ).toBeNull();
    expect(
      parseGuestToHostMessage(JSON.stringify({ type: "resize", cols: "80", rows: 24 })),
    ).toBeNull();
  });

  it("returns null for a ready message with an invalid size", () => {
    expect(
      parseGuestToHostMessage(JSON.stringify({ type: "ready", cols: -1, rows: 24 })),
    ).toBeNull();
  });

  it("returns null for an input message with non-string data", () => {
    expect(parseGuestToHostMessage(JSON.stringify({ type: "input", data: 123 }))).toBeNull();
  });

  it("returns null for an error message with non-string message", () => {
    expect(parseGuestToHostMessage(JSON.stringify({ type: "error", message: null }))).toBeNull();
  });
});
