import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "./mobile-diff-parser";

describe("parseUnifiedDiff", () => {
  it("returns no hunks for a null/undefined/empty patch", () => {
    expect(parseUnifiedDiff(null)).toEqual({ hunks: [] });
    expect(parseUnifiedDiff(undefined)).toEqual({ hunks: [] });
    expect(parseUnifiedDiff("")).toEqual({ hunks: [] });
  });

  it("parses a single hunk into add/del/context lines with tracked line numbers", () => {
    const parsed = parseUnifiedDiff(
      [
        "diff --git a/a.ts b/a.ts",
        "index 1111111..2222222 100644",
        "--- a/a.ts",
        "+++ b/a.ts",
        "@@ -41,4 +41,5 @@ handleRefundEvent",
        " context before",
        "-removed line",
        "+added line",
        " context after",
      ].join("\n"),
    );

    expect(parsed.hunks).toHaveLength(1);
    const hunk = parsed.hunks[0]!;
    expect(hunk.header).toBe("@@ -41,4 +41,5 @@ handleRefundEvent");
    expect(hunk.sectionHeading).toBe("handleRefundEvent");
    expect(hunk.oldStart).toBe(41);
    expect(hunk.oldLines).toBe(4);
    expect(hunk.newStart).toBe(41);
    expect(hunk.newLines).toBe(5);

    expect(hunk.lines).toEqual([
      { kind: "context", content: "context before", oldLineNo: 41, newLineNo: 41 },
      { kind: "del", content: "removed line", oldLineNo: 42, newLineNo: null },
      { kind: "add", content: "added line", oldLineNo: null, newLineNo: 42 },
      { kind: "context", content: "context after", oldLineNo: 43, newLineNo: 43 },
    ]);
  });

  it("resets old/new counters for each subsequent hunk", () => {
    const parsed = parseUnifiedDiff(
      [
        "@@ -1,2 +5,2 @@",
        " first",
        "-old",
        "+new",
        "@@ -20,2 +30,2 @@",
        " again",
        "-old again",
        "+new again",
      ].join("\n"),
    );

    expect(parsed.hunks).toHaveLength(2);
    expect(parsed.hunks[1]!.lines).toEqual([
      { kind: "context", content: "again", oldLineNo: 20, newLineNo: 30 },
      { kind: "del", content: "old again", oldLineNo: 21, newLineNo: null },
      { kind: "add", content: "new again", oldLineNo: null, newLineNo: 31 },
    ]);
  });

  it("defaults the hunk range count to 1 when the header omits it", () => {
    const parsed = parseUnifiedDiff(["@@ -3 +3 @@", "-old", "+new"].join("\n"));

    expect(parsed.hunks[0]!.oldLines).toBe(1);
    expect(parsed.hunks[0]!.newLines).toBe(1);
  });

  it("has no section heading when the hunk header carries none", () => {
    const parsed = parseUnifiedDiff(["@@ -1,2 +1,2 @@", " a", " b"].join("\n"));
    expect(parsed.hunks[0]!.sectionHeading).toBe("");
  });

  it("ignores diff/index/---/+++ metadata lines", () => {
    const parsed = parseUnifiedDiff(
      [
        "diff --git a/a.ts b/a.ts",
        "index 1111111..2222222 100644",
        "--- a/a.ts",
        "+++ b/a.ts",
        "@@ -3,1 +3,1 @@",
        "-old",
        "+new",
      ].join("\n"),
    );

    expect(parsed.hunks).toHaveLength(1);
    expect(parsed.hunks[0]!.lines).toHaveLength(2);
  });

  it("uses one-based line numbers when the patch has no hunk header at all", () => {
    const parsed = parseUnifiedDiff(["-old first", "+new first", " unchanged"].join("\n"));

    expect(parsed.hunks).toHaveLength(1);
    expect(parsed.hunks[0]!.lines).toEqual([
      { kind: "del", content: "old first", oldLineNo: 1, newLineNo: null },
      { kind: "add", content: "new first", oldLineNo: null, newLineNo: 1 },
      { kind: "context", content: "unchanged", oldLineNo: 2, newLineNo: 2 },
    ]);
  });

  it("parses consecutive added lines with monotonically increasing new line numbers", () => {
    const parsed = parseUnifiedDiff(
      [
        "@@ -1,1 +1,4 @@",
        " kept",
        "+one",
        "+two",
        "+three",
      ].join("\n"),
    );

    const added = parsed.hunks[0]!.lines.filter((line) => line.kind === "add");
    expect(added.map((line) => line.newLineNo)).toEqual([2, 3, 4]);
  });

  // M2 — CRLF-robust hunk header.
  it("parses ranges and the section heading from a CRLF-terminated hunk header", () => {
    const parsed = parseUnifiedDiff(
      ["@@ -41,4 +41,5 @@ handleRefundEvent\r", " context before", "-removed", "+added"].join("\n"),
    );

    expect(parsed.hunks).toHaveLength(1);
    const hunk = parsed.hunks[0]!;
    expect(hunk.sectionHeading).toBe("handleRefundEvent");
    expect(hunk.oldStart).toBe(41);
    expect(hunk.oldLines).toBe(4);
    expect(hunk.newStart).toBe(41);
    expect(hunk.newLines).toBe(5);
    expect(hunk.lines).toEqual([
      { kind: "context", content: "context before", oldLineNo: 41, newLineNo: 41 },
      { kind: "del", content: "removed", oldLineNo: 42, newLineNo: null },
      { kind: "add", content: "added", oldLineNo: null, newLineNo: 42 },
    ]);
  });

  it("parses ranges from a CRLF-terminated hunk header with no section heading", () => {
    const parsed = parseUnifiedDiff(["@@ -1,2 +1,2 @@\r", " a", " b"].join("\n"));

    expect(parsed.hunks).toHaveLength(1);
    expect(parsed.hunks[0]!.sectionHeading).toBe("");
    expect(parsed.hunks[0]!.oldStart).toBe(1);
    expect(parsed.hunks[0]!.newStart).toBe(1);
  });
});
