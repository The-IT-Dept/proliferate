import { useCallback } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { MobileWorkspaceShell } from "../../src/components/workspace/MobileWorkspaceShell";
import type { MobileCloudChat } from "../../src/lib/domain/workspace/mobile-workspace-chat";
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
 * The native header (compact, glass via `headerTransparent` +
 * `headerBlurEffect`) is configured on this route's `Stack.Screen` entry in
 * `app/_layout.tsx` (static: headerShown/headerTransparent/headerBlurEffect)
 * plus `MobileChatScreen`'s own inline `<Stack.Screen options={{ title,
 * headerRight }} />` (dynamic: title + session/actions, since those depend
 * on chat state that lives in that component, not here). The back button is
 * the native default - it pops the stack the same way the old `onBack`
 * handler did, so this route no longer passes one down.
 */
export default function WorkspaceRoute() {
  const { id, sessionId, interaction } = useLocalSearchParams<{
    id: string;
    sessionId?: string;
    interaction?: string;
  }>();
  const { user, accessToken } = useMobileAuth();
  const router = useRouter();

  // Stable identity: this callback is a dependency of the chat's
  // pending-prompt restore effect (`useMobilePendingPromptRestore`). Inlined
  // as a fresh arrow every render, it re-ran that effect on every render — an
  // async AsyncStorage read whose late resolution could re-apply a stored
  // pending prompt's "new session" mode, clobbering a session the user had
  // just tapped (the "tap existing session → shows New session" bug). `router`
  // from `useRouter()` is stable, so this is stable too.
  const onSessionSelected = useCallback(
    (nextSessionId: string) => {
      router.setParams({ sessionId: nextSessionId });
    },
    [router],
  );

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
      edges={["right", "bottom", "left"]}
    >
      <MobileWorkspaceShell
        chat={chat}
        ownerUserId={user?.id ?? null}
        productToken={accessToken}
        onSessionSelected={onSessionSelected}
      />
    </SafeAreaView>
  );
}
