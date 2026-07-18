import { SafeAreaView } from "react-native-safe-area-context";

import { MobileAutomationsScreen } from "../../src/components/automations/MobileAutomationsScreen";
import { MobileTopBar } from "../../src/components/primitives/MobileTopBar";
import { colors } from "../../src/styles/tokens";

export default function AutomationsTabRoute() {
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["top", "left", "right"]}
    >
      <MobileTopBar title="Automations" subtitle="Scheduled runs" />
      <MobileAutomationsScreen />
    </SafeAreaView>
  );
}
