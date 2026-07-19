import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { GlassSurface } from "@proliferate/design/glass";

import { MobileIcon } from "../../primitives/MobileIcon";
import { colors, radius, spacing } from "../../../styles/tokens";

interface MobilePublishDockProps {
  label: string;
  disabled: boolean;
  submitting: boolean;
  bottomInset: number;
  onPress: () => void;
}

/**
 * Row 29 — the Diff surface's publish entry point (scope: "a Commit /
 * Publish action (button/dock) that opens a publish sheet"; the audit noted
 * Group G's own doc comment on `MobileWorkspaceDiffSegment` deferring this).
 * Floating glass pill, same positioning family as the terminal segment's
 * dock (`MobileWorkspaceTerminalSegment`'s `interruptRow`/
 * `MobileTerminalAccessoryBar`) — `position: "absolute"`, clear glass chrome
 * over opaque scrolling content below. Label/disabled state are entirely
 * derived from `mobile-publish-view.ts`'s `MobilePublishView` by the caller
 * (`primaryLabel`/`disabledReason`) — this component owns no publish logic
 * of its own, only the tap target and spinner-while-submitting affordance.
 */
export function MobilePublishDock({
  label,
  disabled,
  submitting,
  bottomInset,
  onPress,
}: MobilePublishDockProps) {
  const inactive = disabled || submitting;
  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: bottomInset }]}>
      <GlassSurface variant="fab" style={styles.surface}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={{ disabled: inactive, busy: submitting }}
          disabled={inactive}
          onPress={onPress}
          style={({ pressed }) => [
            styles.button,
            inactive && styles.buttonInactive,
            pressed && !inactive && styles.buttonPressed,
          ]}
        >
          {submitting ? (
            <ActivityIndicator size="small" color={colors.fg} />
          ) : (
            <MobileIcon name="send" size={14} color={colors.fg} />
          )}
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
        </Pressable>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: spacing[4],
    right: spacing[4],
    alignItems: "center",
  },
  surface: {
    borderRadius: radius.full,
  },
  button: {
    height: 46,
    minWidth: 200,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    paddingHorizontal: spacing[5],
  },
  buttonInactive: {
    opacity: 0.45,
  },
  buttonPressed: {
    opacity: 0.75,
  },
  label: {
    color: colors.fg,
    fontSize: 14.5,
    fontWeight: "600",
  },
});
