import { Stack } from "expo-router";

import { useMobileAuth } from "../../src/providers/MobileAuthProvider";

/**
 * The pre-tab auth flow (IA: "Sign in -> Connect GitHub -> Onboarding").
 * The parent gate (`app/_layout.tsx`) only decides *whether* this group is
 * active; which of its two screens shows is this group's own concern, keyed
 * off the same `authState` the old `MobileShell` switch used ("needs_github"
 * vs everything else that lands here, i.e. "signed_out").
 */
export default function AuthLayout() {
  const { authState } = useMobileAuth();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={authState !== "needs_github"}>
        <Stack.Screen name="index" />
      </Stack.Protected>
      <Stack.Protected guard={authState === "needs_github"}>
        <Stack.Screen name="connect-github" />
      </Stack.Protected>
    </Stack>
  );
}
