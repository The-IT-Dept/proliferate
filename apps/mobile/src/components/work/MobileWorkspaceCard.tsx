import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  mobileColorKeyForWorkStatusTone,
  mobileIconForRuntimeLocation,
  mobileIconForWorkSourceKind,
  type MobileWorkStatusColorKey,
} from "../../lib/domain/work/mobile-work-presentation";
import { mobileWorkItemNeedsAttention } from "../../lib/domain/work/mobile-work-attention";
import { mobileWorkspaceStatusPill } from "../../lib/domain/work/mobile-work-status-pill";
import type { MobileWorkItem } from "../../hooks/work/derived/use-mobile-work-inventory";
import { MobileIcon } from "../primitives/MobileIcon";
import { colors, radius, spacing } from "../../styles/tokens";

interface MobileWorkspaceCardProps {
  item: MobileWorkItem;
  compact?: boolean;
  claiming?: boolean;
  /**
   * PR 7 access-loss state: when Cloud repository access is lost, the existing
   * record stays visible but is marked locked and explained; commanding it is
   * disabled. No local materialization / clone action is offered on mobile.
   */
  accessLossReason?: string | null;
  onPress: () => void;
  /** Opens the workspace-management sheet (rename/archive/restore/delete) —
   * IA §2.2: "long-press -> context menu". */
  onLongPress?: () => void;
  onClaim?: () => void;
}

const STATUS_PILL_COLORS: Record<MobileWorkStatusColorKey, { bg: string; fg: string }> = {
  warning: { bg: colors.warningSubtle, fg: colors.warning },
  info: { bg: colors.infoSubtle, fg: colors.info },
  success: { bg: colors.successSubtle, fg: colors.success },
  destructive: { bg: colors.destructiveSubtle, fg: colors.destructive },
  borderHeavy: { bg: colors.borderHeavy, fg: colors.mutedForeground },
};

