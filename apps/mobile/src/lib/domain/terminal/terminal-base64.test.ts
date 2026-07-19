import { describe, expect, it } from "vitest";

import { decodeBase64ToBytes, encodeBytesToBase64 } from "./terminal-base64";

/**
 * Group F spike — the postMessage bridge only carries strings (RN
 * `WebView.postMessage`/`onMessage`), so raw PTY output (`Uint8Array`, and
 * genuinely binary — not guaranteed valid UTF-8) has to cross as base64. This
 * is a from-scratch implementation (not `atob`/`btoa`/`Buffer`): Hermes has
 * native `atob`/`btoa` in recent React Native versions, but that's a runtime
 * assumption this module deliberately avoids needing, and `Buffer` doesn't
 * exist in RN at all. Round-trip correctness — including the full 0-255 byte
 * range and non-multiple-of-3 lengths (padding) — is what actually matters
 * for a terminal stream, since ANSI/control bytes and multi-byte UTF-8 output
 * routinely include bytes >= 0x80.
 */

describe("encodeBytesToBase64 / decodeBase64ToBytes round-trip", () => {
  it("round-trips an empty array", () => {
    const bytes = new Uint8Array([]);
    expect(encodeBytesToBase64(bytes)).toBe("");
    expect(decodeBase64ToBytes("")).toEqual(new Uint8Array([]));
  });

  it("round-trips a single byte (needs == padding)", () => {
    const bytes = new Uint8Array([65]);
    const encoded = encodeBytesToBase64(bytes);
    expect(encoded).toBe("QQ==");
    expect(decodeBase64ToBytes(encoded)).toEqual(bytes);
  });

  it("round-trips two bytes (needs = padding)", () => {
    const bytes = new Uint8Array([65, 66]);
    const encoded = encodeBytesToBase64(bytes);
    expect(encoded).toBe("QUI=");
    expect(decodeBase64ToBytes(encoded)).toEqual(bytes);
  });

  it("round-trips three bytes (no padding)", () => {
    const bytes = new Uint8Array([65, 66, 67]);
    const encoded = encodeBytesToBase64(bytes);
    expect(encoded).toBe("QUJD");
    expect(decodeBase64ToBytes(encoded)).toEqual(bytes);
  });

  it("round-trips known ASCII text against a canonical base64 string", () => {
    const text = "Hello, terminal!";
    const bytes = new TextEncoder().encode(text);
    const encoded = encodeBytesToBase64(bytes);
    // Cross-checked against Node's own btoa/Buffer implementation.
    expect(encoded).toBe(Buffer.from(bytes).toString("base64"));
    expect(decodeBase64ToBytes(encoded)).toEqual(bytes);
  });

  it("round-trips every byte value 0-255 in one buffer", () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) {
      bytes[i] = i;
    }
    const encoded = encodeBytesToBase64(bytes);
    expect(encoded).toBe(Buffer.from(bytes).toString("base64"));
    expect(decodeBase64ToBytes(encoded)).toEqual(bytes);
  });

  it("round-trips multi-byte UTF-8 (emoji, accented characters) as raw bytes", () => {
    const text = "café ☃ 😀 terminal";
    const bytes = new TextEncoder().encode(text);
    const encoded = encodeBytesToBase64(bytes);
    const decoded = decodeBase64ToBytes(encoded);
    expect(decoded).toEqual(bytes);
    expect(new TextDecoder().decode(decoded)).toBe(text);
  });

  it("round-trips ANSI escape / control bytes typical of terminal output", () => {
    // ESC [ 3 1 m (red fg) ... ESC [ 0 m (reset), plus a raw 0x00 and 0xff.
    const bytes = new Uint8Array([
      0x1b, 0x5b, 0x33, 0x31, 0x6d, 0x68, 0x69, 0x1b, 0x5b, 0x30, 0x6d, 0x00, 0xff,
    ]);
    const encoded = encodeBytesToBase64(bytes);
    expect(encoded).toBe(Buffer.from(bytes).toString("base64"));
    expect(decodeBase64ToBytes(encoded)).toEqual(bytes);
  });

  it("round-trips a longer pseudo-random binary buffer at every length mod 3", () => {
    for (const length of [1, 2, 3, 4, 5, 6, 7, 100, 101, 102, 4096]) {
      const bytes = new Uint8Array(length);
      for (let i = 0; i < length; i += 1) {
        // Deterministic pseudo-random fill covering the full byte range.
        bytes[i] = (i * 37 + 11) % 256;
      }
      const encoded = encodeBytesToBase64(bytes);
      expect(encoded).toBe(Buffer.from(bytes).toString("base64"));
      expect(decodeBase64ToBytes(encoded)).toEqual(bytes);
    }
  });

  it("decodeBase64ToBytes ignores embedded whitespace/newlines (some producers wrap base64)", () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const encoded = encodeBytesToBase64(bytes);
    const wrapped = `${encoded.slice(0, 4)}\n${encoded.slice(4)}`;
    expect(decodeBase64ToBytes(wrapped)).toEqual(bytes);
  });
});
