import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassSurface } from "@proliferate/design/glass";

import { tabRoutes, type RouteId } from "../../../navigation/navigation-model";
import { MobileIcon } from "../../primitives/MobileIcon";
import { colors, spacing } from "../../../styles/tokens";

interface MobileTabBarProps {
  activeRoute: RouteId;
  onNavigate: (route: RouteId) => void;
  /** Per-route attention badge (e.g. Workspaces' pending-interaction count,
   * IA §1 "badge = pending-interaction count"). Group C owns computing this;
   * Group A just renders whatever it's given. */
  badgeCounts?: Partial<Record<RouteId, number>>;
}

/** Height of the floating glass bar itself (`styles.bar`). */
export const TAB_BAR_HEIGHT = 64;
/** Gap between the bar and the bottom safe-area inset (`styles.wrap`'s `bottom`). */
export const TAB_BAR_BOTTOM_GAP = 10;

/**
 * The bar's total footprint measured up from the bottom of the screen,
 * including the safe-area inset it floats above. `MobileTabBar` is an
 * absolutely-positioned sibling over the tab content, not a layout
 * participant, so tab bodies must reserve this much bottom content inset
 * themselves — otherwise their last/bottom-most content (and any
 * interactive control near it) sits underneath the glass bar, where taps
 * hit the bar's Pressables instead. This is the single source of truth for
 * that number so the bar and the tab bodies can't drift apart.
 */
export function tabBarFootprint(insetsBottom: number): number {
  return TAB_BAR_HEIGHT + TAB_BAR_BOTTOM_GAP + insetsBottom;
}

/**
 * The floating 4-tab glass shell (IA §1: Home / Workspaces / Automations /
 * Settings, "Liquid Glass, floating"). Replaces the previous drawer as the
 * app's primary top-level navigation; the workspace shell pushes over this
 * full-screen and hides it (see MobileShell's "chat" stage).
 */
export function MobileTabBar({ activeRoute, onNavigate, badgeCounts }: MobileTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + TAB_BAR_BOTTOM_GAP }]}>
      <GlassSurface variant="tab" style={styles.bar}>
        {tabRoutes.map((route) => {
          const active = route.id === activeRoute;
          const badge = badgeCounts?.[route.id] ?? 0;
          return (
            <Pressable
              key={route.id}
              accessibilityRole="button"
              accessibilityLabel={route.label}
              accessibilityState={{ selected: active }}
              onPress={() => onNavigate(route.id)}
              style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
            >
              {active ? <View style={styles.activeChip} /> : null}
              <View style={styles.iconSlot}>
                <MobileIcon
                  name={route.icon}
                  size={21}
                  color={active ? colors.info : colors.mutedForeground}
                />
                {badge > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText} numberOfLines={1}>
                      {badge > 9 ? "9+" : String(badge)}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text
                style={[styles.label, active && styles.labelActive]}
                numberOfLines={1}
              >
                {route.label}
              </Text>
            </Pressable>
          );
        })}
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 20,
    right: 20,
    zIndex: 50,
  },
  bar: {
    height: TAB_BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: spacing[2],
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingVertical: spacing[2],
  },
  tabPressed: {
    opacity: 0.7,
  },
  activeChip: {
    position: "absolute",
    top: 2,
    left: 6,
    right: 6,
    bottom: 2,
    borderRadius: 20,
    backgroundColor: colors.accent,
  },
  iconSlot: {
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: -5,
    right: -11,
    minWidth: 16,
    height: 16,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.destructive,
    zIndex: 2,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },
  label: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.1,
    color: colors.mutedForeground,
  },
  labelActive: {
    color: colors.info,
  },
});
