import { useMemo } from "react";
import type { AutomationResponse } from "@proliferate/cloud-sdk";
import { useAutomations } from "@proliferate/cloud-sdk-react";
import {
  buildAutomationInventoryItems,
  groupAutomationInventoryItems,
  type AutomationInventoryGroupView,
  type AutomationInventoryItemView,
} from "@proliferate/product-domain/automations/inventory";

import {
  deriveMobileAutomationsLoadState,
  type MobileAutomationsLoadState,
} from "../../../lib/domain/automations/mobile-automations-availability";

const EMPTY_AUTOMATIONS: AutomationResponse[] = [];

export interface MobileAutomationInventory {
  groups: readonly AutomationInventoryGroupView[];
  items: readonly AutomationInventoryItemView[];
  automations: readonly AutomationResponse[];
  loadState: MobileAutomationsLoadState;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
}

/**
 * Pure selector: raw `AutomationResponse[]` in, grouped mobile inventory
 * out. Reuses product-domain's `buildAutomationInventoryItems` /
 * `groupAutomationInventoryItems` verbatim — the SAME derivation web's
 * AutomationsScreen calls — so status ("Enabled"/"Paused"), schedule, scope
 * ("Personal"/"Team"), and run-now-disabled-reason copy never drifts from
 * web. `clientSurface: "web"` (not "desktop") is deliberate: mobile, like
 * web, has no local/SSH runtime attachment, so local/SSH-targeted
 * automations correctly show as desktop-required rather than directly
 * runnable. Extracted from the hook's useMemo so it's unit-testable without
 * rendering (no RN/DOM test harness here) — see
 * use-mobile-automation-inventory.test.ts.
 */
export function buildMobileAutomationInventory(
  automations: readonly AutomationResponse[],
  now: Date | number = new Date(),
): { groups: readonly AutomationInventoryGroupView[]; items: readonly AutomationInventoryItemView[] } {
  const items = buildAutomationInventoryItems(automations, { now, clientSurface: "web" });
  const groups = groupAutomationInventoryItems(items);
  return { groups, items };
}

/** ownerScope is pinned to "personal" — see MobileAutomationsScreen. */
export function useMobileAutomationInventory(): MobileAutomationInventory {
  const automations = useAutomations({ ownerScope: "personal" });
  const data = automations.data?.automations ?? EMPTY_AUTOMATIONS;

  const { groups, items } = useMemo(() => buildMobileAutomationInventory(data), [data]);

  const loadState = deriveMobileAutomationsLoadState({
    isLoading: automations.isLoading,
    error: automations.error,
    itemCount: items.length,
  });

  return {
    groups,
    items,
    automations: data,
    loadState,
    isFetching: automations.isFetching,
    refetch: async () => {
      await automations.refetch();
    },
  };
}
