import { describe, expect, it } from "vitest";

import {
  deriveIsOnline,
  initialMobileConnectivityState,
  isOfflineBannerVisible,
  nextMobileConnectivityState,
  OFFLINE_BANNER_MESSAGE,
} from "./mobile-connectivity";

describe("deriveIsOnline", () => {
  it("defaults to online when no sample has arrived yet (mirrors web's initialOnline() optimistic default)", () => {
    expect(deriveIsOnline(null)).toBe(true);
    expect(deriveIsOnline(undefined)).toBe(true);
  });

  it("is online when connected and internet is reachable", () => {
    expect(deriveIsOnline({ isConnected: true, isInternetReachable: true })).toBe(true);
  });

  it("is online when connected and reachability is unknown (iOS always mirrors isConnected)", () => {
    expect(deriveIsOnline({ isConnected: true, isInternetReachable: undefined })).toBe(true);
  });

  it("is offline when there is no active network connection", () => {
    expect(deriveIsOnline({ isConnected: false, isInternetReachable: true })).toBe(false);
    expect(deriveIsOnline({ isConnected: false })).toBe(false);
  });

  it("is offline when connected but the network has no validated internet access (Android)", () => {
    expect(deriveIsOnline({ isConnected: true, isInternetReachable: false })).toBe(false);
  });

  it("is offline when reachability alone reports false, regardless of isConnected", () => {
    expect(deriveIsOnline({ isConnected: undefined, isInternetReachable: false })).toBe(false);
  });
});

describe("nextMobileConnectivityState", () => {
  it("returns the same reference when the derived isOnline value is unchanged", () => {
    const current = { isOnline: true };
    const next = nextMobileConnectivityState(current, { isConnected: true, isInternetReachable: true });
    expect(next).toBe(current);
  });

  it("returns a new state object when the derived isOnline value changes", () => {
    const current = { isOnline: true };
    const next = nextMobileConnectivityState(current, { isConnected: false });
    expect(next).not.toBe(current);
    expect(next).toEqual({ isOnline: false });
  });

  it("flips back to online on a later sample once connectivity returns", () => {
    const offline = nextMobileConnectivityState({ isOnline: true }, { isConnected: false });
    const online = nextMobileConnectivityState(offline, { isConnected: true, isInternetReachable: true });
    expect(online).toEqual({ isOnline: true });
  });
});

describe("initialMobileConnectivityState", () => {
  it("starts optimistically online, matching web's initialOnline() fallback", () => {
    expect(initialMobileConnectivityState()).toEqual({ isOnline: true });
  });
});

describe("isOfflineBannerVisible", () => {
  it("is hidden while online", () => {
    expect(isOfflineBannerVisible({ isOnline: true })).toBe(false);
  });

  it("is visible while offline", () => {
    expect(isOfflineBannerVisible({ isOnline: false })).toBe(true);
  });
});

describe("OFFLINE_BANNER_MESSAGE", () => {
  it("is verbatim web's OfflineIndicator copy (product-client components/app/OfflineIndicator.tsx)", () => {
    expect(OFFLINE_BANNER_MESSAGE).toBe(
      "No internet connection — local work is safe; agents need a connection.",
    );
  });
});
