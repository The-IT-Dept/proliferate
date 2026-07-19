import { Platform, StyleSheet, Text, View } from "react-native";

import type { DiffLine, DiffLineKind, ParsedDiff } from "../../../lib/domain/workspace/mobile-diff-parser";
import { colors, radius, spacing } from "../../../styles/tokens";

interface MobileDiffViewerProps {
  fileName: string;
  parsedDiff: ParsedDiff;
}

// Verbatim hex from mockup H's diff/terminal field (`docs/design/mobile/
// mockups.html` root CSS vars: `--term`, and the diff-line text/background
// colors baked directly into that frame's markup). The terminal/diff field
// is "always-dark" regardless of the app theme (same rule the interactive
// terminal follows), so these are fixed constants rather than routed
// through the light/dark-aware `colors` tokens.
const TERM_BG = "#0C0C0D";
const HUNK_HEADER_FG = colors.info; // --tint, matches mockup's blue hunk-header text
const HUNK_HEADER_BG = "rgba(51,156,255,0.07)";
const CONTEXT_FG = "#9A9AA0";
const META_FG = "#8E8E93";
const ADD_FG = "#7ADFA3";
const ADD_BG = "rgba(64,201,119,0.10)";
const DEL_FG = "#FF8A87";
const DEL_BG = "rgba(250,66,62,0.10)";

const LINE_FG: Record<DiffLineKind, string> = {
  add: ADD_FG,
  del: DEL_FG,
  context: CONTEXT_FG,
};
const LINE_BG: Record<DiffLineKind, string | null> = {
  add: ADD_BG,
  del: DEL_BG,
  context: null,
};
const LINE_MARKER: Record<DiffLineKind, string> = {
  add: "+",
  del: "-",
  context: " ",
};

/**
 * Group G — the native unified-diff renderer (mockup H diff viewer card).
 * Deliberately NOT a WebView: this is plain `View`/`Text` over the parsed
 * `ParsedDiff` model (`mobile-diff-parser.ts`), same reasoning as the
 * interactive terminal choosing xterm-in-WebView for PTY fidelity but this
 * surface needing none of that — it's read-only, non-interactive text with
 * per-line background tint, which native `Text` does directly and cheaply.
 *
 * Each line row is a full-width `View` (default `alignItems: "stretch"`
 * column layout) so its background tint always reaches the card's edges
 * regardless of content length, with the line `Text` wrapping normally
 * rather than truncating — a code-editor-style horizontal scroll-per-line
 * was considered but dropped: RN sizes a horizontally-scrolling content view
 * to its intrinsic (shrink-to-fit) width, which fights a same-width-for-
 * every-row background tint without a measured-width bridge; wrapping is
 * the robust choice here over a layout trick that's hard to verify without
 * a running device.
 *
 * No numeric line-number gutter — mockup H's own diff card shows none; the
 * marker glyph (+/-/space) IS the "gutter glyph (never color alone)" the
 * caption calls for, so color is never the only signal for add/remove.
 */
export function MobileDiffViewer({ fileName, parsedDiff }: MobileDiffViewerProps) {
  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <Text style={styles.headerFile} numberOfLines={1}>
          {fileName}
        </Text>
        <Text style={styles.headerMode}>unified</Text>
      </View>

      {parsedDiff.hunks.length === 0 ? (
        <Text style={styles.emptyText}>No textual changes to show.</Text>
      ) : (
        parsedDiff.hunks.map((hunk, hunkIndex) => (
          <View key={hunkIndex}>
            <Text style={styles.hunkHeader} numberOfLines={1}>
              {hunk.header}
            </Text>
            {hunk.lines.map((line, lineIndex) => (
              <DiffLineRow key={lineIndex} line={line} />
            ))}
          </View>
        ))
      )}
    </View>
  );
}

function DiffLineRow({ line }: { line: DiffLine }) {
  const bg = LINE_BG[line.kind];
  const fg = LINE_FG[line.kind];
  const marker = LINE_MARKER[line.kind];
  const text = `${marker} ${line.content.length > 0 ? line.content : " "}`;
  return (
    <View style={[styles.lineRow, bg ? { backgroundColor: bg } : null]}>
      <Text style={[styles.lineText, { color: fg }]}>{text}</Text>
    </View>
  );
}

const MONO_FONT = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

const styles = StyleSheet.create({
  root: {
    marginTop: spacing[3],
    backgroundColor: TERM_BG,
    borderRadius: radius.xl,
    overflow: "hidden",
    paddingBottom: spacing[2],
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing[3] + 2,
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
  },
  headerFile: {
    flex: 1,
    minWidth: 0,
    color: META_FG,
    fontFamily: MONO_FONT,
    fontSize: 11.5,
  },
  headerMode: {
    color: META_FG,
    fontFamily: MONO_FONT,
    fontSize: 11.5,
    marginLeft: spacing[2],
  },
  emptyText: {
    color: META_FG,
    fontFamily: MONO_FONT,
    fontSize: 12,
    paddingHorizontal: spacing[3] + 2,
    paddingBottom: spacing[2],
  },
  hunkHeader: {
    color: HUNK_HEADER_FG,
    backgroundColor: HUNK_HEADER_BG,
    fontFamily: MONO_FONT,
    fontSize: 11.5,
    lineHeight: 18,
    paddingHorizontal: spacing[3] + 2,
    paddingVertical: 1,
  },
  lineRow: {
    paddingVertical: 0.5,
  },
  lineText: {
    fontFamily: MONO_FONT,
    fontSize: 11.5,
    lineHeight: 18,
    paddingHorizontal: spacing[3] + 2,
  },
});
