import { StyleSheet, Text, View } from "react-native";

import { MobileIcon, type MobileIconName } from "../primitives/MobileIcon";
import { colors, radius, spacing } from "../../styles/tokens";

interface MobileWorkspaceSegmentPlaceholderProps {
  icon: MobileIconName;
  title: string;
  body: string;
  topInset: number;
}

/**
 * Honest "coming" empty state for the shell's Term (Group F) and Diff (Group G)
 * segments — clearly not-yet-built, not a dead pane. Opaque body (glass is only
 * the control layer). Replaced wholesale when those groups land.
 */
export function MobileWorkspaceSegmentPlaceholder({
  icon,
  title,
  body,
  topInset,
}: MobileWorkspaceSegmentPlaceholderProps) {
  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <View style={styles.card}>
        <View style={styles.iconTile}>
          <MobileIcon name={icon} size={22} color={colors.faint} />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>Coming soon</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[6],
  },
  card: {
    alignItems: "center",
    gap: spacing[3],
    maxWidth: 320,
  },
  iconTile: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceControl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: colors.fg,
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
  },
  body: {
    color: colors.faint,
    fontSize: 13.5,
    lineHeight: 19,
    textAlign: "center",
  },
  badge: {
    marginTop: spacing[1],
    paddingHorizontal: spacing[3],
    paddingVertical: 5,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  badgeText: {
    color: colors.mutedForeground,
    fontSize: 11.5,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
});
