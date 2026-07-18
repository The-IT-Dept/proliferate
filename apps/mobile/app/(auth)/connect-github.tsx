import { SafeAreaView } from "react-native-safe-area-context";

import { MobileConnectGitHubScreen } from "../../src/components/auth/MobileConnectGitHubScreen";
import { useMobileAuth } from "../../src/providers/MobileAuthProvider";
import { colors } from "../../src/styles/tokens";

export default function ConnectGitHubRoute() {
  const { connectGitHub, signOut, loadingAction, error } = useMobileAuth();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top", "right", "bottom", "left"]}
    >
      <MobileConnectGitHubScreen
        onConnect={() => void connectGitHub()}
        onSignOut={() => void signOut()}
        loading={loadingAction === "github_link"}
        error={error}
      />
    </SafeAreaView>
  );
}
