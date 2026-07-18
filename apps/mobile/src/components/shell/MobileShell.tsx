import { StatusBar } from "expo-status-bar";
import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MobileAuthScreen } from "../auth/MobileAuthScreen";
import { MobileConnectGitHubScreen } from "../auth/MobileConnectGitHubScreen";
import { MobileOnboardingScreen } from "../onboarding/MobileOnboardingScreen";
import { MobileAutomationsScreen } from "../automations/MobileAutomationsScreen";
import { MobileChatScreen } from "../chat/MobileChatScreen";
import { MobileHomeScreen } from "../home/MobileHomeScreen";
import { MobileSettingsScreen } from "../settings/MobileSettingsScreen";
import { MobileTabBar } from "./tabbar/MobileTabBar";
import { MobileTopBar } from "../primitives/MobileTopBar";
import { MobileWorkspacesScreen } from "../work/MobileAllWorkScreen";
import { useMobileOnboardingStatus } from "../../hooks/shell/lifecycle/use-mobile-onboarding-status";
import { useMobileShellNavigation } from "../../hooks/shell/lifecycle/use-mobile-shell-navigation";
import { useMobileClientDailyActivity } from "../../hooks/telemetry/lifecycle/use-mobile-client-daily-activity";
import { useMobileScreenTelemetry } from "../../hooks/telemetry/lifecycle/use-mobile-screen-telemetry";
import {
  buildMobileShellAccountSummary,
  mobileShellRouteSubtitle,
} from "../../lib/domain/shell/mobile-shell-navigation";
import { resolveMobileShellStage } from "../../lib/domain/shell/mobile-shell-stage";
import { routeTitle } from "../../navigation/navigation-model";
import { useMobileAuth } from "../../providers/MobileAuthProvider";
import { MobileWorkspaceRuntimeProvider } from "../../providers/MobileWorkspaceRuntimeProvider";
import { colors, spacing } from "../../styles/tokens";

export function MobileShell() {
  const {
    authState,
    accessToken,
    user,
    signInWithProvider,
    signInWithPassword,
    connectGitHub,
    signOut,
    loadingAction,
    error,
  } = useMobileAuth();
  const ownerUserId = user?.id ?? null;
  const nav = useMobileShellNavigation(authState, ownerUserId);

  const { completeOnboarding, onboardingStatus } = useMobileOnboardingStatus(authState);
  const subtitle = useMemo(() => mobileShellRouteSubtitle(nav.route), [nav.route]);
  const account = useMemo(() => buildMobileShellAccountSummary(user), [user]);
  const stage = resolveMobileShellStage({
    authState,
    onboardingStatus,
    hasSelectedChat: nav.selectedChat !== null,
  });
  const telemetryScreen = nav.selectedChat ? "chat" : nav.route;

  useMobileScreenTelemetry(authState, telemetryScreen);
  const canRecordAuthenticatedActivity = authState === "active" || authState === "needs_github";
  useMobileClientDailyActivity({
    accessToken: canRecordAuthenticatedActivity ? accessToken : null,
    actorStorageKey: user?.id ?? null,
    routeOrScreen: authState === "needs_github" ? "connect_github" : telemetryScreen,
    viewingChat: authState === "active" && nav.selectedChat !== null,
  });

  async function handleSignOut() {
    await nav.resetForSignOut(ownerUserId);
    await signOut();
  }

  if (stage === "bootstrapping") {
    return (
      <SafeAreaView style={styles.root} edges={["top", "right", "bottom", "left"]}>
        <StatusBar style="light" />
        <View style={styles.loadingRoot}>
          <ActivityIndicator color={colors.fg} />
          <Text style={styles.loadingText}>Opening Proliferate</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (stage === "signed_out") {
    return (
      <SafeAreaView style={styles.root} edges={["top", "right", "bottom", "left"]}>
        <StatusBar style="light" />
        <MobileAuthScreen
          onProvider={(provider) => void signInWithProvider(provider)}
          onPassword={(email, password) => void signInWithPassword(email, password)}
          loadingAction={loadingAction}
          error={error}
        />
      </SafeAreaView>
    );
  }

  if (stage === "needs_github") {
    return (
      <SafeAreaView style={styles.root} edges={["top", "right", "bottom", "left"]}>
        <StatusBar style="light" />
        <MobileConnectGitHubScreen
          onConnect={() => void connectGitHub()}
          onSignOut={() => void handleSignOut()}
          loading={loadingAction === "github_link"}
          error={error}
        />
      </SafeAreaView>
    );
  }

  if (stage === "onboarding") {
    return (
      <View style={styles.rootShell}>
        <StatusBar style="light" />
        <MobileOnboardingScreen onDone={() => void completeOnboarding()} />
      </View>
    );
  }

  // stage is "tabs" or "chat": the authenticated 4-tab glass shell, or the
  // workspace shell pushed full-screen over it (hides the tab bar — IA §1).
  // Both need the AnyHarness workspace-runtime scope, so it wraps this whole
  // branch rather than just the chat screen.
  return (
    <MobileWorkspaceRuntimeProvider workspaceId={nav.selectedChat?.workspaceId ?? null}>
      <View style={styles.rootShell}>
        <StatusBar style="light" />

        {stage === "chat" && nav.selectedChat ? (
          <SafeAreaView style={styles.chatRoot} edges={["top", "right", "bottom", "left"]}>
            <MobileChatScreen
              chat={nav.selectedChat}
              ownerUserId={ownerUserId}
              productToken={accessToken}
              onBack={nav.closeChat}
              onInitialPendingPromptConsumed={nav.clearSelectedChatInitialPendingPrompt}
              onSessionSelected={nav.markSelectedChatSession}
            />
          </SafeAreaView>
        ) : (
          <SafeAreaView style={styles.tabRoot} edges={["top", "left", "right"]}>
            <View style={styles.tabContent}>
              {nav.route === "home" ? (
                <MobileHomeScreen
                  ownerUserId={ownerUserId}
                  onOpenChat={nav.openChat}
                  onConfigureRepos={() => nav.navigate("settings")}
                  onOpenAgents={() => nav.navigate("settings")}
                />
              ) : nav.route === "work" ? (
                <MobileWorkspacesScreen
                  onOpenChat={nav.openChat}
                  onNewChat={() => nav.navigate("home")}
                />
              ) : nav.route === "automations" ? (
                <>
                  <MobileTopBar title={routeTitle(nav.route)} subtitle={subtitle} />
                  <MobileAutomationsScreen />
                </>
              ) : (
                <>
                  <MobileTopBar title={routeTitle(nav.route)} subtitle={subtitle} />
                  <MobileSettingsScreen account={account} onSignOut={() => void handleSignOut()} />
                </>
              )}
            </View>
            <MobileTabBar activeRoute={nav.route} onNavigate={nav.navigate} />
          </SafeAreaView>
        )}
      </View>
    </MobileWorkspaceRuntimeProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[3],
    backgroundColor: colors.background,
  },
  loadingText: {
    color: colors.mutedForeground,
    fontSize: 13,
  },
  rootShell: {
    flex: 1,
    backgroundColor: colors.sidebar,
  },
  chatRoot: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabRoot: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabContent: {
    flex: 1,
  },
});
