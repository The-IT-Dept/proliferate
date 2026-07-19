import { useMemo } from "react";
import { Stack } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MobileSettingsScreen } from "../../../src/components/settings/MobileSettingsScreen";
import { buildMobileAccountSummary } from "../../../src/lib/domain/settings/mobile-account-summary";
import { useMobileAuth } from "../../../src/providers/MobileAuthProvider";
import { colors, spacing } from "../../../src/styles/tokens";

export default function SettingsTabRoute() {
  const { user, signOut } = useMobileAuth();
  const account = useMemo(() => buildMobileAccountSummary(user), [user]);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["left", "right"]}
    >
      {/* The nested Stack's headerLargeTitleEnabled (settings/_layout.tsx)
          owns the top inset and the title chrome now, so "top" is dropped
          from edges and the old MobileTopBar is gone. Native headers have no
          subtitle slot, so "Account · device" moves into the body as a small
          caption instead of being dropped. */}
      <Stack.Screen options={{ title: "Settings" }} />
      <Text style={styles.subtitle}>Account · device</Text>
      <MobileSettingsScreen account={account} onSignOut={() => void signOut()} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    color: colors.faint,
    fontSize: 12,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[1],
    paddingBottom: 2,
  },
});
