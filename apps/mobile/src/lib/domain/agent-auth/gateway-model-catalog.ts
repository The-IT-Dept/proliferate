import type { GatewayModelEntry, GatewayModelsResponse } from "@anyharness/sdk";

/**
 * Group H — model catalog view, mirroring web's `HarnessAllModelsSection`
 * (`components/settings/panes/agents/harness/HarnessAllModelsSection.tsx`)
 * for the one route that applies to cloud-only mobile: the runtime-resolved
 * gateway plan (contract §5, `client.agentGatewayCatalog.getGatewayModels` /
 * `useAgentGatewayModelsQuery`). Web's local/native/api_key catalog routes
 * (`useAgentCatalog`, `@proliferate/cloud-sdk-react`, with catalog overrides and
 * org policy gating) aren't in scope here — see this group's final report for
 * why. Copy is verbatim from `HARNESS_PANE_COPY`
 * (`copy/settings/harness-pane.ts`); date localization for `probedAt` stays
 * out of this pure module (device-locale `Date#toLocaleString` — a
 * presentation concern, not logic) and is composed by the screen using
 * `GATEWAY_MODEL_CATALOG_COPY.freshnessProbed`.
 */

export interface GatewayModelRow {
  id: string;
  displayName: string;
  description: string | null;
  provider: string | null;
  status: GatewayModelEntry["status"] | null;
  effortValues: string[];
  fastMode: boolean;
}

export function toGatewayModelRow(model: GatewayModelEntry): GatewayModelRow {
  return {
    id: model.id,
    displayName: model.displayName ?? model.id,
    description: model.description ?? null,
    provider: model.provider ?? null,
    status: model.status ?? null,
    effortValues: model.effort?.values ?? [],
    fastMode: model.fastMode ?? false,
  };
}

export type GatewayModelCatalogPhase = "loading" | "probing" | "empty" | "ready";

export interface GatewayModelCatalogView {
  phase: GatewayModelCatalogPhase;
  rows: GatewayModelRow[];
  freshnessSource: "seed" | "probe" | null;
  freshnessProbedAt: string | null;
}

export const GATEWAY_MODEL_CATALOG_COPY = {
  refresh: "Refresh",
  refreshing: "Refreshing...",
  empty: "No models in the catalog for this surface yet.",
  loading: "Loading model catalog...",
  probing: "Probing…",
  freshnessSeed: "seed",
  freshnessProbed: (time: string) => `probed ${time}`,
} as const;

export function deriveGatewayModelCatalogView(input: {
  response: GatewayModelsResponse | undefined;
  isLoading: boolean;
  isFetching: boolean;
}): GatewayModelCatalogView {
  const rows = (input.response?.models ?? []).map(toGatewayModelRow);

  let phase: GatewayModelCatalogPhase;
  if (input.isLoading) {
    phase = "loading";
  } else if (rows.length === 0 && input.isFetching) {
    phase = "probing";
  } else if (rows.length === 0) {
    phase = "empty";
  } else {
    phase = "ready";
  }

  const freshnessSource = input.response
    ? input.response.source === "probe"
      ? "probe"
      : "seed"
    : null;
  const freshnessProbedAt =
    freshnessSource === "probe" ? input.response?.probedAt ?? null : null;

  return { phase, rows, freshnessSource, freshnessProbedAt };
}
