import { NativeTabs } from "expo-router/unstable-native-tabs";

/**
 * The 4-tab root shell (IA: Home / Workspaces / Automations / Settings),
 * replacing the custom `expo-glass-effect`/`expo-blur` `MobileTabBar`.
 *
 * `NativeTabs` renders a real `UITabBarController` on iOS (Material 3 on
 * Android) instead of a JS-drawn bar, so:
 *  - iOS 26 Liquid Glass is automatic (system-drawn, no manual blur/glass
 *    surface to build or maintain).
 *  - Scroll-edge transparency is automatic (`disableTransparentOnScrollEdge`
 *    is left at its default `false`).
 *  - `minimizeBehavior="onScrollDown"` gets the iOS 26 minimize-on-scroll
 *    behavior for free.
 *  - Content insets for the tab screens' first scroll view are computed
 *    natively (`disableAutomaticContentInsets` defaults to `false`), which
 *    is what makes the old `TAB_BAR_HEIGHT`/`tabBarFootprint` bottom-inset
 *    padding hack (reserving space under an absolutely-positioned floating
 *    bar) obsolete - removed from all 4 screens in this change.
 *
 * `expo-router/unstable-native-tabs` is still the correct import path on
 * SDK 56 (expo-router 6.x) - confirmed against the installed package
 * (`node_modules/expo-router/unstable-native-tabs.js` re-exports
 * `./build/native-tabs`, matching the current docs, which still label the
 * API unstable as of SDK 57 too).
 */
export default function TabsLayout() {
  return (
    <NativeTabs minimizeBehavior="onScrollDown">
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "house", selected: "house.fill" }} md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="workspaces">
        <NativeTabs.Trigger.Label>Workspaces</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }}
          md="grid_view"
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="automations">
        <NativeTabs.Trigger.Label>Automations</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar.badge.clock" md="calendar_clock" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: "gearshape", selected: "gearshape.fill" }} md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
