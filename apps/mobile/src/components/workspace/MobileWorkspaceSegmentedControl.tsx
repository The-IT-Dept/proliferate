import { Pressable, StyleSheet, Text, View } from "react-native";
import { GlassSurface } from "@proliferate/design/glass";

import { MobileIcon } from "../primitives/MobileIcon";
import {
  WORKSPACE_SEGMENTS,
  type WorkspaceSegmentId,
} from "../../lib/domain/workspace/mobile-workspace-segment";
import { colors } from "../../styles/tokens";

interface MobileWorkspaceSegmentedControlProps {
  segment: WorkspaceSegmentId;
  onSelect: (segment: WorkspaceSegmentId) => void;
  /** Per-segment attention badges (IA §2.3), e.g. Chat = pending interactions. */
  badges?: Partial<Record<WorkspaceSegmentId, number>>;
}

/**
 * The workspace shell's glass segmented control (design-system.md §3.2,
 * `role="segmented"`; mockups C-F). One `GlassSurface` capsule holds the four
 * segments; the selected one is a solid `ink` lozenge (never glass-on-glass —
 * §1 hard rule 2), matching the mockup's `.seg.active{background:var(--ink)}`.
 *
 * Chosen over the native `UISegmentedControl`
 * (`@react-native-segmented-control`) deliberately: the native control can't
 * host SF-symbol icons + attention badges per segment, can't render the
 * ink-lozenge-on-glass look, and can't sit inside a `GlassSurface` as glass
 * chrome. This is control-layer chrome, so glass is correct; the segment
 * bodies it switches stay opaque.
 */
export function MobileWorkspaceSegmentedControl({
  segment,
  onSelect,
  badges,
}: MobileWorkspaceSegmentedControlProps) {
  return (
    <GlassSurface variant="segmented" style={styles.surface}>
      {WORKSPACE_SEGMENTS.map((entry) => {
        const selected = entry.id === segment;
        const badge = badges?.[entry.id] ?? 0;
        return (
          <Pressable
            key={entry.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={
              badge > 0 ? `${entry.label}, ${badge} needing attention` : entry.label
            }
            onPress={() => onSelect(entry.id)}
            style={[styles.segment, selected && styles.segmentActive]}
          >
            <MobileIcon
              name={entry.icon}
              size={14}
              color={selected ? colors.background : colors.mutedForeground}
            />
            <Text style={[styles.label, selected ? styles.labelActive : styles.labelIdle]}>
              {entry.label}
            </Text>
            {badge > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  surface: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    padding: 4,
  },
  segment: {
    flex: 1,
    height: 36,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  segmentActive: {
    backgroundColor: colors.foreground,
  },
  label: {
    fontSize: 12.5,
    fontWeight: "600",
  },
  labelIdle: {
    color: colors.mutedForeground,
  },
  labelActive: {
    color: colors.background,
  },
  badge: {
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: colors.warning,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 9.5,
    fontWeight: "700",
    color: colors.background,
  },
});

// Fixed chrome height so the shell can inset each segment body below the
// floating capsule + segmented control without measuring (keeps the
// established inset discipline — no manual per-screen footprint padding).
export const SEGMENTED_CONTROL_HEIGHT = 44;
