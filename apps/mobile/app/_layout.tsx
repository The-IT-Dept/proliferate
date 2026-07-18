import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Stack, useGlobalSearchParams, usePathname, useRouter } from "expo-router";

import { getMobileTelemetryConfig } from "../src/lib/integrations/telemetry/config";
import { initializeMobilePostHog } from "../src/lib/integrations/telemetry/posthog";
import { mobileTelemetryScreenForPathname } from "../src/lib/domain/shell/mobile-route-telemetry";
import { resolveMobileShellStage } from "../src/lib/domain/shell/mobile-shell-stage";
import { useMobileClientDailyActivity } from "../src/hooks/telemetry/lifecycle/use-mobile-client-daily-activity";
import { useMobileDeepLinkRouter } from "../src/hooks/shell/lifecycle/use-mobile-deep-link-router";
import { useMobileOnboardingStatus } from "../src/hooks/shell/lifecycle/use-mobile-onboarding-status";
import { useMobileScreenTelemetry } from "../src/hooks/telemetry/lifecycle/use-mobile-screen-telemetry";
import { MobileAuthProvider, useMobileAuth } from "../src/providers/MobileAuthProvider";
import { MobileCloudProvider } from "../src/providers/MobileCloudProvider";
import { MobileTelemetryProvider } from "../src/providers/MobileTelemetryProvider";
import { MobileWorkspaceRuntimeProvider } from "../src/providers/MobileWorkspaceRuntimeProvider";
import { colors, spacing } from "../src/styles/tokens";

// Same telemetry bootstrap `index.ts` used to run before `registerRootComponent`
// (module scope, once, before first render). Expo Router owns the entry point
// now (`main: "expo-router/entry"` in package.json), so this is its new home.
// `initializeMobilePostHog` is idempotent (guards on a module-level flag), so
// this is safe alongside `MobileTelemetryProvider`'s own init effect below,
// exactly as it was safe alongside `index.ts`'s call before this migration.
const telemetryConfig = getMobileTelemetryConfig();
initializeMobilePostHog({
  environment: telemetryConfig.environment,
  release: telemetryConfig.release,
  posthog: telemetryConfig.posthog,
});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={styles.fill}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <MobileAuthProvider>
            <MobileTelemetryProvider>
              <MobileCloudProvider>
                <RootNavigationGate />
              </MobileCloudProvider>
            </MobileTelemetryProvider>
          </MobileAuthProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Top-level auth/onboarding gate, replacing `MobileShell`'s manual render
 * switch. Reuses `resolveMobileShellStage` verbatim (same stage semantics:
 * bootstrapping -> splash; signed_out -> auth; needs_github; onboarding;
 * main) and expresses the routing as Expo Router `Stack.Protected` guards
 * instead of a custom switch. The stage's "chat" branch (workspace pushed
 * over the tabs) is no longer a gate concern - `hasSelectedChat` is always
 * `false` here, so the pure function always resolves to "tabs" once
 * authenticated; which of (tabs) vs workspace/[id] is showing is now just
 * normal Stack navigation state, not something the gate decides.
 */
function RootNavigationGate() {
  const router = useRouter();
  const { authState } = useMobileAuth();
  const { onboardingStatus } = useMobileOnboardingStatus(authState);
  const stage = resolveMobileShellStage({ authState, onboardingStatus, hasSelectedChat: false });
  const { id: activeWorkspaceId } = useGlobalSearchParams<{ id?: string }>();

  const pathname = usePathname();
  const telemetryScreen = mobileTelemetryScreenForPathname(pathname);
  useMobileScreenTelemetry(authState, telemetryScreen);
  useMobileDailyActivity(authState, telemetryScreen);
  useMobileDeepLinkRouter(router, stage === "tabs");

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

  return (
    <MobileWorkspaceRuntimeProvider workspaceId={activeWorkspaceId ?? null}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={stage === "signed_out" || stage === "needs_github"}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={stage === "onboarding"}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={stage === "tabs"}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="workspace/[id]" options={{ animation: "slide_from_right" }} />
        </Stack.Protected>
      </Stack>
    </MobileWorkspaceRuntimeProvider>
  );
}

function useMobileDailyActivity(
  authState: ReturnType<typeof useMobileAuth>["authState"],
  telemetryScreen: ReturnType<typeof mobileTelemetryScreenForPathname>,
) {
  const { accessToken, user } = useMobileAuth();
  const canRecordAuthenticatedActivity = authState === "active" || authState === "needs_github";
  useMobileClientDailyActivity({
    accessToken: canRecordAuthenticatedActivity ? accessToken : null,
    actorStorageKey: user?.id ?? null,
    routeOrScreen: authState === "needs_github" ? "connect_github" : telemetryScreen,
    viewingChat: authState === "active" && telemetryScreen === "chat",
  });
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
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
});
