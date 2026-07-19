import { Stack, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { MobileAgentAuthListScreen } from "../../../../src/components/settings/agents/MobileAgentAuthListScreen";
import { colors } from "../../../../src/styles/tokens";

/**
 * Group H — the harness/agent-auth list route (`/settings/agents`), pushed
 * from the Settings tab's ACCOUNT section and from the Home composer's
 * "Agents" affordance (both previously fell back to `/settings` itself).
 */
export default function SettingsAgentsIndexRoute() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["left", "right"]}>
      <Stack.Screen options={{ title: "Agents" }} />
      <MobileAgentAuthListScreen onOpenAgent={(kind) => router.push({ pathname: "/settings/agents/[kind]", params: { kind } })} />
    </SafeAreaView>
  );
}
