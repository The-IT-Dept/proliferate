import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { MobileIcon, type MobileIconName } from "../../../primitives/MobileIcon";
import { colors, radius, spacing } from "../../../../styles/tokens";

/**
 * Group E3 — the shared interaction-card shell (design-system.md §10:
 * "Interaction card shell (mirrors web `ComposerAttachedPanel`)" — leading
 * icon + title + optional context + colored accent bar + footer with
 * secondary actions left, primary right). Opaque body content (`colors.card`),
 * never glass — glass is control-layer only per the design system's global
 * constraint.
 */
export function MobileInteractionCardShell({
  icon,
  accentColor,
  title,
  context,
  children,
}: {
  icon?: MobileIconName;
  accentColor: string;
  title: string;
  context?: string | null;
  /** Body content — including the footer, if any (e.g.
   * `<MobileInteractionCardFooter>` as the last child) — there is no
   * separate footer slot since every caller already composes it in order. */
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.card, { borderLeftColor: accentColor }]}>
      <View style={styles.header}>
        {icon ? <MobileIcon name={icon} size={15} color={accentColor} /> : null}
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        {context ? <Text style={styles.context} numberOfLines={1}>{context}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/** One option row shared by every card's option list — leading numbered
 * badge (decorative on mobile: design-system §10 "on mobile the 1–9
 * hotkeys become plain tap targets", no hardware-keyboard binding),
 * label + optional description, tinted/destructive/selected states. */
export function MobileInteractionOptionRow({
  index,
  label,
  description,
  tone = "neutral",
  selected = false,
  disabled = false,
  onPress,
}: {
  index: number;
  label: string;
  description?: string | null;
  tone?: "neutral" | "positive" | "negative" | "selected";
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const toneStyle = optionToneStyle(selected ? "selected" : tone);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.optionRow,
        toneStyle.row,
        pressed && !disabled && styles.optionRowPressed,
        disabled && styles.optionRowDisabled,
      ]}
    >
      <View style={[styles.optionBadge, toneStyle.badge]}>
        <Text style={[styles.optionBadgeText, toneStyle.badgeText]}>{index + 1}</Text>
      </View>
      <View style={styles.optionTextGroup}>
        <Text style={[styles.optionLabel, toneStyle.label]}>{label}</Text>
        {description ? <Text style={styles.optionDescription}>{description}</Text> : null}
      </View>
    </Pressable>
  );
}

/** Footer chip row — secondary actions left, primary right (matches web's
 * `ComposerCardFooter`). */
export function MobileInteractionCardFooter({
  secondaryActions,
  primaryAction,
  disabled = false,
}: {
  secondaryActions: { label: string; onPress: () => void }[];
  primaryAction?: { label: string; onPress: () => void; busy?: boolean };
  disabled?: boolean;
}) {
  if (secondaryActions.length === 0 && !primaryAction) {
    return null;
  }
  return (
    <View style={styles.footer}>
      <View style={styles.footerSecondaryGroup}>
        {secondaryActions.map((action) => (
          <Pressable
            key={action.label}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={action.onPress}
            style={({ pressed }) => [
              styles.footerChip,
              styles.footerSecondaryChip,
              pressed && !disabled && styles.optionRowPressed,
              disabled && styles.optionRowDisabled,
            ]}
          >
            <Text style={styles.footerSecondaryChipText}>{action.label}</Text>
          </Pressable>
        ))}
      </View>
      {primaryAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={primaryAction.label}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={primaryAction.onPress}
          style={({ pressed }) => [
            styles.footerChip,
            styles.footerPrimaryChip,
            pressed && !disabled && styles.optionRowPressed,
            disabled && styles.optionRowDisabled,
          ]}
        >
          <Text style={styles.footerPrimaryChipText}>
            {primaryAction.busy ? "Sending" : primaryAction.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Per-tone visual values for `MobileInteractionOptionRow` — plain style
 * objects (not run through a second `StyleSheet.create`, which only
 * reliably holds static keys) keyed by tone. */
function optionToneStyle(tone: "neutral" | "positive" | "negative" | "selected"): {
  row: object;
  badge: object;
  badgeText: object;
  label: object;
} {
  switch (tone) {
    case "positive":
      return {
        row: { backgroundColor: colors.successSubtle },
        badge: { backgroundColor: colors.success },
        badgeText: { color: "#08130C" },
        label: { color: colors.success },
      };
    case "negative":
      return {
        row: { backgroundColor: colors.destructiveSubtle },
        badge: { backgroundColor: colors.destructive },
        badgeText: { color: "#ffffff" },
        label: { color: colors.destructive },
      };
    case "selected":
      return {
        row: { backgroundColor: colors.infoSubtle, borderWidth: 1, borderColor: colors.info },
        badge: { backgroundColor: colors.info },
        badgeText: { color: "#ffffff" },
        label: { color: colors.info },
      };
    case "neutral":
    default:
      return {
        row: { backgroundColor: colors.accent },
        badge: { backgroundColor: colors.border },
        badgeText: { color: colors.fg },
        label: { color: colors.fg },
      };
  }
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderLeftWidth: 3.5,
    backgroundColor: colors.card,
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    gap: spacing[2],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  title: {
    flexShrink: 1,
    minWidth: 0,
    color: colors.fg,
    fontSize: 15,
    fontWeight: "700",
  },
  context: {
    marginLeft: "auto",
    color: colors.faint,
    fontSize: 12,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    minHeight: 40,
    borderRadius: radius.xl,
    paddingHorizontal: spacing[3],
  },
  optionRowPressed: {
    opacity: 0.82,
  },
  optionRowDisabled: {
    opacity: 0.5,
  },
  optionBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  optionBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  optionTextGroup: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  optionLabel: {
    fontSize: 14.5,
    fontWeight: "600",
  },
  optionDescription: {
    color: colors.faint,
    fontSize: 12.5,
  },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[2],
    marginTop: spacing[1],
  },
  footerSecondaryGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: spacing[2],
  },
  footerChip: {
    minHeight: 32,
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    alignItems: "center",
    justifyContent: "center",
  },
  footerSecondaryChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  footerSecondaryChipText: {
    color: colors.mutedForeground,
    fontSize: 13,
    fontWeight: "600",
  },
  footerPrimaryChip: {
    backgroundColor: colors.fg,
  },
  footerPrimaryChipText: {
    color: colors.background,
    fontSize: 13,
    fontWeight: "700",
  },
});

export const monoTextStyle = {
  fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
};
