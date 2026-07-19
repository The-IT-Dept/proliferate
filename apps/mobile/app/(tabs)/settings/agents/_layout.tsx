import { Stack } from "expo-router";

/**
 * Group H — nested Stack for the pushed "Agents" sub-flow within the
 * Settings tab (list -> per-agent detail), same directory + `_layout.tsx` +
 * `index.tsx` nesting pattern as `(tabs)/index/_layout.tsx` and
 * `(tabs)/workspaces/_layout.tsx`. Unlike the tab-root Stacks (which enable
 * `headerLargeTitleEnabled` for their own large title), these are PUSHED
 * screens within Settings, so they get normal compact native headers —
 * mirroring `workspace/[id]`'s push style in the root `app/_layout.tsx`.
 */
export default function SettingsAgentsStackLayout() {
  return <Stack screenOptions={{ headerLargeTitleEnabled: false }} />;
}
