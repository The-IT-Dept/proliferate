/**
 * F-build — the terminal keyboard accessory bar's key -> control-byte
 * mapping (IA `Term (G)`: "glass key-accessory row (esc ⇥ ⌃ ⌥ / – arrows)"),
 * plain-string bytes ready for `TerminalStreamController.sendInput` (which
 * `TextEncoder`-encodes a string same as any other keystroke — no separate
 * binary path needed for these).
 *
 * The accessory row has no on-screen letter keys, so Ctrl/Alt are *sticky
 * modifiers*: tapping one arms `TerminalAccessoryModifier` state (owned by
 * the caller, `MobileWorkspaceTerminalSegment`) that transforms the next
 * character typed on the system keyboard via
 * `applyTerminalAccessoryModifier`, then disarms — the same Ctrl-then-letter
 * UX mobile terminal apps (Termius, Blink, a-Shell) use since there's no
 * physical Ctrl key on an on-screen keyboard.
 */

export type TerminalAccessoryKeyId =
  | "esc"
  | "tab"
  | "ctrl"
  | "alt"
  | "slash"
  | "dash"
  | "up"
  | "down"
  | "left"
  | "right";

export interface TerminalAccessoryKeyDef {
  id: TerminalAccessoryKeyId;
  /** Glyph shown on the key, verbatim from the mockup's accessory row. */
  label: string;
  /** Sticky modifier keys (ctrl/alt) arm state instead of sending bytes on
   * tap — see `applyTerminalAccessoryModifier`. */
  sticky: boolean;
}

/** Left-to-right order matches the mockup's accessory row exactly:
 * esc ⇥ ⌃ ⌥ / — ↑ ↓ ← → */
export const TERMINAL_ACCESSORY_KEYS: readonly TerminalAccessoryKeyDef[] = [
  { id: "esc", label: "esc", sticky: false },
  { id: "tab", label: "⇥", sticky: false },
  { id: "ctrl", label: "⌃", sticky: true },
  { id: "alt", label: "⌥", sticky: true },
  { id: "slash", label: "/", sticky: false },
  { id: "dash", label: "—", sticky: false },
  { id: "up", label: "↑", sticky: false },
  { id: "down", label: "↓", sticky: false },
  { id: "left", label: "←", sticky: false },
  { id: "right", label: "→", sticky: false },
];

const IMMEDIATE_BYTES: Partial<Record<TerminalAccessoryKeyId, string>> = {
  esc: "\x1b",
  tab: "\t",
  slash: "/",
  dash: "-",
  up: "\x1b[A",
  down: "\x1b[B",
  right: "\x1b[C",
  left: "\x1b[D",
};

/** Bytes to send immediately for a non-sticky key; `null` for the sticky
 * modifiers (`ctrl`/`alt`), which never send bytes on tap. */
export function bytesForAccessoryKey(id: TerminalAccessoryKeyId): string | null {
  return IMMEDIATE_BYTES[id] ?? null;
}

export type TerminalAccessoryModifier = "ctrl" | "alt";

const CTRL_PUNCTUATION: Record<string, number> = {
  "@": 0x00,
  "[": 0x1b,
  "\\": 0x1c,
  "]": 0x1d,
  "^": 0x1e,
  "_": 0x1f,
};

/** Standard terminal Ctrl-key encoding: Ctrl-A..Ctrl-Z map to 0x01-0x1a
 * (`upperCaseCharCode - 0x40`), a handful of punctuation controls map to
 * their historical bytes (Ctrl-[ is literally ESC), and Ctrl-? is DEL.
 * Returns `null` for anything without a control mapping (caller falls back
 * to sending the character unmodified) or for input that isn't exactly one
 * character. */
export function controlByteForChar(char: string): string | null {
  if (char.length !== 1) {
    return null;
  }
  if (char === "?") {
    return String.fromCharCode(0x7f);
  }
  if (char in CTRL_PUNCTUATION) {
    return String.fromCharCode(CTRL_PUNCTUATION[char]!);
  }
  const upperCode = char.toUpperCase().charCodeAt(0);
  if (upperCode >= 0x41 && upperCode <= 0x5a) {
    return String.fromCharCode(upperCode - 0x40);
  }
  return null;
}

/** Standard "Meta sends Escape" Alt-key encoding (xterm/tmux default):
 * prefix ESC before the character. */
export function metaEncodeChar(char: string): string {
  return `\x1b${char}`;
}

/** Applies an armed sticky modifier to one chunk of `onInput` text. Only
 * transforms single-character input — a multi-character chunk (e.g. a
 * paste, or an IME commit) passes through unmodified since "Ctrl-paste"
 * isn't a meaningful action; the caller is responsible for disarming the
 * modifier after this call regardless of whether it actually transformed
 * anything. */
export function applyTerminalAccessoryModifier(
  modifier: TerminalAccessoryModifier | null,
  input: string,
): string {
  if (!modifier || input.length !== 1) {
    return input;
  }
  if (modifier === "ctrl") {
    return controlByteForChar(input) ?? input;
  }
  return metaEncodeChar(input);
}
