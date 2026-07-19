/**
 * Group F spike — base64 codec for the `MobileTerminalView` postMessage
 * bridge (see that component's module doc). Deliberately dependency-free: no
 * `atob`/`btoa` (not guaranteed in every RN/Hermes version this app might
 * ship against, even though recent Hermes does provide them natively) and no
 * `Buffer` (doesn't exist in React Native at all). Plain arithmetic over a
 * fixed alphabet, safe in both the RN thread and this file's node-env vitest
 * run.
 */

const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Reverse lookup: char code -> 6-bit value, or -1 for anything outside the
 * alphabet (used to skip whitespace/newlines some base64 producers wrap
 * output with). */
const DECODE_TABLE: Int16Array = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < BASE64_ALPHABET.length; i += 1) {
    table[BASE64_ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

export function encodeBytesToBase64(bytes: Uint8Array): string {
  let result = "";
  const length = bytes.length;
  for (let i = 0; i < length; i += 3) {
    const b0 = bytes[i]!;
    const hasB1 = i + 1 < length;
    const hasB2 = i + 2 < length;
    const b1 = hasB1 ? bytes[i + 1]! : 0;
    const b2 = hasB2 ? bytes[i + 2]! : 0;

    result += BASE64_ALPHABET[b0 >> 2];
    result += BASE64_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    result += hasB1 ? BASE64_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)] : "=";
    result += hasB2 ? BASE64_ALPHABET[b2 & 0x3f] : "=";
  }
  return result;
}

export function decodeBase64ToBytes(base64: string): Uint8Array {
  // Collect only valid alphabet characters (drops padding, whitespace,
  // newlines) so callers can hand us base64 wrapped at a fixed column width.
  const values: number[] = [];
  for (let i = 0; i < base64.length; i += 1) {
    const code = base64.charCodeAt(i);
    const value = code < 128 ? DECODE_TABLE[code]! : -1;
    if (value >= 0) {
      values.push(value);
    }
  }

  const byteLength = Math.floor((values.length * 3) / 4);
  const bytes = new Uint8Array(byteLength);
  let byteIndex = 0;
  for (let i = 0; i < values.length; i += 4) {
    const v0 = values[i]!;
    const v1 = values[i + 1] ?? 0;
    const v2 = values[i + 2];
    const v3 = values[i + 3];

    if (byteIndex < byteLength) {
      bytes[byteIndex] = (v0 << 2) | (v1 >> 4);
      byteIndex += 1;
    }
    if (v2 !== undefined && byteIndex < byteLength) {
      bytes[byteIndex] = ((v1 & 0x0f) << 4) | (v2 >> 2);
      byteIndex += 1;
    }
    if (v3 !== undefined && byteIndex < byteLength) {
      bytes[byteIndex] = ((v2! & 0x03) << 6) | v3;
      byteIndex += 1;
    }
  }
  return bytes;
}
