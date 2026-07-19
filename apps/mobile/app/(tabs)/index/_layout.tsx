import { Stack } from "expo-router";

/**
 * Nested Stack for the Home tab's own content, so it can render Expo
 * Router's native header (large title + automatic iOS glass -
 * `headerLargeTitleEnabled` alone makes the header background transparent
 * on iOS, see `useHeaderConfigProps.js`). `NativeTabs` (the parent
 * `(tabs)/_layout.tsx`) only renders the tab bar - each tab needs its own
 * navigator to own a header, which is why this is `index/_layout.tsx` +
 * `index/index.tsx` rather than a single `index.tsx` file. Both path
 * segments being "index" means the route URL is unchanged (`/`), so
 * `NativeTabs.Trigger name="index"` and the deep-link targets in
 * `app/+native-intent.ts` keep working.
 */
export default function HomeTabStackLayout() {
  return <Stack screenOptions={{ headerLargeTitleEnabled: true }} />;
}
