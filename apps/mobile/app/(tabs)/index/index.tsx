import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { MobileHomeScreen } from "../../../src/components/home/MobileHomeScreen";
import { mobileWorkspaceHref } from "../../../src/lib/domain/shell/mobile-workspace-route";
import type { MobileCloudChat } from "../../../src/lib/domain/workspace/mobile-workspace-chat";
import { useMobileAuth } from "../../../src/providers/MobileAuthProvider";
import { colors } from "../../../src/styles/tokens";

export default function HomeTabRoute() {
  const router = useRouter();
  const { user } = useMobileAuth();
  const ownerUserId = user?.id ?? null;

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
      edges={["left", "right"]}
    >
      {/* The nested Stack's headerLargeTitleEnabled (index/_layout.tsx) owns
          the top inset now, so this screen no longer reserves its own "top"
          safe-area edge - keeping it would double the gap under the header. */}
      <Stack.Screen options={{ title: "Home" }} />
      <MobileHomeScreen
        ownerUserId={ownerUserId}
        onOpenChat={openChat}
        onConfigureRepos={() => router.navigate("/settings")}
        onOpenAgents={() => router.navigate("/settings")}
      />
    </SafeAreaView>
  );
}
