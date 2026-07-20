import { describe, expect, it } from "vitest";
import {
  detectComposerTrigger,
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

describe("detectComposerTrigger", () => {
  it("detects a slash trigger", () => {
    expect(detectComposerTrigger("/rev", 4)).toEqual({
      kind: "slash",
      start: 0,
      end: 4,
      query: "rev",
    });
  });

  it("returns null when there is no slash trigger", () => {
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
    const text = "/rev today";
    const trigger = findSlashCommandTrigger(text, 4)!; // caret right after "/rev"
    const result = replaceComposerTrigger(text, trigger, "/review");
    expect(result).toEqual({
      text: "/review today",
      caret: 8,
    });
  });

  it("does not swallow a non-whitespace character right after the token end", () => {
    // `findSlashCommandTrigger` always extends its `end` to a whitespace
    // boundary or end-of-text (`findTokenEnd`), so this branch isn't
    // reachable through it in practice — hand-construct a trigger to keep
    // `replaceComposerTrigger`'s own contract covered directly: it only ever
    // consumes one *existing* whitespace char, never non-whitespace content.
    const text = "/ab cd";
    const trigger = { kind: "slash" as const, start: 0, end: 2, query: "a" };
    const result = replaceComposerTrigger(text, trigger, "/review");
    expect(result).toEqual({ text: "/review b cd", caret: 8 });
  });
});
