import { useMemo } from "react";
import { useAutomationDetail } from "@proliferate/cloud-sdk-react";
import {
  buildAutomationInventoryItems,
  type AutomationInventoryItemView,
} from "@proliferate/product-domain/automations/inventory";

import { resolveMobileAutomationDetailState } from "../../../lib/domain/automations/mobile-automation-detail-resolve";
import { useMobileAutomationInventory } from "./use-mobile-automation-inventory";
import { useMobileAutomationRuns } from "./use-mobile-automation-runs";

/**
 * One automation's detail view (`/automations/[id]`): the automation itself
 * (from the list cache, falling back to a direct fetch — see
 * mobile-automation-detail-resolve.ts) plus its run history. Both queries
 * are the same shared `@proliferate/cloud-sdk-react` hooks the Automations
 * list and web's AutomationsScreen use.
 */
export function useMobileAutomationDetail(automationId: string | null) {
  const inventory = useMobileAutomationInventory();
  const automationFromList = automationId
    ? inventory.automations.find((candidate) => candidate.id === automationId) ?? null
    : null;
  const detailEnabled = automationId !== null && automationFromList === null;
  const detailQuery = useAutomationDetail(automationId, detailEnabled);

  const state = resolveMobileAutomationDetailState({
    automationId,
    automationFromList,
    listLoadState: inventory.loadState.kind,
    detailEnabled,
    detailLoading: detailQuery.isLoading,
    detailError: detailQuery.isError,
    detailData: detailQuery.data ?? null,
  });

  const item = useMemo<AutomationInventoryItemView | null>(
    () => (state.automation
      ? buildAutomationInventoryItems([state.automation], { clientSurface: "web" })[0] ?? null
      : null),
    [state.automation],
  );

  const runs = useMobileAutomationRuns(automationId, automationId !== null);

  return {
    automation: state.automation,
    item,
    loadingAutomation: state.loading,
    notFound: state.notFound,
    runs: runs.items,
    loadingRuns: runs.isLoading,
  };
}
