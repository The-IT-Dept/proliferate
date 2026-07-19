/**
 * Group G — the unified-diff -> hunk/line model parser behind the Diff
 * segment's native renderer (mockup H: "unified diff on the terminal field
 * with gutter glyphs (never color alone)"). Mirrors the shape of the web
 * client's `parsePatch` (`product-client/src/lib/domain/files/diff-parser.ts`)
 * — same line classification (added/removed/context/hunk/meta), same
 * old/new line-number tracking reset per hunk — but trimmed to what mobile's
 * read-only renderer needs: no context-run collapsing and no inter-hunk gap
 * computation (those exist on web to support expand-to-load-more-context and
 * a virtualized full-file view; mobile's diff pane is a single scrollable
 * card showing exactly what the API patch contains, mockup H has no
 * "expand context" affordance).
 */

export type DiffLineKind = "add" | "del" | "context";

export interface DiffLine {
  kind: DiffLineKind;
  /** Content with the leading +/-/space prefix stripped. */
  content: string;
  /** 1-based old-file line number; null for added lines. */
  oldLineNo: number | null;
  /** 1-based new-file line number; null for removed lines. */
  newLineNo: number | null;
}

export interface DiffHunk {
  /** Raw hunk header line, verbatim ("@@ -41,9 +41,17 @@ handleRefundEvent"). */
  header: string;
  /** Text after the closing "@@" (the section heading git attaches when it
   * can detect one, e.g. the enclosing function name) — "" when absent. */
  sectionHeading: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface ParsedDiff {
  hunks: DiffHunk[];
}

// No trailing `$` anchor — mirrors web's `HUNK_RANGE_RE`
// (`product-client/src/lib/domain/files/diff-parser.ts`). A `$`-anchored
// `.*$` fails to match a CRLF-terminated header line (e.g. `@@ ... @@ fn\r`):
// `.` never consumes `\r`, so the trailing `\r` leaves the string short of
// `$` and the whole match fails, dropping range/section tracking for that
// hunk. Without the anchor, group 5 still stops at the `\r` (same result for
// LF-only headers) but the match itself succeeds either way.
const HUNK_HEADER_RE = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@\s*(.*)/;

type RawLineClass = "hunk" | "added" | "removed" | "context" | "meta";

function classifyRawLine(line: string): RawLineClass {
  if (line.startsWith("@@")) {
    return "hunk";
  }
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return "added";
  }
  if (line.startsWith("-") && !line.startsWith("---")) {
    return "removed";
  }
  if (
    line.startsWith("diff ")
    || line.startsWith("index ")
    || line.startsWith("---")
    || line.startsWith("+++")
  ) {
    return "meta";
  }
  return "context";
}

function stripMarkerPrefix(line: string): string {
  if (line.length > 0 && (line[0] === "+" || line[0] === "-" || line[0] === " ")) {
    return line.slice(1);
  }
  return line;
}

/**
 * Parses a unified-diff patch string (as returned by `client.git.getDiff`'s
 * `GitDiffResponse.patch`) into a hunk/line model ready for native
 * rendering. Null/empty patches yield no hunks (the caller shows a "no
 * textual diff" state for those, same intent as web's
 * `formatEmptyDiffState`).
 */
export function parseUnifiedDiff(patch: string | null | undefined): ParsedDiff {
  if (!patch) {
    return { hunks: [] };
  }

  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  // 1-based counters, matching web: a patch with no hunk header at all still
  // gets one-based line numbers for its (implicit) single hunk.
  let oldNum = 1;
  let newNum = 1;

  function ensureHunk(): DiffHunk {
    if (!currentHunk) {
      currentHunk = {
        header: "",
        sectionHeading: "",
        oldStart: oldNum,
        oldLines: 0,
        newStart: newNum,
        newLines: 0,
        lines: [],
      };
      hunks.push(currentHunk);
    }
    return currentHunk;
  }

  for (const raw of patch.split("\n")) {
    const cls = classifyRawLine(raw);

    if (cls === "meta") {
      continue;
    }

    if (cls === "hunk") {
      const match = HUNK_HEADER_RE.exec(raw);
      if (match) {
        oldNum = Number.parseInt(match[1]!, 10);
        newNum = Number.parseInt(match[3]!, 10);
        currentHunk = {
          header: raw,
          sectionHeading: match[5]?.trim() ?? "",
          oldStart: oldNum,
          oldLines: match[2] !== undefined ? Number.parseInt(match[2]!, 10) : 1,
          newStart: newNum,
          newLines: match[4] !== undefined ? Number.parseInt(match[4]!, 10) : 1,
          lines: [],
        };
      } else {
        // Malformed/unrecognized header text — still start a fresh hunk so
        // its lines don't bleed counters from whatever preceded it.
        currentHunk = {
          header: raw,
          sectionHeading: "",
          oldStart: oldNum,
          oldLines: 0,
          newStart: newNum,
          newLines: 0,
          lines: [],
        };
      }
      hunks.push(currentHunk);
      continue;
    }

    const hunk = ensureHunk();
    const content = stripMarkerPrefix(raw);

    if (cls === "added") {
      hunk.lines.push({ kind: "add", content, oldLineNo: null, newLineNo: newNum });
      newNum += 1;
    } else if (cls === "removed") {
      hunk.lines.push({ kind: "del", content, oldLineNo: oldNum, newLineNo: null });
      oldNum += 1;
    } else {
      hunk.lines.push({ kind: "context", content, oldLineNo: oldNum, newLineNo: newNum });
      oldNum += 1;
      newNum += 1;
    }
  }

  return { hunks };
}
