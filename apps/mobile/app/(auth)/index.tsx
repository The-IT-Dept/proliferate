import { SafeAreaView } from "react-native-safe-area-context";

import { MobileAuthScreen } from "../../src/components/auth/MobileAuthScreen";
import { useMobileAuth } from "../../src/providers/MobileAuthProvider";
import { colors } from "../../src/styles/tokens";

export default function SignInRoute() {
  const { signInWithProvider, signInWithPassword, loadingAction, error } = useMobileAuth();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top", "right", "bottom", "left"]}
    >
      <MobileAuthScreen
        onProvider={(provider) => void signInWithProvider(provider)}
        onPassword={(email, password) => void signInWithPassword(email, password)}
        loadingAction={loadingAction}
        error={error}
      />
    </SafeAreaView>
  );
}
