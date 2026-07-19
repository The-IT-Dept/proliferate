import { describe, expect, it } from "vitest";

import {
  applyTerminalAccessoryModifier,
  bytesForAccessoryKey,
  controlByteForChar,
  metaEncodeChar,
  TERMINAL_ACCESSORY_KEYS,
} from "./terminal-accessory-keys";

/**
 * F-build — the terminal keyboard accessory bar's key -> control-byte
 * mapping (IA `Term (G)`: "glass key-accessory row (esc ⇥ ⌃ ⌥ / – arrows)").
 * Two families:
 *  - Immediate keys (esc/tab/slash/dash/arrows) send fixed bytes the instant
 *    they're tapped.
 *  - Sticky modifiers (ctrl/alt) arm state that transforms the *next*
 *    keystroke typed on the system keyboard — there's no on-screen letter
 *    row in the accessory bar itself (mirrors mobile terminal apps'
 *    Ctrl-then-letter UX), so `applyTerminalAccessoryModifier` is what
 *    `MobileWorkspaceTerminalSegment` calls on every `onInput` while a
 *    modifier is armed.
 */

describe("TERMINAL_ACCESSORY_KEYS", () => {
  it("lists exactly the mockup's ten keys, in the mockup's left-to-right order", () => {
    expect(TERMINAL_ACCESSORY_KEYS.map((key) => key.id)).toEqual([
      "esc", "tab", "ctrl", "alt", "slash", "dash", "up", "down", "left", "right",
    ]);
  });

  it("marks only ctrl and alt as sticky modifiers", () => {
    const sticky = TERMINAL_ACCESSORY_KEYS.filter((key) => key.sticky).map((key) => key.id);
    expect(sticky).toEqual(["ctrl", "alt"]);
  });
});

describe("bytesForAccessoryKey", () => {
  it("sends ESC for the esc key", () => {
    expect(bytesForAccessoryKey("esc")).toBe("\x1b");
  });

  it("sends a horizontal tab for the tab key", () => {
    expect(bytesForAccessoryKey("tab")).toBe("\t");
  });

  it("sends the literal characters for slash and dash", () => {
    expect(bytesForAccessoryKey("slash")).toBe("/");
    expect(bytesForAccessoryKey("dash")).toBe("-");
  });

  it("sends the standard CSI cursor sequences for the arrow keys", () => {
    expect(bytesForAccessoryKey("up")).toBe("\x1b[A");
    expect(bytesForAccessoryKey("down")).toBe("\x1b[B");
    expect(bytesForAccessoryKey("right")).toBe("\x1b[C");
    expect(bytesForAccessoryKey("left")).toBe("\x1b[D");
  });

  it("returns null for the sticky modifier keys — they never send bytes directly", () => {
    expect(bytesForAccessoryKey("ctrl")).toBeNull();
    expect(bytesForAccessoryKey("alt")).toBeNull();
  });
});

describe("controlByteForChar", () => {
  it("maps Ctrl-C to 0x03 (ETX), the SIGINT byte, for both cases", () => {
    expect(controlByteForChar("c")).toBe("\x03");
    expect(controlByteForChar("C")).toBe("\x03");
  });

  it("maps Ctrl-A through Ctrl-Z across the full alphabet (& 0x1f)", () => {
    expect(controlByteForChar("a")).toBe("\x01");
    expect(controlByteForChar("z")).toBe("\x1a");
    expect(controlByteForChar("d")).toBe("\x04"); // EOF
    expect(controlByteForChar("l")).toBe("\x0c"); // clear screen
  });

  it("maps the punctuation controls (@ [ \\ ] ^ _) to their standard bytes", () => {
    expect(controlByteForChar("@")).toBe("\x00");
    expect(controlByteForChar("[")).toBe("\x1b");
    expect(controlByteForChar("\\")).toBe("\x1c");
    expect(controlByteForChar("]")).toBe("\x1d");
    expect(controlByteForChar("^")).toBe("\x1e");
    expect(controlByteForChar("_")).toBe("\x1f");
  });

  it("maps Ctrl-? to DEL (0x7f)", () => {
    expect(controlByteForChar("?")).toBe("\x7f");
  });

  it("returns null for characters with no control mapping", () => {
    expect(controlByteForChar("5")).toBeNull();
    expect(controlByteForChar("!")).toBeNull();
  });

  it("returns null for anything that isn't exactly one character", () => {
    expect(controlByteForChar("")).toBeNull();
    expect(controlByteForChar("cc")).toBeNull();
  });
});

describe("metaEncodeChar", () => {
  it("prefixes ESC before the character (standard \"Meta sends Escape\" encoding)", () => {
    expect(metaEncodeChar("f")).toBe("\x1bf");
    expect(metaEncodeChar("b")).toBe("\x1bb");
  });
});

describe("applyTerminalAccessoryModifier", () => {
  it("passes input through unchanged when no modifier is armed", () => {
    expect(applyTerminalAccessoryModifier(null, "c")).toBe("c");
  });

  it("transforms a single character via the ctrl modifier", () => {
    expect(applyTerminalAccessoryModifier("ctrl", "c")).toBe("\x03");
  });

  it("transforms a single character via the alt modifier", () => {
    expect(applyTerminalAccessoryModifier("alt", "f")).toBe("\x1bf");
  });

  it("falls back to the raw character when ctrl has no mapping for it", () => {
    expect(applyTerminalAccessoryModifier("ctrl", "5")).toBe("5");
  });

  it("passes multi-character input through unchanged (e.g. a paste) regardless of an armed modifier", () => {
    expect(applyTerminalAccessoryModifier("ctrl", "hello")).toBe("hello");
  });
});
