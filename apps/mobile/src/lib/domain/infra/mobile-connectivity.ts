/**
 * Row 40 (parity map) — pure connectivity-state logic. Mirrors web's
 * connectivity store (`apps/packages/product-client/src/stores/infra/
 * connectivity-store.ts`) as closely as a native source allows:
 *
 * - The public state shape is the same single field web exposes —
 *   `{ isOnline: boolean }` — no "reconnecting" tri-state. Web's store has
 *   no debounce and no reconnecting phase (confirmed by reading
 *   `connectivity-store.ts` + `use-connectivity-listeners.ts` +
 *   `OfflineIndicator.tsx`: it is a flat online/offline flip driven directly
 *   by the browser's `online`/`offline` events), so this mirrors that
 *   exactly rather than inventing a debounce or a reconnecting phase mobile
 *   doesn't need parity for.
 * - `nextMobileConnectivityState` mirrors the store's `setOnline`
 *   no-op-when-unchanged behavior (`state.isOnline === isOnline ? state :
 *   {isOnline}`) so a subscriber (e.g. the banner) doesn't re-render on
 *   every native network-state sample that doesn't actually change the
 *   coarse online/offline verdict.
 * - `initialMobileConnectivityState` defaults to online, mirroring web's
 *   `initialOnline()` fallback (`navigator === undefined` -> `true`): start
 *   optimistic rather than flashing an offline banner before the first
 *   native sample arrives.
 *
 * `deriveIsOnline` is the one part with no web equivalent — the browser has
 * a single boolean (`navigator.onLine`); native has two related but distinct
 * signals from `expo-network`'s `NetworkState` (`isConnected`: an active
 * network interface exists; `isInternetReachable`: that interface actually
 * has validated internet access, Android only — iOS always mirrors
 * `isConnected`). Treated as: offline if either signal explicitly reports
 * false, online otherwise (including "unknown", to stay optimistic like
 * web's default).
 */

export interface MobileConnectivitySample {
  isConnected?: boolean;
  isInternetReachable?: boolean;
}

export interface MobileConnectivityState {
  /** Whether the app currently believes it has network connectivity. */
  isOnline: boolean;
}

/** Verbatim copy from web's `OfflineIndicator.tsx` (product-client). */
export const OFFLINE_BANNER_MESSAGE =
  "No internet connection — local work is safe; agents need a connection.";

export function deriveIsOnline(sample: MobileConnectivitySample | null | undefined): boolean {
  if (!sample) {
    return true;
  }
  if (sample.isConnected === false) {
    return false;
  }
  if (sample.isInternetReachable === false) {
    return false;
  }
  return true;
}

export function initialMobileConnectivityState(): MobileConnectivityState {
  return { isOnline: true };
}

export function nextMobileConnectivityState(
  current: MobileConnectivityState,
  sample: MobileConnectivitySample | null | undefined,
): MobileConnectivityState {
  const isOnline = deriveIsOnline(sample);
  if (current.isOnline === isOnline) {
    return current;
  }
  return { isOnline };
}

/** Mirrors `OfflineIndicator`'s `if (isOnline) return null;` gate. */
export function isOfflineBannerVisible(state: MobileConnectivityState): boolean {
  return !state.isOnline;
}
