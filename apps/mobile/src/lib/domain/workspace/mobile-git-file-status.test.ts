import { describe, expect, it } from "vitest";
import { gitFileStatusAccessibilityLabel, gitFileStatusPresentation } from "./mobile-git-file-status";

describe("gitFileStatusPresentation", () => {
  it("labels every GitFileStatus value Title-cased", () => {
    expect(gitFileStatusPresentation("added").label).toBe("Added");
    expect(gitFileStatusPresentation("modified").label).toBe("Modified");
    expect(gitFileStatusPresentation("deleted").label).toBe("Deleted");
    expect(gitFileStatusPresentation("renamed").label).toBe("Renamed");
    expect(gitFileStatusPresentation("copied").label).toBe("Copied");
    expect(gitFileStatusPresentation("untracked").label).toBe("Untracked");
    expect(gitFileStatusPresentation("conflicted").label).toBe("Conflicted");
  });

  it("gives added and untracked files a positive tone", () => {
    expect(gitFileStatusPresentation("added").tone).toBe("positive");
    expect(gitFileStatusPresentation("untracked").tone).toBe("positive");
  });

  it("gives modified files a caution tone", () => {
    expect(gitFileStatusPresentation("modified").tone).toBe("caution");
  });

  it("gives deleted and conflicted files a danger tone", () => {
    expect(gitFileStatusPresentation("deleted").tone).toBe("danger");
    expect(gitFileStatusPresentation("conflicted").tone).toBe("danger");
  });

  it("gives renamed and copied files a neutral tone", () => {
    expect(gitFileStatusPresentation("renamed").tone).toBe("neutral");
    expect(gitFileStatusPresentation("copied").tone).toBe("neutral");
  });

  it("assigns a distinct icon per status", () => {
    const statuses = [
      "added",
      "modified",
      "deleted",
      "renamed",
      "copied",
      "untracked",
      "conflicted",
    ] as const;
    for (const status of statuses) {
      expect(gitFileStatusPresentation(status).icon).toBeTruthy();
    }
  });
});

// M1 — the a11y label FileRow reads for its accessibilityLabel.
describe("gitFileStatusAccessibilityLabel", () => {
  it("joins the display path and the Title-cased status label", () => {
    expect(gitFileStatusAccessibilityLabel("src/x.ts", "modified")).toBe("src/x.ts, Modified");
    expect(gitFileStatusAccessibilityLabel("new-file.ts", "added")).toBe("new-file.ts, Added");
  });

  it("uses the rename display path verbatim", () => {
    expect(gitFileStatusAccessibilityLabel("old.ts -> new.ts", "renamed"))
      .toBe("old.ts -> new.ts, Renamed");
  });
});
