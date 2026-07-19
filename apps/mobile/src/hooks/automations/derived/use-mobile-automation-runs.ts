import { useMemo } from "react";
import type { AutomationRunResponse } from "@proliferate/cloud-sdk";
import { useAutomationRuns } from "@proliferate/cloud-sdk-react";
import {
  buildAutomationRunInventoryItems,
  type AutomationRunInventoryItemView,
} from "@proliferate/product-domain/automations/inventory";

const EMPTY_RUNS: AutomationRunResponse[] = [];

/**
 * Pure selector: raw `AutomationRunResponse[]` in, run-history row views
 * out. Reuses product-domain's `buildAutomationRunInventoryItems`
 * verbatim — same status/trigger/timestamp copy as
 * `AUTOMATION_RUN_COPY` / web's `AutomationRunsList`. `clientSurface: "web"`
 * (mobile has no local workspace to open, same as web) — mobile doesn't
 * consume `openState`/`openLabel` (opening a run's session is out of scope
 * for this build; view + trigger only), but passing "web" keeps the
 * `desktopRequired` classification correct in case a later group wires the
 * open-session action.
 */
export function buildMobileAutomationRunInventory(
  runs: readonly AutomationRunResponse[],
): readonly AutomationRunInventoryItemView[] {
  return buildAutomationRunInventoryItems(runs, { clientSurface: "web" });
}

export function useMobileAutomationRuns(automationId: string | null, enabled = true) {
  const query = useAutomationRuns(automationId, enabled);
  const data = query.data?.runs ?? EMPTY_RUNS;

  const items = useMemo(() => buildMobileAutomationRunInventory(data), [data]);

  return {
    items,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
