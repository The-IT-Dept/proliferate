import { mobileTheme } from "@proliferate/design/react-native";
import { DarkTheme, type Theme } from "expo-router";

export const theme = mobileTheme;
export const colors = {
  ...mobileTheme.colors,
  bg: mobileTheme.colors.background,
  fg: mobileTheme.colors.foreground,
  green: mobileTheme.colors.success,
  blue: mobileTheme.colors.info,
  red: mobileTheme.colors.destructive,
  mutedText: mobileTheme.colors.mutedForeground,
} as const;
export const spacing = mobileTheme.spacing;
export const radius = mobileTheme.radius;
export const typography = mobileTheme.typography;
export const shadow = mobileTheme.shadow;

/**
 * React Navigation theme for Expo Router's native Stack headers (native-
 * stack, via react-native-screens; `useHeaderConfigProps` resolves title/
 * back-button/large-title colors from `useTheme()`). `expo-router`'s
 * `ExpoRoot` renders its root `NavigationContainer` with no `theme` prop, so
 * it falls back to a *light* `DarkTheme`-sibling default (`DefaultTheme`)
 * regardless of this app's `userInterfaceStyle: "dark"` (app.config.js) -
 * unlike `NativeTabs`, which reads the OS appearance directly and needs no
 * such wiring. Without this, native headers would render a white/light bar
 * over this app's all-dark surfaces. `app/_layout.tsx` wraps the routed tree
 * in `<ThemeProvider value={mobileNavigationTheme}>` so every native header
 * (root Stack + the nested per-tab Stacks) picks up the app's real palette
 * instead.
 */
export const mobileNavigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: mobileTheme.colors.info,
    background: mobileTheme.colors.background,
    card: mobileTheme.colors.card,
    text: mobileTheme.colors.foreground,
    border: mobileTheme.colors.border,
    notification: mobileTheme.colors.destructive,
  },
};

export const layout = {
  screenPadding: spacing[5],
  screenBottomPadding: 96,
  stackGap: spacing[3],
  rowGap: spacing[3],
} as const;

export const text = {
  eyebrow: {
    color: colors.faint,
    fontSize: 12,
    fontWeight: "700" as const,
    textTransform: "uppercase" as const,
  },
  title: {
    color: colors.fg,
    fontSize: 24,
    fontWeight: "700" as const,
    lineHeight: 30,
  },
  body: {
    color: colors.mutedForeground,
    fontSize: 14,
    lineHeight: 20,
  },
  caption: {
    color: colors.faint,
    fontSize: 12,
    lineHeight: 17,
  },
};
