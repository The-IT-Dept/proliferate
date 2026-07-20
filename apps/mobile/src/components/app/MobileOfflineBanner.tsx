import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { isOfflineBannerVisible, OFFLINE_BANNER_MESSAGE } from "../../lib/domain/infra/mobile-connectivity";
import { useMobileConnectivity } from "../../providers/MobileConnectivityProvider";
import { MobileIcon } from "../primitives/MobileIcon";
import { colors, spacing } from "../../styles/tokens";

/**
 * Row 40 (parity map) — app-root persistent banner, mirroring web's
 * `OfflineIndicator.tsx` (product-client): same gate (renders nothing while
 * online), same verbatim copy, same "always visible" placement intent
 * ("Placed at the top of the workspace shell so it is always visible" on
 * web -> mounted at the app root here, above the routed `<Stack>`, in
 * `app/_layout.tsx`).
 *
 * Rendered as a normal flex row ABOVE the native `<Stack>` (not an absolute
 * overlay), so it pushes the header/content down by its own height instead
 * of covering the native header, any Stack screen's controls, or (later)
 * the tab bar — same non-covering intent as `MobileCloudWorkspaceStatusBanner`
 * and `MobileChatClaimBanner`, which already sit inline above their screen's
 * content rather than floating over it. Pads for the top safe-area inset
 * itself since it renders above anything else that would normally own that
 * inset.
 *
 * `accessibilityLiveRegion="polite"` (not `"alert"`) matches web's
 * `role="status"` intent (ARIA's polite live region) — this is a
 * connectivity note, not an interruption, so it shouldn't cut off whatever
 * the screen reader is already announcing. React Native's `accessibilityRole`
 * enum has no `"status"`/ARIA-role equivalent to reach for directly; this
 * follows the same `accessibilityLiveRegion="polite"` pattern already used
 * for non-interrupting announcements elsewhere in this app (see the sign-in
 * error text in `MobileAuthScreen.tsx`).
 */
export function MobileOfflineBanner() {
  const connectivity = useMobileConnectivity();
  const insets = useSafeAreaInsets();

  if (!isOfflineBannerVisible(connectivity)) {
    return null;
  }

  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityLabel={OFFLINE_BANNER_MESSAGE}
      style={[styles.banner, { paddingTop: insets.top + spacing[1] }]}
    >
      <MobileIcon name="wifi-off" size={14} color={colors.warningForeground} />
      <Text style={styles.text} numberOfLines={2}>
        {OFFLINE_BANNER_MESSAGE}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
    backgroundColor: colors.warning,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(242,201,76,0.4)",
  },
  text: {
    flexShrink: 1,
    color: colors.warningForeground,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
    textAlign: "center",
  },
});
