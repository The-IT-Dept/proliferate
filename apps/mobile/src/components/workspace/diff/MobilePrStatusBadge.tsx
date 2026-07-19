import { Platform, StyleSheet, Text, View } from "react-native";

import {
  prStatusBadgeText,
  prStatusTone,
  type PrStatusKind,
  type PrStatusTone,
} from "../../../lib/domain/workspace/mobile-pr-status";
import { colors, radius, spacing } from "../../../styles/tokens";

interface MobilePrStatusBadgeProps {
  kind: PrStatusKind;
  number: number | null;
}

// GitHub-convention purple for "merged" — verbatim `--color-pr-merged`
// (dark-theme value, `apps/packages/design/src/css/product.css`); mobile is
// always-dark so there's only one value to carry over. Never `colors.info`
// (that's the unread-blue token, explicitly called out as the wrong choice
// in the web PrStatusBadge doc comment).
const PR_MERGED_COLOR = "#ad7bf9";

const TONE_COLOR: Record<PrStatusTone, string> = {
  success: colors.success,
  danger: colors.destructive,
  pendingOutline: colors.warning,
  warningFill: colors.warning,
  muted: colors.faint,
  merged: PR_MERGED_COLOR,
};

/**
 * Group G — the Diff surface's PR status badge (mockup H PR row: dot +
 * "#482 · Checks pending"). Web's `PrStatusDot` renders a bare colored dot
 * with the compound label only in a hover tooltip; mobile has no hover, so
 * this inlines `prStatusBadgeText` next to the dot instead (see that
 * function's doc comment). `pending` renders as a hollow ring (border only,
 * transparent fill) — the one tone the web spec calls out as an outline
 * rather than a fill; every other tone is an opaque dot.
 */
export function MobilePrStatusBadge({ kind, number }: MobilePrStatusBadgeProps) {
  const tone = prStatusTone(kind);
  const color = TONE_COLOR[tone];
  const hollow = tone === "pendingOutline";
  const text = prStatusBadgeText(kind, number);

  return (
    <View style={styles.badge} accessibilityRole="text" accessibilityLabel={text}>
      <View
        style={[
          styles.dot,
          hollow
            ? { borderColor: color, borderWidth: 1.5, backgroundColor: "transparent" }
            : { backgroundColor: color },
        ]}
      />
      <Text style={styles.text} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

const MONO_FONT = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing[2],
    paddingVertical: 5,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceControl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    flexShrink: 0,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  text: {
    color: colors.mutedForeground,
    fontFamily: MONO_FONT,
    fontSize: 11,
  },
});
