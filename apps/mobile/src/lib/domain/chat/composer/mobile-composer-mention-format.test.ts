import { describe, expect, it } from "vitest";
import {
  formatMarkdownFileLink,
  isValidWorkspaceRelativePath,
  normalizeWorkspaceRelativePath,
  workspaceFileBasename,
} from "./mobile-composer-mention-format";

// Ported verbatim from product-client's still-live `file-mention-links.ts` —
// the exact serialization the (now-composer-inert, round-trip-only)
// `ChatComposerDraftNode` file_mention type produces, and the exact format
// the deleted @mention composer feature inserted into the draft
// (`formatMarkdownFileLink(result.name, result.path)` in the deleted
// `ComposerMentionEditor.handleSelectSearchResult`). This is the mention
// token format mobile mirrors: a markdown link `[label](path)`, not a bare
// `@path` string.
describe("normalizeWorkspaceRelativePath", () => {
  it("accepts a plain relative path", () => {
    expect(normalizeWorkspaceRelativePath("src/App.tsx")).toBe("src/App.tsx");
  });

  it("strips a leading ./", () => {
    expect(normalizeWorkspaceRelativePath("./src/App.tsx")).toBe("src/App.tsx");
  });

  it("rejects absolute paths, home paths, and URLs", () => {
    expect(normalizeWorkspaceRelativePath("/etc/passwd")).toBeNull();
    expect(normalizeWorkspaceRelativePath("~/secrets")).toBeNull();
    expect(normalizeWorkspaceRelativePath("~")).toBeNull();
    expect(normalizeWorkspaceRelativePath("https://example.com/a")).toBeNull();
  });

  it("rejects traversal segments and empty/dot paths", () => {
    expect(normalizeWorkspaceRelativePath("../secret")).toBeNull();
    expect(normalizeWorkspaceRelativePath(".")).toBeNull();
    expect(normalizeWorkspaceRelativePath("")).toBeNull();
    expect(normalizeWorkspaceRelativePath("nested/../secret")).toBeNull();
  });

  it("rejects backslashes and hash characters", () => {
    expect(normalizeWorkspaceRelativePath("desktop\\App.tsx")).toBeNull();
    expect(normalizeWorkspaceRelativePath("#fragment")).toBeNull();
  });

  it("allows a literal space within a path segment", () => {
    expect(normalizeWorkspaceRelativePath("desktop/my-file-copy.ts"))
      .toBe("desktop/my-file-copy.ts");
    expect(normalizeWorkspaceRelativePath("desktop/my" + " " + "file.ts"))
      .toBe("desktop/my" + " " + "file.ts");
  });
});

describe("isValidWorkspaceRelativePath", () => {
  it("mirrors normalizeWorkspaceRelativePath's accept/reject calls", () => {
    expect(isValidWorkspaceRelativePath("src/App.tsx")).toBe(true);
    expect(isValidWorkspaceRelativePath("/etc/passwd")).toBe(false);
  });
});

describe("workspaceFileBasename", () => {
  it("returns the last path segment", () => {
    expect(workspaceFileBasename("desktop/src/App.tsx")).toBe("App.tsx");
  });

  it("falls back to the whole string when there is no separator", () => {
    expect(workspaceFileBasename("App.tsx")).toBe("App.tsx");
  });
});

describe("formatMarkdownFileLink", () => {
  it("formats a plain label and path", () => {
    expect(formatMarkdownFileLink("App.tsx", "desktop/src/App.tsx"))
      .toBe("[App.tsx](desktop/src/App.tsx)");
  });

  it("falls back to the basename when the label is empty", () => {
    expect(formatMarkdownFileLink("", "desktop/src/App.tsx"))
      .toBe("[App.tsx](desktop/src/App.tsx)");
  });

  it("wraps a path containing a space in angle brackets", () => {
    const spacedPath = "src/my" + " " + "file.ts";
    expect(formatMarkdownFileLink("label", spacedPath))
      .toBe("[label](<" + spacedPath + ">)");
  });

  it("escapes brackets in the label", () => {
    expect(formatMarkdownFileLink("[weird].ts", "src/weird.ts"))
      .toBe("[\\[weird\\].ts](src/weird.ts)");
  });

  it("falls back to escaped plain text when the path is invalid", () => {
    expect(formatMarkdownFileLink("evil", "/etc/passwd")).toBe("evil");
  });
});
