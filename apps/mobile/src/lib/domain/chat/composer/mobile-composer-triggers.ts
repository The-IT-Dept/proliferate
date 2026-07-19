/**
 * Row 23 (`docs/design/mobile/information-architecture.md`) — pure
 * trigger/token/query parsing for the chat composer's slash-command and
 * @mention pickers, over a flat draft string + caret offset. Mobile's
 * composer has no rich draft-node model (`mobile-chat-composer-state.ts`,
 * `MobileChatComposer.tsx` — `draft` is a plain string, `onChangeDraft` a
 * `Dispatch<SetStateAction<string>>`), so trigger detection and insertion
 * both operate on plain text, unlike web's node-based `ChatComposerDraft`.
 *
 * Slash-command trigger: ported verbatim from web's still-live
 * `findSlashCommandTrigger`
 * (`product-client/src/lib/domain/chat/composer/slash-command-draft-edits.ts`)
 * — a `/` only triggers when everything before its token is whitespace (native
 * ACP commands are prompt-leading only; `please /review` does not trigger).
 *
 * @mention trigger — IMPORTANT PROVENANCE NOTE: web's own composer no longer
 * has this feature. `product-client` replaced live @mention search with
 * slash commands entirely (commit 2e0dcf52c,
 * "feat(desktop): replace composer mentions with slash commands", May 2026):
 * `ComposerFileMentionSearch.tsx`, `ComposerMentionEditor.tsx`, and
 * `use-chat-file-mention-search.ts` were deleted outright, and the desktop
 * editor file was literally renamed `ComposerMentionEditor.tsx` →
 * `ComposerCommandEditor.tsx` (one replaced the other, never combined).
 * `file-mention-draft-model.ts` still says plainly: "The live composer no
 * longer mints file mention nodes." So there is no current web reference
 * implementation to mirror for @mention — this ports the ALGORITHM from that
 * *deleted* feature's `findMentionTrigger`
 * (`desktop/src/lib/domain/chat/composer/file-mention-draft-edits.ts` as of
 * commit 2e0dcf52c~1, its last version before removal) since the mobile
 * parity map (Row 23) still calls for "Slash commands + @mentions" as one
 * composer row, and the composer placeholder copy ("@mention files, run
 * /commands", `chat-copy.ts` / `mobile-chat-composer-state.ts`) promises it.
 * Adapted from draft-node positions to flat string offsets: there is no
 * "mention unit" concept to special-case here, since an inserted mention
 * becomes literal markdown-link text in the string on this platform (matching
 * how it *also* became literal text on serialize even in the old node-based
 * model — see `mobile-composer-mention-format.ts`).
 */

export interface ComposerSlashTrigger {
  readonly kind: "slash";
  readonly start: number;
  readonly end: number;
  readonly query: string;
}

export interface ComposerMentionTrigger {
  readonly kind: "mention";
  readonly start: number;
  readonly end: number;
  readonly query: string;
}

export type ComposerTrigger = ComposerSlashTrigger | ComposerMentionTrigger;

// Ported from web's `OPENING_TRIGGER_BOUNDARIES` (file-mention-draft-model.ts
// at 2e0dcf52c~1) — an "@" right after one of these punctuation marks is
// still a valid mention start (e.g. "(@file"), same as after whitespace or
// the very start of the draft.
const MENTION_OPENING_BOUNDARIES = new Set(["(", "[", "{", "<"]);

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

export function findAtMentionTrigger(text: string, caret: number): ComposerMentionTrigger | null {
  if (caret < 1 || caret > text.length) {
    return null;
  }

  // Walk backward from the caret. Whitespace or (in the old node-based
  // model) a mention boundary stops the scan outright — you're not inside a
  // token at all. A non-boundary "@" (e.g. the "@" inside "foo@bar") is
  // skipped, not treated as fatal, so a leading "@" earlier in the same
  // run can still be found (mirrors the "@fo@bar" test case from web's
  // deleted suite).
  for (let index = caret - 1; index >= 0; index -= 1) {
    const char = text[index]!;
    if (/\s/u.test(char)) {
      return null;
    }
    if (char !== "@") {
      continue;
    }

    const before = index > 0 ? text[index - 1]! : null;
    if (!isMentionTriggerBoundary(before)) {
      continue;
    }

    return {
      kind: "mention",
      start: index,
      end: caret,
      query: text.slice(index + 1, caret),
    };
  }

  return null;
}

function isMentionTriggerBoundary(char: string | null): boolean {
  if (char === null) {
    return true;
  }
  return /\s/u.test(char) || MENTION_OPENING_BOUNDARIES.has(char);
}

/**
 * Resolves the single active composer trigger at the caret. Slash is checked
 * first — matches web's history, where these were mutually-exclusive
 * composer *modes* rather than ever being combined in one editor (see the
 * module doc's rename-not-merge note). In practice the two can't actually
 * overlap at one caret: a slash trigger only matches with an all-whitespace
 * prefix, and "/" is never a valid mention boundary character, so this
 * ordering is a documented default rather than a load-bearing tiebreak.
 */
export function detectComposerTrigger(text: string, caret: number): ComposerTrigger | null {
  return findSlashCommandTrigger(text, caret) ?? findAtMentionTrigger(text, caret);
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
 * space, and reports where the caret lands. Mirrors both web insertion sites
 * exactly — today's `ComposerCommandEditor.handleSelectSearchResult` for
 * slash commands, and the deleted `ComposerMentionEditor`'s equivalent for
 * mentions: swallow one already-present trailing whitespace character
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
