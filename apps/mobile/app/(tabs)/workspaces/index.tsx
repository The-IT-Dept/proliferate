import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { MobileHeaderIconButton } from "../../../src/components/primitives/MobileHeaderIconButton";
import { MobileWorkspacesScreen } from "../../../src/components/work/MobileAllWorkScreen";
import { mobileWorkspaceHref } from "../../../src/lib/domain/shell/mobile-workspace-route";
import type { MobileCloudChat } from "../../../src/lib/domain/workspace/mobile-workspace-chat";
import { colors } from "../../../src/styles/tokens";

export default function WorkspacesTabRoute() {
  const router = useRouter();

  function openChat(chat: MobileCloudChat) {
    router.push(
      mobileWorkspaceHref(chat.workspaceId, {
        sessionId: chat.sessionId,
        requestId: chat.initialInteractionRequestId,
      }),
    );
  }

  function newChat() {
    router.navigate("/");
  }

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["left", "right"]}
    >
      {/* The nested Stack's headerLargeTitleEnabled (workspaces/_layout.tsx)
          owns the top inset now, so "top" is dropped from edges here. The
          "New chat" affordance moves from MobileAllWorkScreen's own hand-drawn
          header row into this native headerRight. */}
      <Stack.Screen
        options={{
          title: "Workspaces",
          headerRight: () => (
            <MobileHeaderIconButton name="plus" accessibilityLabel="New chat" onPress={newChat} />
          ),
        }}
      />
      <MobileWorkspacesScreen onOpenChat={openChat} />
    </SafeAreaView>
  );
}
