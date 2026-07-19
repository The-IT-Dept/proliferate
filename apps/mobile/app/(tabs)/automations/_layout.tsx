import { Stack } from "expo-router";

/**
 * Nested Stack for the Automations tab, so it can render a native header
 * (large title + automatic iOS glass). See `(tabs)/index/_layout.tsx` for
 * why this pattern (folder + `_layout.tsx` + `index.tsx`) is needed per tab,
 * and why the URL (`/automations`) is unaffected.
 */
export default function AutomationsTabStackLayout() {
  return <Stack screenOptions={{ headerLargeTitleEnabled: true }} />;
}
