import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMobileStorageItemMock, setMobileStorageItemMock } = vi.hoisted(() => ({
  getMobileStorageItemMock: vi.fn(),
  setMobileStorageItemMock: vi.fn(),
}));

vi.mock("../../../lib/access/mobile-storage", () => ({
  getMobileStorageItem: getMobileStorageItemMock,
  setMobileStorageItem: setMobileStorageItemMock,
}));

import {
  __resetMobileOnboardingStatusStoreForTests,
  completeOnboardingStatus,
  ensureOnboardingStatusLoaded,
  getOnboardingStatusSnapshot,
  subscribeOnboardingStatus,
  type MobileOnboardingStatus,
} from "./mobile-onboarding-status-store";

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("mobile onboarding status store", () => {
  beforeEach(() => {
    __resetMobileOnboardingStatusStoreForTests();
    getMobileStorageItemMock.mockReset();
    setMobileStorageItemMock.mockReset();
    setMobileStorageItemMock.mockResolvedValue(undefined);
  });

  it("starts as checking", () => {
    expect(getOnboardingStatusSnapshot()).toBe("checking");
  });

  it("loads needed when no flag is stored", async () => {
    getMobileStorageItemMock.mockResolvedValue(null);
    ensureOnboardingStatusLoaded("active");
    await flushMicrotasks();
    expect(getOnboardingStatusSnapshot()).toBe("needed");
  });

  it("loads done when the flag is already stored", async () => {
    getMobileStorageItemMock.mockResolvedValue("true");
    ensureOnboardingStatusLoaded("active");
    await flushMicrotasks();
    expect(getOnboardingStatusSnapshot()).toBe("done");
  });

  it("resets to checking for a non-active auth state, clearing the load guard", async () => {
    getMobileStorageItemMock.mockResolvedValue("true");
    ensureOnboardingStatusLoaded("active");
    await flushMicrotasks();
    expect(getOnboardingStatusSnapshot()).toBe("done");

    ensureOnboardingStatusLoaded("signed_out");
    expect(getOnboardingStatusSnapshot()).toBe("checking");

    ensureOnboardingStatusLoaded("active");
    await flushMicrotasks();
    expect(getMobileStorageItemMock).toHaveBeenCalledTimes(2);
  });

  it("reads storage at most once per active session, even with two concurrently mounting consumers", async () => {
    getMobileStorageItemMock.mockResolvedValue("true");
    // The gate (app/_layout.tsx) and the onboarding route (app/onboarding.tsx)
    // both call the hook - each triggers this effect on mount.
    ensureOnboardingStatusLoaded("active");
    ensureOnboardingStatusLoaded("active");
    await flushMicrotasks();
    expect(getMobileStorageItemMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to needed when the storage read rejects", async () => {
    getMobileStorageItemMock.mockRejectedValue(new Error("boom"));
    ensureOnboardingStatusLoaded("active");
    await flushMicrotasks();
    expect(getOnboardingStatusSnapshot()).toBe("needed");
  });

  it("still marks done (best-effort) even if the storage write rejects", async () => {
    setMobileStorageItemMock.mockRejectedValue(new Error("disk full"));
    await completeOnboardingStatus();
    expect(getOnboardingStatusSnapshot()).toBe("done");
  });

  it("notifies every subscribed consumer that onboarding is done, in the same session (the gate would advance)", async () => {
    // Start where the real bug started: the gate mounted while signed in,
    // read the flag, and is holding on the "onboarding" stage.
    getMobileStorageItemMock.mockResolvedValue(null);
    ensureOnboardingStatusLoaded("active");
    await flushMicrotasks();
    expect(getOnboardingStatusSnapshot()).toBe("needed");

    // Two independent consumers subscribe, exactly as two separate
    // `useSyncExternalStore` mounts would - one standing in for the root
    // gate, one for the onboarding route that owns the Done button.
    const gateSnapshots: MobileOnboardingStatus[] = [];
    const unsubscribeGate = subscribeOnboardingStatus(() => {
      gateSnapshots.push(getOnboardingStatusSnapshot());
    });
    const onboardingRouteSnapshots: MobileOnboardingStatus[] = [];
    const unsubscribeOnboardingRoute = subscribeOnboardingStatus(() => {
      onboardingRouteSnapshots.push(getOnboardingStatusSnapshot());
    });

    // The onboarding route's Done button calls this on its own hook
    // instance. Before this store existed, that write never reached the
    // gate's separate `useState` copy, so the gate stayed on "onboarding"
    // forever (the frozen-app bug).
    await completeOnboardingStatus();

    expect(getOnboardingStatusSnapshot()).toBe("done");
    expect(gateSnapshots).toEqual(["done"]);
    expect(onboardingRouteSnapshots).toEqual(["done"]);

    unsubscribeGate();
    unsubscribeOnboardingRoute();
  });

  it("does not notify subscribers when a write settles to the same status", async () => {
    getMobileStorageItemMock.mockResolvedValue("true");
    ensureOnboardingStatusLoaded("active");
    await flushMicrotasks();
    expect(getOnboardingStatusSnapshot()).toBe("done");

    const notifications: MobileOnboardingStatus[] = [];
    const unsubscribe = subscribeOnboardingStatus(() => {
      notifications.push(getOnboardingStatusSnapshot());
    });

    await completeOnboardingStatus();

    expect(notifications).toEqual([]);
    unsubscribe();
  });
});
