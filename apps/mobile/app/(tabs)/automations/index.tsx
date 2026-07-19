import { Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { MobileAutomationsScreen } from "../../../src/components/automations/MobileAutomationsScreen";
import { colors } from "../../../src/styles/tokens";

export default function AutomationsTabRoute() {
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["left", "right"]}
    >
      {/* The nested Stack's headerLargeTitleEnabled (automations/_layout.tsx)
          owns the top inset and the title chrome, so "top" is dropped from
          edges and the old MobileTopBar is gone. Native headers have no
          subtitle slot, so the "Scheduled runs" caption lives in the screen
          body BELOW the title — and, critically, inside the screen's own
          inset-aware scroll view (MobileScreen) rather than as a bare sibling
          here, which would render it at y=0 under the large title and stop the
          scroll view from being the screen's first child. */}
      <Stack.Screen options={{ title: "Automations" }} />
      <MobileAutomationsScreen />
    </SafeAreaView>
  );
}
