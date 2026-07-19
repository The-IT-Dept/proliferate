import type { AutomationResponse } from "@proliferate/cloud-sdk";

import type { MobileAutomationsLoadState } from "./mobile-automations-availability";

export interface MobileAutomationDetailState {
  automation: AutomationResponse | null;
  loading: boolean;
  notFound: boolean;
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
 * to contain the automation.
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
    return { automation: null, loading: false, notFound: false };
  }
  if (input.automationFromList) {
    return { automation: input.automationFromList, loading: false, notFound: false };
  }
  if (input.listLoadState === "loading") {
    return { automation: null, loading: true, notFound: false };
  }
  if (input.detailEnabled && input.detailLoading) {
    return { automation: null, loading: true, notFound: false };
  }
  if (input.detailData) {
    return { automation: input.detailData, loading: false, notFound: false };
  }
  return { automation: null, loading: false, notFound: input.detailEnabled && input.detailError };
}
