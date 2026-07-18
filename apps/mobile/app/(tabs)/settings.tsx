import { useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";

import { MobileTopBar } from "../../src/components/primitives/MobileTopBar";
import { MobileSettingsScreen } from "../../src/components/settings/MobileSettingsScreen";
import { buildMobileAccountSummary } from "../../src/lib/domain/settings/mobile-account-summary";
import { useMobileAuth } from "../../src/providers/MobileAuthProvider";
import { colors } from "../../src/styles/tokens";

export default function SettingsTabRoute() {
  const { user, signOut } = useMobileAuth();
  const account = useMemo(() => buildMobileAccountSummary(user), [user]);

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top", "left", "right"]}
    >
      <MobileTopBar title="Settings" subtitle="Account · device" />
      <MobileSettingsScreen account={account} onSignOut={() => void signOut()} />
    </SafeAreaView>
  );
}
