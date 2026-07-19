import { Stack, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { MobileAgentAuthDetailScreen } from "../../../../src/components/settings/agents/MobileAgentAuthDetailScreen";
import { getProviderDisplayName } from "../../../../src/lib/domain/agent-auth/provider-display";
import { colors } from "../../../../src/styles/tokens";

/**
 * Group H — one agent's harness pane (`/settings/agents/[kind]`): auth
 * status, the device-code login terminal, and its gateway model catalog.
 */
export default function SettingsAgentDetailRoute() {
  const { kind } = useLocalSearchParams<{ kind: string }>();
  const resolvedKind = kind ?? "";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["left", "right"]}>
      <Stack.Screen options={{ title: getProviderDisplayName(resolvedKind) }} />
      <MobileAgentAuthDetailScreen kind={resolvedKind} />
    </SafeAreaView>
  );
}
