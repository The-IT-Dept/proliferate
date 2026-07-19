import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  completeOnboardingStatus,
  ensureOnboardingStatusLoaded,
  getOnboardingStatusSnapshot,
  subscribeOnboardingStatus,
  type MobileOnboardingStatus,
} from "./mobile-onboarding-status-store";

export type { MobileOnboardingStatus };

/**
 * Thin wrapper around the module-level onboarding-status store (see
 * `mobile-onboarding-status-store.ts` for why a shared store, rather than
 * per-instance `useState`, is required here). `useSyncExternalStore` is what
 * makes `completeOnboarding()` called from one consumer (the onboarding
 * route) immediately visible to every other mounted consumer (the root gate)
 * in the same session - no extra plumbing needed between them.
 */
export function useMobileOnboardingStatus(authState: string): {
  completeOnboarding: () => Promise<void>;
  onboardingStatus: MobileOnboardingStatus;
} {
  useEffect(() => {
    ensureOnboardingStatusLoaded(authState);
  }, [authState]);

  const onboardingStatus = useSyncExternalStore(
    subscribeOnboardingStatus,
    getOnboardingStatusSnapshot,
    getOnboardingStatusSnapshot,
  );

  const completeOnboarding = useCallback(async () => {
    await completeOnboardingStatus();
  }, []);

  return { completeOnboarding, onboardingStatus };
}
