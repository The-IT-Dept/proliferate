import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import type { MobileCloudWorkspaceStatusView } from "../../../lib/domain/workspace/mobile-cloud-workspace-status";
import { MobileIcon } from "../../primitives/MobileIcon";
import { colors, radius, spacing } from "../../../styles/tokens";

/**
 * Row 11 ("cloud status screen") + Row 42 ("cloud start-block reasons") —
 * both driven by `buildMobileCloudWorkspaceStatusView`. Rendered above the
 * transcript in `MobileChatScreen` (Chat is the shell's default segment, so
 * this is what the user sees immediately after creating/opening a cloud
 * workspace that isn't ready yet), styled after the existing
 * `MobileChatClaimBanner`/`MobileRepoReadinessBlocker` blocked-state pattern
 * rather than replacing the whole shell — history and the other segments
 * (Sessions/Term/Diff) stay reachable, and a workspace that goes from ready
 * to blocked mid-conversation doesn't hide the transcript that's already
 * there.
 */
export function MobileCloudWorkspaceStatusBanner({
  view,
  retryPending,
  onRetry,
}: {
  view: MobileCloudWorkspaceStatusView;
  retryPending: boolean;
  onRetry: () => void;
}) {
  const tone = toneForMode(view.mode);
  return (
    <View style={[styles.wrap, toneWrapStyle(tone)]}>
      <View style={styles.row}>
        <View style={[styles.iconTile, toneIconTileStyle()]}>
          {view.mode === "pending" ? (
            <ActivityIndicator color={toneIconColor(tone)} />
          ) : (
            <MobileIcon name={iconForMode(view.mode)} size={16} color={toneIconColor(tone)} />
          )}
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.title}>{view.title}</Text>
          <Text style={styles.description}>{view.description}</Text>
          {view.footerMessage && view.footerMessage !== view.description ? (
            <Text style={styles.footer}>{view.footerMessage}</Text>
          ) : null}
        </View>
      </View>
      {view.retry ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={view.retry.label}
          accessibilityState={{ disabled: retryPending }}
          disabled={retryPending}
          onPress={onRetry}
          style={({ pressed }) => [
            styles.cta,
            retryPending && styles.ctaDisabled,
            pressed && styles.pressed,
          ]}
        >
          {retryPending ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.ctaText}>{view.retry.label}</Text>
          )}
        </Pressable>
      ) : null}
      {view.retry?.helperText ? (
        <Text style={styles.helperText}>{view.retry.helperText}</Text>
      ) : null}
    </View>
  );
}

type BannerTone = "info" | "destructive" | "warning" | "muted";

function toneForMode(mode: MobileCloudWorkspaceStatusView["mode"]): BannerTone {
  switch (mode) {
    case "pending":
      return "info";
    case "error":
      return "destructive";
    case "blocked":
      return "warning";
    case "archived":
      return "muted";
  }
}

function iconForMode(mode: MobileCloudWorkspaceStatusView["mode"]): "cloud" | "archive" | "shield" {
  switch (mode) {
    case "archived":
      return "archive";
    case "blocked":
      return "shield";
    default:
      return "cloud";
  }
}

function toneWrapStyle(tone: BannerTone) {
  switch (tone) {
    case "info":
      return { backgroundColor: colors.infoSubtle };
    case "destructive":
      return { backgroundColor: colors.destructiveSubtle };
    case "warning":
      return { backgroundColor: colors.warningSubtle };
    case "muted":
      return { backgroundColor: colors.card };
  }
}

function toneIconTileStyle() {
  return { backgroundColor: colors.card, borderColor: colors.border };
}

function toneIconColor(tone: BannerTone): string {
  switch (tone) {
    case "info":
      return colors.info;
    case "destructive":
      return colors.destructive;
    case "warning":
      return colors.warning;
    case "muted":
      return colors.faint;
  }
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[3],
  },
  iconTile: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    color: colors.fg,
    fontSize: 14.5,
    fontWeight: "600",
  },
  description: {
    color: colors.mutedForeground,
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    color: colors.faint,
    fontSize: 12,
    lineHeight: 16,
  },
  cta: {
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: colors.fg,
    paddingHorizontal: spacing[4],
  },
  ctaDisabled: {
    opacity: 0.62,
  },
  ctaText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: "600",
  },
  helperText: {
    color: colors.faint,
    fontSize: 12,
    lineHeight: 16,
  },
  pressed: {
    opacity: 0.8,
  },
});
