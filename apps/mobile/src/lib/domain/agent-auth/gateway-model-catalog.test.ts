import { describe, expect, it } from "vitest";
import type { GatewayModelEntry, GatewayModelsResponse } from "@anyharness/sdk";

import {
  GATEWAY_MODEL_CATALOG_COPY,
  deriveGatewayModelCatalogView,
  toGatewayModelRow,
} from "./gateway-model-catalog";

/**
 * Group H — the model catalog section, mirroring what web's
 * `HarnessAllModelsSection` shows for a runtime-resolved gateway route
 * (contract §5: `useAgentGatewayModelsQuery`'s `GatewayModelsResponse`,
 * `client.agentGatewayCatalog.getGatewayModels`), simplified to that one
 * route — mobile is cloud-only so there is no local/catalog-override/
 * provider-policy branching (`useAgentCatalog`/`useAuthSelections`/
 * `useUpsertCatalogOverride`, `@proliferate/cloud-sdk-react`) to port; verbatim
 * copy (loading/probing/empty/freshness) is lifted from
 * `HARNESS_PANE_COPY` (`copy/settings/harness-pane.ts`).
 */

const MODEL_KNOWN: GatewayModelEntry = {
  id: "claude-sonnet-4-5",
  displayName: "Claude Sonnet 4.5",
  description: "Balanced speed and intelligence.",
  provider: "anthropic",
  status: "active",
  effort: { values: ["low", "medium", "high"], default: "medium" },
  fastMode: true,
  modes: ["default", "plan"],
};

const MODEL_PROBE_ONLY: GatewayModelEntry = {
  id: "some-new-model",
  provider: "anthropic",
};

describe("toGatewayModelRow", () => {
  it("maps a catalog-known entry verbatim", () => {
    expect(toGatewayModelRow(MODEL_KNOWN)).toEqual({
      id: "claude-sonnet-4-5",
      displayName: "Claude Sonnet 4.5",
      description: "Balanced speed and intelligence.",
      provider: "anthropic",
      status: "active",
      effortValues: ["low", "medium", "high"],
      fastMode: true,
    });
  });

  it("a probe-only entry falls back to the id as its displayName and empty/false for the rest", () => {
    expect(toGatewayModelRow(MODEL_PROBE_ONLY)).toEqual({
      id: "some-new-model",
      displayName: "some-new-model",
      description: null,
      provider: "anthropic",
      status: null,
      effortValues: [],
      fastMode: false,
    });
  });
});

describe("deriveGatewayModelCatalogView", () => {
  it("isLoading (first fetch, no data yet) -> loading phase, no rows", () => {
    const view = deriveGatewayModelCatalogView({ response: undefined, isLoading: true, isFetching: true });
    expect(view.phase).toBe("loading");
    expect(view.rows).toEqual([]);
  });

  it("resolved with models -> ready phase, mapped rows", () => {
    const response: GatewayModelsResponse = { models: [MODEL_KNOWN], source: "seed" };
    const view = deriveGatewayModelCatalogView({ response, isLoading: false, isFetching: false });
    expect(view.phase).toBe("ready");
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]?.id).toBe("claude-sonnet-4-5");
  });

  it("empty resolved catalog while a probe is in flight -> probing phase (auto-probe UX)", () => {
    const response: GatewayModelsResponse = { models: [], source: "seed" };
    const view = deriveGatewayModelCatalogView({ response, isLoading: false, isFetching: true });
    expect(view.phase).toBe("probing");
  });

  it("empty resolved catalog with nothing in flight -> empty phase", () => {
    const response: GatewayModelsResponse = { models: [], source: "seed" };
    const view = deriveGatewayModelCatalogView({ response, isLoading: false, isFetching: false });
    expect(view.phase).toBe("empty");
  });

  it("carries the freshness source/probedAt through unformatted (no date localization in pure logic)", () => {
    const response: GatewayModelsResponse = {
      models: [MODEL_KNOWN],
      source: "probe",
      probedAt: "2026-01-01T00:00:00.000Z",
    };
    const view = deriveGatewayModelCatalogView({ response, isLoading: false, isFetching: false });
    expect(view.freshnessSource).toBe("probe");
    expect(view.freshnessProbedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("a seed source has no probedAt", () => {
    const response: GatewayModelsResponse = { models: [MODEL_KNOWN], source: "seed" };
    const view = deriveGatewayModelCatalogView({ response, isLoading: false, isFetching: false });
    expect(view.freshnessSource).toBe("seed");
    expect(view.freshnessProbedAt).toBeNull();
  });

  it("no response yet -> null freshness, not a crash", () => {
    const view = deriveGatewayModelCatalogView({ response: undefined, isLoading: false, isFetching: false });
    expect(view.freshnessSource).toBeNull();
    expect(view.freshnessProbedAt).toBeNull();
  });
});

describe("GATEWAY_MODEL_CATALOG_COPY", () => {
  it("matches HARNESS_PANE_COPY's verbatim strings", () => {
    expect(GATEWAY_MODEL_CATALOG_COPY.refresh).toBe("Refresh");
    expect(GATEWAY_MODEL_CATALOG_COPY.refreshing).toBe("Refreshing...");
    expect(GATEWAY_MODEL_CATALOG_COPY.loading).toBe("Loading model catalog...");
    expect(GATEWAY_MODEL_CATALOG_COPY.probing).toBe("Probing…");
    expect(GATEWAY_MODEL_CATALOG_COPY.empty).toBe("No models in the catalog for this surface yet.");
    expect(GATEWAY_MODEL_CATALOG_COPY.freshnessSeed).toBe("seed");
    expect(GATEWAY_MODEL_CATALOG_COPY.freshnessProbed("3:04 PM")).toBe("probed 3:04 PM");
  });
});
