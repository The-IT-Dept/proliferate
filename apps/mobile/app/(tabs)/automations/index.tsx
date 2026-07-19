import { Stack } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MobileAutomationsScreen } from "../../../src/components/automations/MobileAutomationsScreen";
import { colors, spacing } from "../../../src/styles/tokens";

export default function AutomationsTabRoute() {
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={["left", "right"]}
    >
      {/* The nested Stack's headerLargeTitleEnabled (automations/_layout.tsx)
          owns the top inset and the title chrome now, so "top" is dropped
          from edges and the old MobileTopBar is gone. Native headers have no
          subtitle slot, so "Scheduled runs" moves into the body as a small
          caption instead of being dropped. */}
      <Stack.Screen options={{ title: "Automations" }} />
      <Text style={styles.subtitle}>Scheduled runs</Text>
      <MobileAutomationsScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    color: colors.faint,
    fontSize: 12,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[1],
    paddingBottom: 2,
  },
});
