import { describe, expect, it } from "vitest";
import type { GitChangedFile } from "@anyharness/sdk";
import {
  groupPublishFiles,
  partialFileWarning,
} from "./mobile-publish-file-groups";

// Ported verbatim from web's `publish-file-groups.test.ts`
// (`product-client/src/lib/domain/workspaces/creation/publish-file-groups.test.ts`)
// as a parity guide — same fixtures, same assertions.
function file(path: string, includedState: GitChangedFile["includedState"]): GitChangedFile {
  return {
    path,
    oldPath: undefined,
    status: "modified",
    additions: 1,
    deletions: 1,
    binary: false,
    includedState,
  };
}

describe("groupPublishFiles", () => {
  it("groups publishable files and excludes generated worktree metadata", () => {
    const groups = groupPublishFiles([
      file("src/app.ts", "included"),
      file("src/pending.ts", "partial"),
      file("src/draft.ts", "excluded"),
      file(".claude/worktrees/generated.json", "included"),
      file("", "included"),
    ]);

    expect(groups.staged.map((entry) => entry.path)).toEqual(["src/app.ts"]);
    expect(groups.partial.map((entry) => entry.path)).toEqual(["src/pending.ts"]);
    expect(groups.unstaged.map((entry) => entry.path)).toEqual(["src/draft.ts"]);
  });
});

describe("partialFileWarning", () => {
  it("keeps partial-file warnings tied to unstaged inclusion", () => {
    expect(partialFileWarning(false, true)).toBeNull();
    expect(partialFileWarning(true, true)).toContain("unstaged hunks");
    expect(partialFileWarning(true, false)).toContain("only staged hunks");
  });
});
