import { resolveMobileNativeIntentPath } from "../src/lib/domain/shell/mobile-native-intent-redirect";

/**
 * Expo Router's native-intent hook
 * (docs.expo.dev/router/advanced/native-intent): processes every incoming
 * OS-level URL - the cold-start `Linking.getInitialURL()` value and warm
 * `url` events alike - before Expo Router resolves it against the route
 * tree. `path` is always the full raw URL (scheme included), exactly what
 * the old manual `Linking` listener received (confirmed against the
 * installed source: expo-router's `getLinkingConfig.js`/`link/linking.js`
 * both pass the untouched URL straight through as `path`).
 *
 * This is thin wiring only - `resolveMobileNativeIntentPath`
 * (`src/lib/domain/shell/mobile-native-intent-redirect.ts`, unit-tested)
 * has the actual rewrite logic, kept out of this file because `app/**`
 * isn't in vitest's `include` glob and this function can't depend on React/
 * a query client (it runs before the router and providers mount).
 *
 * Replaces `use-mobile-deep-link-router.ts`'s manual `Linking.
 * addEventListener` wiring (deleted). Routing every deep link through Expo
 * Router's own built-in handler, exactly once, fixes:
 *  - the warm-link double-handle: the manual listener and Expo Router's own
 *    handler used to both fire for the same warm `url` event, producing a
 *    not-found flash before the manual listener's redirect landed;
 *  - the drop-while-signed-out case: the manual listener only ran once
 *    `ready` (`stage === "tabs"`) was true, so a link arriving before
 *    sign-in resolved was silently lost. `Stack.Protected` (app/_layout.tsx)
 *    resolves/replays a redirected path against its guards on its own once
 *    they open (e.g. after sign-in) - no readiness gate is needed here.
 *
 * Throwing here can crash the app per Expo Router's docs, so
 * `resolveMobileNativeIntentPath`'s own try/catch-free purity is backstopped
 * with one here too: worst case, the raw path passes through unredirected.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return resolveMobileNativeIntentPath(path);
  } catch {
    return path;
  }
}
