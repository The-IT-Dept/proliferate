import type { AutomationResponse } from "@proliferate/cloud-sdk";

import type { MobileAutomationsLoadState } from "./mobile-automations-availability";

export interface MobileAutomationDetailState {
  automation: AutomationResponse | null;
  loading: boolean;
  notFound: boolean;
  /**
   * True when the *list itself* is unavailable on this server build (a 404
   * on `/v1/automations` — see `mobile-automations-availability.ts`), not
   * when this particular automation is missing. A deep link into
   * `/automations/[id]` on a server with automations parked should read as
   * "not available on this server yet", not "Automation not found" — those
   * are different failures with different copy.
   */
  unavailable: boolean;
}

/**
 * Resolves the automation shown on the detail screen (`/automations/[id]`),
 * mirroring web's `AutomationsScreen` selection: prefer the copy already
 * loaded by the list query (`automationFromList`) — the common case, since
 * the detail screen is reached by tapping a list row — and only fall back to
 * a direct `useAutomationDetail` fetch (`detailEnabled`/`detailLoading`/
 * `detailError`/`detailData`) when the id isn't in the list (e.g. a deep
 * link into an automation whose list page hasn't loaded yet). `notFound` is
 * true only once that direct fetch has itself settled with an error —
 * never while the list is still the only thing loading, so a
 * currently-loading list can't flash "not found" before it's had a chance
 * to contain the automation. `listLoadState === "unavailable"` short-circuits
 * ahead of the loading/notFound checks: on a server build with automations
 * parked, the whole feature is the thing that's missing, not this one id, so
 * there's no point waiting on (or reporting notFound for) a direct fetch
 * that would 404 the same way the list did.
 */
export function resolveMobileAutomationDetailState(input: {
  automationId: string | null;
  automationFromList: AutomationResponse | null;
  listLoadState: MobileAutomationsLoadState["kind"];
  detailEnabled: boolean;
  detailLoading: boolean;
  detailError: boolean;
  detailData: AutomationResponse | null;
}): MobileAutomationDetailState {
  if (input.automationId === null) {
    return { automation: null, loading: false, notFound: false, unavailable: false };
  }
  if (input.automationFromList) {
    return { automation: input.automationFromList, loading: false, notFound: false, unavailable: false };
  }
  if (input.listLoadState === "unavailable") {
    return { automation: null, loading: false, notFound: false, unavailable: true };
  }
  if (input.listLoadState === "loading") {
    return { automation: null, loading: true, notFound: false, unavailable: false };
  }
  if (input.detailEnabled && input.detailLoading) {
    return { automation: null, loading: true, notFound: false, unavailable: false };
  }
  if (input.detailData) {
    return { automation: input.detailData, loading: false, notFound: false, unavailable: false };
  }
  return {
    automation: null,
    loading: false,
    notFound: input.detailEnabled && input.detailError,
    unavailable: false,
  };
}
