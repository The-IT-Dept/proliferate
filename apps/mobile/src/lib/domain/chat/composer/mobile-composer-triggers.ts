/**
 * Row 23 (`docs/design/mobile/information-architecture.md`) — pure
 * trigger/token/query parsing for the chat composer's slash-command picker,
 * over a flat draft string + caret offset. Mobile's composer has no rich
 * draft-node model (`mobile-chat-composer-state.ts`, `MobileChatComposer.tsx`
 * — `draft` is a plain string, `onChangeDraft` a
 * `Dispatch<SetStateAction<string>>`), so trigger detection and insertion
 * both operate on plain text, unlike web's node-based `ChatComposerDraft`.
 *
 * Ported verbatim from web's still-live `findSlashCommandTrigger`
 * (`product-client/src/lib/domain/chat/composer/slash-command-draft-edits.ts`)
 * — a `/` only triggers when everything before its token is whitespace (native
 * ACP commands are prompt-leading only; `please /review` does not trigger).
 *
 * Row 23 originally also ported a @mention file-search trigger alongside
 * this one, mirroring a (by-then-already-deleted) web feature. That mention
 * half was removed to match web's CURRENT composer, which is slash-only —
 * see `product-client`'s commit 2e0dcf52c, "feat(desktop): replace composer
 * mentions with slash commands". Only the slash trigger remains here; the
 * `replaceComposerTrigger` insertion helper below stays as-is since slash
 * selection still uses it.
 */

export interface ComposerSlashTrigger {
  readonly kind: "slash";
  readonly start: number;
  readonly end: number;
  readonly query: string;
}

export type ComposerTrigger = ComposerSlashTrigger;

export function findSlashCommandTrigger(text: string, caret: number): ComposerSlashTrigger | null {
  if (caret < 0 || caret > text.length) {
    return null;
  }

  const tokenStart = findTokenStart(text, caret);
  if (text[tokenStart] !== "/") {
    return null;
  }

  // Native slash commands are only sent at prompt start; inline slash text
  // is ordinary prompt content — matches web's rule exactly.
  const prefix = text.slice(0, tokenStart);
  if (!/^\s*$/u.test(prefix)) {
    return null;
  }

  const tokenEnd = findTokenEnd(text, caret);
  return {
    kind: "slash",
    start: tokenStart,
    end: tokenEnd,
    query: text.slice(tokenStart + 1, caret),
  };
}

/**
 * Resolves the single active composer trigger at the caret. Currently just
 * the slash trigger — kept as its own named entry point (rather than having
 * callers reach for `findSlashCommandTrigger` directly) so the composer's
 * caret-tracking call site doesn't need to change shape if another trigger
 * kind is ever added back.
 */
export function detectComposerTrigger(text: string, caret: number): ComposerTrigger | null {
  return findSlashCommandTrigger(text, caret);
}

function findTokenStart(text: string, caret: number): number {
  let offset = caret;
  while (offset > 0 && !/\s/u.test(text[offset - 1] ?? "")) {
    offset -= 1;
  }
  return offset;
}

function findTokenEnd(text: string, caret: number): number {
  let offset = caret;
  while (offset < text.length && !/\s/u.test(text[offset] ?? "")) {
    offset += 1;
  }
  return offset;
}

export interface TriggerReplacement {
  readonly text: string;
  readonly caret: number;
}

/**
 * Replaces the active trigger token with `replacement` plus a trailing
 * space, and reports where the caret lands. Mirrors web's insertion site
 * exactly — `ComposerCommandEditor.handleSelectSearchResult` for slash
 * commands: swallow one already-present trailing whitespace character
 * instead of doubling it up, otherwise insert cleanly.
 */
export function replaceComposerTrigger(
  text: string,
  trigger: ComposerTrigger,
  replacement: string,
): TriggerReplacement {
  const insertion = `${replacement} `;
  const replaceEnd = /\s/u.test(text[trigger.end] ?? "") ? trigger.end + 1 : trigger.end;
  const nextText = `${text.slice(0, trigger.start)}${insertion}${text.slice(replaceEnd)}`;
  return { text: nextText, caret: trigger.start + insertion.length };
}
