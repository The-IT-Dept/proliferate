import {
  getMobileStorageItem,
  setMobileStorageItem,
} from "../../../lib/access/mobile-storage";

const ONBOARDING_FLAG_KEY = "proliferate.mobile.onboarded.v1";

export type MobileOnboardingStatus = "checking" | "needed" | "done";

type Listener = () => void;

/**
 * Module-level single source of truth for onboarding status, shared by every
 * `useMobileOnboardingStatus` consumer in the process (the root gate and the
 * onboarding route itself both call the hook, as two independent instances).
 *
 * Before this store existed, each hook instance owned its own `useState`, so
 * `completeOnboarding()` (called from `app/onboarding.tsx`) only updated the
 * onboarding route's own copy - the gate's copy in `app/_layout.tsx` never
 * learned onboarding finished (its storage re-read was keyed on `authState`,
 * which doesn't change after sign-in), leaving the gate stuck on the
 * "onboarding" stage until the app was force-quit and relaunched. Routing
 * every read/write through this module-level store and exposing it via
 * `useSyncExternalStore` means a write from any consumer immediately notifies
 * every other mounted consumer in the same render pass.
 */
let status: MobileOnboardingStatus = "checking";
let loadedForAuthState: string | null = null;
const listeners = new Set<Listener>();

function setStatus(next: MobileOnboardingStatus): void {
  if (status === next) {
    return;
  }
  status = next;
  for (const listener of listeners) {
    listener();
  }
}

export function getOnboardingStatusSnapshot(): MobileOnboardingStatus {
  return status;
}

export function subscribeOnboardingStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Loads the persisted onboarding flag for the given auth state, at most once
 * per active session (guarded by `loadedForAuthState` so concurrently
 * mounted consumers - the gate and, once past the guard, the onboarding
 * route - share one storage read instead of racing separate ones). Mirrors
 * the original per-instance effect: any non-"active" auth state resets the
 * status to "checking" and clears the guard, so the flag is re-read the next
 * time the session becomes active again.
 */
export function ensureOnboardingStatusLoaded(authState: string): void {
  if (authState !== "active") {
    loadedForAuthState = null;
    setStatus("checking");
    return;
  }
  if (loadedForAuthState === authState) {
    return;
  }
  loadedForAuthState = authState;
  void getMobileStorageItem(ONBOARDING_FLAG_KEY)
    .then((value) => {
      setStatus(value === "true" ? "done" : "needed");
    })
    .catch(() => {
      setStatus("needed");
    });
}

export async function completeOnboardingStatus(): Promise<void> {
  try {
    await setMobileStorageItem(ONBOARDING_FLAG_KEY, "true");
  } catch {
    // best effort
  }
  setStatus("done");
}

/** Test-only: restores the module to its just-imported state. */
export function __resetMobileOnboardingStatusStoreForTests(): void {
  status = "checking";
  loadedForAuthState = null;
  listeners.clear();
}
