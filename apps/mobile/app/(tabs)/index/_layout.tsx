import { Stack } from "expo-router";

/**
 * Nested Stack for the Home tab's own content, so it can render Expo
 * Router's native header (large title + automatic iOS glass -
 * `headerLargeTitleEnabled` alone makes the header background transparent
 * on iOS, see `useHeaderConfigProps.js`). `NativeTabs` (the parent
 * `(tabs)/_layout.tsx`) only renders the tab bar - each tab needs its own
 * navigator to own a header, which is why the Home tab is this folder
 * (`index/_layout.tsx` + a screen) rather than a single `index.tsx` file.
 *
 * The screen lives in a `(home)` route group (`index/(home)/index.tsx`), not
 * directly at `index/index.tsx`. A route group is invisible to the URL, so
 * the tab route stays `index` and its URL stays `/` -
 * `NativeTabs.Trigger name="index"` and the deep-link targets in
 * `app/+native-intent.ts` are unaffected - but it gives the inner screen a
 * distinct navigator route name (`(home)/index`) instead of a second `index`
 * nested inside the `index` Stack. Without the group both the tab route and
 * its only screen resolved to `index`, which tripped React Navigation's
 * "Found screens with the same name nested inside one another" warning
 * (`__root > (tabs) > index > index`) and made that nesting ambiguous.
 */
export default function HomeTabStackLayout() {
  return <Stack screenOptions={{ headerLargeTitleEnabled: true }} />;
}
