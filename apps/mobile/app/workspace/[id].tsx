import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { MobileChatScreen } from "../../src/components/chat/MobileChatScreen";
import type { MobileCloudChat } from "../../src/navigation/navigation-model";
import { useMobileAuth } from "../../src/providers/MobileAuthProvider";
import { colors } from "../../src/styles/tokens";

/**
 * The workspace shell, pushed full-screen over the 4-tab root (IA §1:
 * "Workspace Shell - pushed full-screen from any tab, hides the tab bar").
 * Because this is a sibling of `(tabs)` at the root Stack (not nested inside
 * the NativeTabs layout), a normal `router.push` here is a real native push
 * that covers the tab bar - no "hide the tab bar" state to manage by hand
 * the way `MobileShell`'s stage switch used to.
 *
 * Only `id` (+ optional `sessionId`/`interaction`) survive navigation - Expo
 * Router params are strings on a URL, not JS object references - so this
 * builds a minimal `MobileCloudChat` scaffold and lets `useMobileChatData`
 * (already written to treat every non-id field as a fallback until
 * `useCloudWorkspace(chat.workspaceId)` resolves) fill in the rest. The
 * pending-prompt-on-launch case doesn't need special handling here either:
 * `useMobileHomeLaunchActions` already persists the draft to
 * `pending-mobile-prompt-store` keyed by workspace id before it calls
 * `onOpenChat`, and `useMobilePendingPromptRestore` reads that store first,
 * falling back to `chat.initialPendingPrompt` only if storage is empty.
 *
 * Native large-title / glass nav-bar header options
 * (`headerLargeTitleEnabled`, `headerTransparent` + `headerBlurEffect`, or
 * relying on iOS 26's automatic `scrollEdgeEffects` with `headerTransparent`
 * alone) are available on this Stack.Screen but intentionally unused here:
 * `MobileChatScreen` already renders its own `MobileChatHeader` (title,
 * back button, session controls), and turning on the native header too
 * would double up. Adopting the native header is a later-group rewrite of
 * `MobileChatHeader`, not part of this navigation migration.
 */
export default function WorkspaceRoute() {
  const router = useRouter();
  const { id, sessionId, interaction } = useLocalSearchParams<{
    id: string;
    sessionId?: string;
    interaction?: string;
  }>();
  const { user, accessToken } = useMobileAuth();

  const chat: MobileCloudChat = {
    workspaceId: id,
    workspaceName: "Workspace",
    repoLabel: "",
    branchLabel: "main",
    targetId: null,
    workspaceRuntimeId: null,
    sessionId: sessionId ?? null,
    title: "Workspace",
    status: "unknown",
    visibility: "private",
    initialInteractionRequestId: interaction ?? null,
  };

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top", "right", "bottom", "left"]}
    >
      <MobileChatScreen
        chat={chat}
        ownerUserId={user?.id ?? null}
        productToken={accessToken}
        onBack={() => router.back()}
        onSessionSelected={(nextSessionId) => router.setParams({ sessionId: nextSessionId })}
      />
    </SafeAreaView>
  );
}
