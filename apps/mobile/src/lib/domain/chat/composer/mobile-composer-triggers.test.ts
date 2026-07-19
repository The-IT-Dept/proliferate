import { describe, expect, it } from "vitest";
import {
  detectComposerTrigger,
  findAtMentionTrigger,
  findSlashCommandTrigger,
  replaceComposerTrigger,
} from "./mobile-composer-triggers";

describe("findSlashCommandTrigger", () => {
  // Ported verbatim from product-client's still-live
  // `slash-command-draft-edits.test.ts` — same token/prefix rules, adapted
  // to this module's `kind` discriminant.
  it("detects a leading slash command query", () => {
    expect(findSlashCommandTrigger("/rev", 4)).toEqual({
      kind: "slash",
      start: 0,
      end: 4,
      query: "rev",
    });
  });

  it("allows leading whitespace before the command", () => {
    expect(findSlashCommandTrigger("\n  /compact", 11)).toEqual({
      kind: "slash",
      start: 3,
      end: 11,
      query: "compact",
    });
  });

  it("replaces the whole token when the caret is inside it", () => {
    expect(findSlashCommandTrigger("/review later", 4)).toEqual({
      kind: "slash",
      start: 0,
      end: 7,
      query: "rev",
    });
  });

  it("ignores inline slashes because native commands are prompt-leading", () => {
    expect(findSlashCommandTrigger("please /review", 14)).toBeNull();
  });

  it("ignores non-command paths and urls", () => {
    expect(findSlashCommandTrigger("src/app.ts", 5)).toBeNull();
    expect(findSlashCommandTrigger("https://example.com", 8)).toBeNull();
  });

  it("rejects an out-of-range caret", () => {
    expect(findSlashCommandTrigger("/rev", -1)).toBeNull();
    expect(findSlashCommandTrigger("/rev", 10)).toBeNull();
  });
});

describe("findAtMentionTrigger", () => {
  // Ported from web's deleted `findMentionTrigger`
  // (`file-mention-draft-edits.ts` at commit 2e0dcf52c~1, before
  // "feat(desktop): replace composer mentions with slash commands" deleted
  // the live @mention composer feature) — same boundary-scanning algorithm,
  // adapted from draft-node positions to flat string offsets. Test cases
  // mirror that deleted `file-mention-draft.test.ts` suite's assertions.
  it("detects @ triggers at allowed boundaries", () => {
    expect(findAtMentionTrigger("see @Cha", 8)).toEqual({
      kind: "mention",
      start: 4,
      end: 8,
      query: "Cha",
    });
  });

  it("triggers right after a newline", () => {
    const text = "one\n@two";
    expect(findAtMentionTrigger(text, text.length)?.query).toBe("two");
  });

  it("triggers right after opening punctuation", () => {
    const text = "(@file";
    expect(findAtMentionTrigger(text, text.length)?.query).toBe("file");
  });

  it("triggers at the very start of the draft", () => {
    expect(findAtMentionTrigger("@App", 4)).toEqual({
      kind: "mention",
      start: 0,
      end: 4,
      query: "App",
    });
  });

  it("does not trigger inside a word (email-like text)", () => {
    expect(findAtMentionTrigger("foo@bar", 7)).toBeNull();
  });

  it("treats @fo@bar as one query — skips a non-boundary @ and keeps scanning", () => {
    expect(findAtMentionTrigger("@fo@bar", 7)?.query).toBe("fo@bar");
  });

  it("stops at whitespace between the caret and any @", () => {
    expect(findAtMentionTrigger("@foo bar", 8)).toBeNull();
  });

  it("query is empty right after typing the trigger character", () => {
    expect(findAtMentionTrigger("hi @", 4)).toEqual({
      kind: "mention",
      start: 3,
      end: 4,
      query: "",
    });
  });

  it("rejects an out-of-range or zero caret", () => {
    expect(findAtMentionTrigger("@foo", 0)).toBeNull();
    expect(findAtMentionTrigger("@foo", -1)).toBeNull();
    expect(findAtMentionTrigger("@foo", 10)).toBeNull();
  });
});

describe("detectComposerTrigger", () => {
  it("prefers a slash trigger over a mention trigger when both could apply", () => {
    // Not actually reachable in practice (a leading "/" is never a valid
    // mention boundary character), but the precedence is documented and
    // tested directly against the resolver rather than left implicit.
    expect(detectComposerTrigger("/rev", 4)).toEqual({
      kind: "slash",
      start: 0,
      end: 4,
      query: "rev",
    });
  });

  it("falls through to a mention trigger when there is no slash trigger", () => {
    expect(detectComposerTrigger("see @App", 8)).toEqual({
      kind: "mention",
      start: 4,
      end: 8,
      query: "App",
    });
  });

  it("returns null when neither trigger matches", () => {
    expect(detectComposerTrigger("just a plain message", 21)).toBeNull();
  });
});

describe("replaceComposerTrigger", () => {
  it("replaces a slash-command token with a trailing space and places the caret after it", () => {
    const trigger = findSlashCommandTrigger("/rev", 4)!;
    const result = replaceComposerTrigger("/rev", trigger, "/review");
    expect(result).toEqual({ text: "/review ", caret: 8 });
  });

  it("swallows one existing trailing space instead of doubling it up", () => {
    const text = "open @App today";
    const trigger = findAtMentionTrigger(text, 9)!; // caret right after "@App"
    const result = replaceComposerTrigger(text, trigger, "[App.tsx](desktop/src/App.tsx)");
    expect(result).toEqual({
      text: "open [App.tsx](desktop/src/App.tsx) today",
      caret: 36,
    });
  });

  it("does not swallow a non-whitespace character right after the caret (mention edited mid-token)", () => {
    // Mention triggers end exactly at the caret (never extended forward like
    // a slash token's contiguous non-whitespace run), so a caret sitting
    // mid-word leaves the untyped remainder of that word untouched.
    const text = "@ab cd";
    const trigger = findAtMentionTrigger(text, 2)!; // caret between "@a" and "b"
    const result = replaceComposerTrigger(text, trigger, "[a.ts](src/a.ts)");
    expect(result).toEqual({ text: "[a.ts](src/a.ts) b cd", caret: 17 });
  });

  it("inserts a trailing space at end of text when there is nothing after the token", () => {
    const trigger = findAtMentionTrigger("hi @fi", 6)!;
    const result = replaceComposerTrigger("hi @fi", trigger, "[file.ts](src/file.ts)");
    expect(result).toEqual({ text: "hi [file.ts](src/file.ts) ", caret: 26 });
  });
});
