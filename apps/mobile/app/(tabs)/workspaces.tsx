import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { MobileWorkspacesScreen } from "../../src/components/work/MobileAllWorkScreen";
import { mobileWorkspaceHref } from "../../src/lib/domain/shell/mobile-workspace-route";
import type { MobileCloudChat } from "../../src/navigation/navigation-model";
import { colors } from "../../src/styles/tokens";

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

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top", "left", "right"]}
    >
      <MobileWorkspacesScreen onOpenChat={openChat} onNewChat={() => router.navigate("/")} />
    </SafeAreaView>
  );
}