export function MobileWorkspaceCard({
  item,
  compact = false,
  claiming = false,
  accessLossReason = null,
  onPress,
  onLongPress,
  onClaim,
}: MobileWorkspaceCardProps) {
  const detailText = workspaceDetailText(item);
  const statusColor = colors[mobileColorKeyForWorkStatusTone(item.view.statusIndicator.tone)];
  const statusPill = mobileWorkspaceStatusPill(item.view.statusIndicator);
  const pillColors = STATUS_PILL_COLORS[statusPill.colorKey];
  const needsAttention = mobileWorkItemNeedsAttention(item.view);
  const unclaimed = item.view.unclaimed;
  const locked = Boolean(accessLossReason);
  const canClaim = Boolean(onClaim) && unclaimed && !locked;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.view.title}, ${item.view.statusIndicator.label}`}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.card,
        compact && styles.cardCompact,
        needsAttention && styles.cardAttention,
        pressed && styles.cardPressed,
      ]}
    >
      {needsAttention ? <View style={styles.attentionBar} /> : null}
      <View style={styles.cardTop}>
        <View style={[styles.iconTile, compact && styles.iconTileCompact]}>
          <MobileIcon
            name={mobileIconForWorkSourceKind(item.view.sourceKind)}
            size={compact ? 18 : 21}
            color={item.view.sourceKind === "slack" ? colors.success : colors.fg}
          />
          <View
            style={[
              styles.stateDot,
              item.view.statusIndicator.hollow
                ? [styles.stateDotHollow, { borderColor: statusColor }]
                : { backgroundColor: statusColor },
            ]}
          />
        </View>
        <View style={styles.cardTitleBlock}>
          <View style={styles.cardTitleRow}>
            <Text style={[styles.cardTitle, compact && styles.cardTitleCompact]} numberOfLines={1}>
              {item.view.title}
            </Text>
            <Text style={styles.cardTime}>{item.view.lastActivityLabel}</Text>
          </View>
          <View style={styles.cardMetaRow}>
            <MobileIcon
              name={mobileIconForRuntimeLocation(item.view.runtimeLocation)}
              size={13}
              color={colors.faint}
            />
            <Text style={styles.cardMeta} numberOfLines={1}>
              {item.view.repoLabel} · {item.view.branchLabel}
            </Text>
          </View>
        </View>
      </View>
      {!compact ? (
        <View style={styles.pillRow}>
          <View style={[styles.pill, { backgroundColor: pillColors.bg }]}>
            <Text style={[styles.pillText, { color: pillColors.fg }]}>{statusPill.label}</Text>
          </View>
        </View>
      ) : null}
      {detailText && !compact ? (
        <View style={styles.promptBlock}>
          <Text style={styles.promptText} numberOfLines={2}>
            {detailText}
          </Text>
        </View>
      ) : null}
      {locked ? (
        <View style={styles.lockedBlock}>
          <MobileIcon name="lock" size={13} color={colors.warning} />
          <Text style={styles.lockedText} numberOfLines={compact ? 1 : 3}>
            {accessLossReason}
          </Text>
        </View>
      ) : null}
      {canClaim ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Claim workspace"
          accessibilityState={{ disabled: claiming }}
          disabled={claiming}
          onPress={onClaim}
          style={({ pressed }) => [
            styles.claimButton,
            claiming && styles.claimButtonDisabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.claimButtonText}>{claiming ? "Claiming" : "Claim workspace"}</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

// The status pill above already surfaces item.view.statusIndicator.label, so
// this only adds a *second* line when there's something further to say:
// what's actually happening (activityPreview), or why the workspace can't
// be commanded right now.
function workspaceDetailText(item: MobileWorkItem): string | null {
  if (item.view.activityPreview) {
    return item.view.activityPreview;
  }
  if (item.view.commandability !== "commandable") {
    return item.view.commandabilityLabel;
  }
  return null;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[3],
    gap: spacing[3],
    overflow: "hidden",
  },
  cardCompact: {
    borderRadius: 20,
    paddingVertical: spacing[2],
  },
  // Attention cards (mockup B): a warning accent bar down the left edge,
  // matching the workspace list's "needs your attention" treatment.
  cardAttention: {
    paddingLeft: spacing[3] + 3.5,
  },
  attentionBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3.5,
    backgroundColor: colors.warning,
  },
  cardPressed: {
    opacity: 0.82,
    backgroundColor: colors.accent,
  },
  pillRow: {
    flexDirection: "row",
  },
  pill: {
    borderRadius: radius.full,
    paddingHorizontal: spacing[2],
    paddingVertical: 4,
  },
  pillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
  },
  iconTile: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
    backgroundColor: colors.background,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  iconTileCompact: {
    width: 36,
    height: 36,
  },
  stateDot: {
    position: "absolute",
    right: 4,
    bottom: 4,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.borderHeavy,
  },
  stateDotHollow: {
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: "transparent",
  },
  cardTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  cardTitle: {
    flex: 1,
    minWidth: 0,
    color: colors.fg,
    fontSize: 16,
    fontWeight: "600",
  },
  cardTitleCompact: {
    fontSize: 15,
  },
  cardTime: {
    color: colors.faint,
    fontSize: 12,
    fontWeight: "500",
  },
  cardMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardMeta: {
    flex: 1,
    minWidth: 0,
    color: colors.faint,
    fontSize: 13.5,
    lineHeight: 18,
  },
  promptBlock: {
    borderRadius: 18,
    backgroundColor: colors.background,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  lockedBlock: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[2],
    borderRadius: 14,
    backgroundColor: colors.warningSubtle,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  lockedText: {
    flex: 1,
    minWidth: 0,
    color: colors.warning,
    fontSize: 12,
    lineHeight: 16,
  },
  promptText: {
    color: colors.mutedForeground,
    fontSize: 13,
    lineHeight: 18,
  },
  claimButton: {
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
    backgroundColor: colors.fg,
    paddingHorizontal: spacing[4],
  },
  claimButtonDisabled: {
    opacity: 0.62,
  },
  claimButtonText: {
    color: colors.background,
    fontSize: 13,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.7,
  },
});
