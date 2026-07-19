import { Stack, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { MobileAutomationDetailScreen } from "../../../src/components/automations/MobileAutomationDetailScreen";
import { colors } from "../../../src/styles/tokens";

/**
 * One automation's detail pane (`/automations/[id]`), pushed from the
 * Automations tab's list rows.
 */
export default function AutomationDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const automationId = id ?? "";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }} edges={["left", "right"]}>
      <Stack.Screen options={{ title: "Automation" }} />
      <MobileAutomationDetailScreen automationId={automationId} />
    </SafeAreaView>
  );
}
