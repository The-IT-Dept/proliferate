import { describe, expect, it } from "vitest";

import { resolveMobileAutomationDetailState } from "./mobile-automation-detail-resolve";

describe("resolveMobileAutomationDetailState", () => {
  it("prefers the copy already in the list over a direct detail fetch", () => {
    const state = resolveMobileAutomationDetailState({
      automationId: "a",
      automationFromList: { id: "a" } as never,
      listLoadState: "ready",
      detailEnabled: false,
      detailLoading: false,
      detailError: false,
      detailData: null,
    });
    expect(state).toEqual({ automation: { id: "a" }, loading: false, notFound: false, unavailable: false });
  });

  it("is 'loading' while the list itself is still loading and the item isn't in it yet", () => {
    const state = resolveMobileAutomationDetailState({
      automationId: "a",
      automationFromList: null,
      listLoadState: "loading",
      detailEnabled: false,
      detailLoading: false,
      detailError: false,
      detailData: null,
    });
    expect(state).toEqual({ automation: null, loading: true, notFound: false, unavailable: false });
  });

  it("is 'loading' while a direct detail fetch (deep link, not in the list) is in flight", () => {
    const state = resolveMobileAutomationDetailState({
      automationId: "a",
      automationFromList: null,
      listLoadState: "ready",
      detailEnabled: true,
      detailLoading: true,
      detailError: false,
      detailData: null,
    });
    expect(state).toEqual({ automation: null, loading: true, notFound: false, unavailable: false });
  });

  it("falls back to the direct detail fetch's data when the list doesn't have it", () => {
    const state = resolveMobileAutomationDetailState({
      automationId: "a",
      automationFromList: null,
      listLoadState: "ready",
      detailEnabled: true,
      detailLoading: false,
      detailError: false,
      detailData: { id: "a" } as never,
    });
    expect(state).toEqual({ automation: { id: "a" }, loading: false, notFound: false, unavailable: false });
  });

  it("is 'notFound' only once the direct detail fetch has settled with an error", () => {
    const state = resolveMobileAutomationDetailState({
      automationId: "a",
      automationFromList: null,
      listLoadState: "ready",
      detailEnabled: true,
      detailLoading: false,
      detailError: true,
      detailData: null,
    });
    expect(state).toEqual({ automation: null, loading: false, notFound: true, unavailable: false });
  });

  it("is never 'notFound' while the detail fetch hasn't been enabled yet (e.g. list still loading)", () => {
    const state = resolveMobileAutomationDetailState({
      automationId: "a",
      automationFromList: null,
      listLoadState: "loading",
      detailEnabled: false,
      detailLoading: false,
      detailError: false,
      detailData: null,
    });
    expect(state.notFound).toBe(false);
  });

  it("resolves to nothing (not loading, not found) when there is no id to look up", () => {
    const state = resolveMobileAutomationDetailState({
      automationId: null,
      automationFromList: null,
      listLoadState: "ready",
      detailEnabled: false,
      detailLoading: false,
      detailError: false,
      detailData: null,
    });
    expect(state).toEqual({ automation: null, loading: false, notFound: false, unavailable: false });
  });

  // Group J, Part 2.5: a deep link into /automations/[id] on a server build
  // with automations parked (see mobile-automations-availability.ts) should
  // read as "not available on this server yet", not "Automation not found"
  // — the list's own "unavailable" load state (a 404 on /v1/automations, not
  // a missing automation) takes priority over attempting/awaiting a direct
  // detail fetch.
  it("is 'unavailable' (not notFound) when the automations list itself is unavailable on this server", () => {
    const state = resolveMobileAutomationDetailState({
      automationId: "a",
      automationFromList: null,
      listLoadState: "unavailable",
      detailEnabled: true,
      detailLoading: false,
      detailError: false,
      detailData: null,
    });
    expect(state).toEqual({ automation: null, loading: false, notFound: false, unavailable: true });
  });

  it("is 'unavailable' even while a stray direct detail fetch is still settling", () => {
    const state = resolveMobileAutomationDetailState({
      automationId: "a",
      automationFromList: null,
      listLoadState: "unavailable",
      detailEnabled: true,
      detailLoading: true,
      detailError: false,
      detailData: null,
    });
    expect(state).toEqual({ automation: null, loading: false, notFound: false, unavailable: true });
  });
});
