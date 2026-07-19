import { useMemo } from "react";
import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { MobileSettingsScreen } from "../../../src/components/settings/MobileSettingsScreen";
import { useMobileGithubAppCallbackRefresh } from "../../../src/hooks/settings/lifecycle/use-mobile-github-app-callback-refresh";
import { buildMobileAccountSummary } from "../../../src/lib/domain/settings/mobile-account-summary";
import { useMobileAuth } from "../../../src/providers/MobileAuthProvider";
import { colors } from "../../../src/styles/tokens";

export default function SettingsTabRoute() {
  const router = useRouter();
  const { user, signOut } = useMobileAuth();
  const account = useMemo(() => buildMobileAccountSummary(user), [user]);
  // Handles the GitHub App callback redirect from app/+native-intent.ts
  // (?source=github_app_callback) - see that hook's doc comment.
  useMobileGithubAppCallbackRefresh();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["left", "right"]}
    >
      {/* The nested Stack's headerLargeTitleEnabled (settings/_layout.tsx) owns
          the top inset and the title chrome, so "top" is dropped from edges and
          the old MobileTopBar is gone. Native headers have no subtitle slot, so
          the "Account · device" caption lives in the screen body BELOW the
          title — inside MobileScreen's inset-aware scroll view, not as a bare
          sibling here (which rendered it under the large title). */}
      <Stack.Screen options={{ title: "Settings" }} />
      <MobileSettingsScreen
        account={account}
        onSignOut={() => void signOut()}
        onOpenAgents={() => router.push("/settings/agents")}
      />
    </SafeAreaView>
  );
}
