import { describe, expect, it } from "vitest";
import type { GitChangedFile, GitDiffFile } from "@anyharness/sdk";
import {
  buildMobileChangesList,
  MOBILE_DIFF_MODE_OPTIONS,
  mobileDiffModeEmptyMessage,
  summarizeMobileChanges,
} from "./mobile-diff-changes";

function changedFile(overrides: Partial<GitChangedFile>): GitChangedFile {
  return {
    additions: 0,
    binary: false,
    deletions: 0,
    includedState: "included",
    oldPath: null,
    path: "a.ts",
    status: "modified",
    ...overrides,
  };
}

function diffFile(overrides: Partial<GitDiffFile>): GitDiffFile {
  return {
    additions: 0,
    binary: false,
    deletions: 0,
    oldPath: null,
    path: "a.ts",
    status: "modified",
    ...overrides,
  };
}

describe("buildMobileChangesList", () => {
  it("normalizes GitChangedFile rows into the mobile model", () => {
    const [file] = buildMobileChangesList([
      changedFile({ path: "src/a.ts", additions: 3, deletions: 1, status: "modified" }),
    ]);

    expect(file).toMatchObject({
      path: "src/a.ts",
      oldPath: null,
      displayPath: "src/a.ts",
      status: "modified",
      additions: 3,
      deletions: 1,
      binary: false,
    });
  });

  it("formats a renamed file's displayPath as 'old -> new'", () => {
    const [file] = buildMobileChangesList([
      diffFile({ path: "new.ts", oldPath: "old.ts", status: "renamed" }),
    ]);

    expect(file!.displayPath).toBe("old.ts -> new.ts");
  });

  it("sorts files alphabetically by path", () => {
    const files = buildMobileChangesList([
      changedFile({ path: "z.ts" }),
      changedFile({ path: "a.ts" }),
      changedFile({ path: "m.ts" }),
    ]);

    expect(files.map((file) => file.path)).toEqual(["a.ts", "m.ts", "z.ts"]);
  });

  it("filters out .claude/worktrees/ housekeeping paths", () => {
    const files = buildMobileChangesList([
      changedFile({ path: "src/a.ts" }),
      changedFile({ path: ".claude/worktrees/scratch.txt" }),
    ]);

    expect(files.map((file) => file.path)).toEqual(["src/a.ts"]);
  });

  it("gives each file a stable, unique key even for same-path different-status rows", () => {
    const files = buildMobileChangesList([
      changedFile({ path: "a.ts", status: "modified" }),
      diffFile({ path: "a.ts", oldPath: "b.ts", status: "renamed" }),
    ]);

    expect(new Set(files.map((file) => file.key)).size).toBe(2);
  });
});

describe("summarizeMobileChanges", () => {
  it("totals file count and additions/deletions", () => {
    const files = buildMobileChangesList([
      changedFile({ path: "a.ts", additions: 5, deletions: 2 }),
      changedFile({ path: "b.ts", additions: 1, deletions: 0 }),
    ]);

    expect(summarizeMobileChanges(files)).toEqual({ files: 2, additions: 6, deletions: 2 });
  });

  it("returns zeros for an empty list", () => {
    expect(summarizeMobileChanges([])).toEqual({ files: 0, additions: 0, deletions: 0 });
  });
});

describe("MOBILE_DIFF_MODE_OPTIONS", () => {
  it("offers Working tree and Branch, verbatim from the web GitPanelMode labels", () => {
    expect(MOBILE_DIFF_MODE_OPTIONS).toEqual([
      { id: "working_tree", label: "Working tree" },
      { id: "branch", label: "Branch" },
    ]);
  });
});

describe("mobileDiffModeEmptyMessage", () => {
  it("matches the web GitPanel empty messages verbatim", () => {
    expect(mobileDiffModeEmptyMessage("working_tree")).toBe("Working tree clean");
    expect(mobileDiffModeEmptyMessage("branch")).toBe("No branch changes");
  });
});
