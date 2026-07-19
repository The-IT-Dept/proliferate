import { Stack } from "expo-router";

/**
 * Nested Stack for the Settings tab, so it can render a native header
 * (large title + automatic iOS glass). See `(tabs)/index/_layout.tsx` for
 * why this pattern (folder + `_layout.tsx` + `index.tsx`) is needed per tab,
 * and why the URL (`/settings`) is unaffected.
 */
export default function SettingsTabStackLayout() {
  return (
    <Stack screenOptions={{ headerLargeTitleEnabled: true }}>
      {/* `agents` (Group H) is itself a folder + `_layout.tsx` + `index.tsx`
          nested native Stack (`settings/agents/_layout.tsx`), so it draws its
          own header for its two pushed routes. Without suppressing THIS
          parent's header for the route, React Navigation renders both the
          parent's (title "agents") and the nested Stack's header stacked on
          top of one another. Every other file route under `settings/` is
          left unlisted and keeps auto-registering with the screenOptions
          above (see useScreens.js's "Add any remaining children"). */}
      <Stack.Screen name="agents" options={{ headerShown: false }} />
    </Stack>
  );
}
