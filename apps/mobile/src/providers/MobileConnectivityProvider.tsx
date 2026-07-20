import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import * as Network from "expo-network";

import {
  initialMobileConnectivityState,
  nextMobileConnectivityState,
  type MobileConnectivityState,
} from "../lib/domain/infra/mobile-connectivity";

const MobileConnectivityContext = createContext<MobileConnectivityState | null>(null);

/**
 * Row 40 (parity map) — mobile's connectivity source. Web reads
 * `navigator.onLine` + the browser's `online`/`offline` events
 * (`use-connectivity-listeners.ts`); there is no such API on native, so this
 * uses `expo-network`'s `addNetworkStateListener` (event-based, fires on
 * every native network-state change) seeded with one `getNetworkStateAsync()`
 * read on mount, matching how web seeds `useConnectivityStore` synchronously
 * from `navigator.onLine` before any listener has fired.
 *
 * DEVICE-ONLY: this file is the native-listener glue the task calls out as
 * out of scope for unit tests — `expo-network` has no meaningful behavior in
 * vitest's node environment (no native module bridge), and this worktree has
 * no device/simulator harness wired up. All of the actual decision logic
 * (`deriveIsOnline`, `nextMobileConnectivityState`, `isOfflineBannerVisible`)
 * lives in `../lib/domain/infra/mobile-connectivity.ts` and is fully unit
 * tested there; this component only wires that pure state machine to the
 * native event source and exposes it via context. Needs a real device or
 * simulator (and, since `expo-network` is a native module, a fresh
 * dev-client build) to verify the actual online/offline transitions fire
 * correctly.
 *
 * Mount once at the app root (`app/_layout.tsx`), above anything that reads
 * `useMobileConnectivity()` (the offline banner, the composer's offline
 * send gate).
 */
export function MobileConnectivityProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MobileConnectivityState>(initialMobileConnectivityState);
  // Read inside the effect via a ref so the subscription callback always
  // reduces off the latest state without needing `state` in the effect's
  // dependency array (which would tear down and re-subscribe on every
  // change).
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let cancelled = false;

    void Network.getNetworkStateAsync()
      .then((sample) => {
        if (cancelled) {
          return;
        }
        setState((current) => nextMobileConnectivityState(current, sample));
      })
      .catch(() => {
        // Leave the optimistic initial state in place — matches web's
        // `initialOnline()` fallback (stay online when the signal is
        // unavailable rather than flash an offline banner).
      });

    const subscription = Network.addNetworkStateListener((sample) => {
      setState((current) => nextMobileConnectivityState(current, sample));
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return (
    <MobileConnectivityContext.Provider value={state}>
      {children}
    </MobileConnectivityContext.Provider>
  );
}

/** Must be called under `MobileConnectivityProvider` (mounted in `app/_layout.tsx`). */
export function useMobileConnectivity(): MobileConnectivityState {
  const value = useContext(MobileConnectivityContext);
  if (!value) {
    throw new Error("useMobileConnectivity must be used within MobileConnectivityProvider.");
  }
  return value;
}
