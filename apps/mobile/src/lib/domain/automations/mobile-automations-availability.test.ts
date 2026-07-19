import { describe, expect, it } from "vitest";
import { ProliferateClientError } from "@proliferate/cloud-sdk";

import {
  deriveMobileAutomationsLoadState,
  isAutomationsUnavailableError,
} from "./mobile-automations-availability";

describe("isAutomationsUnavailableError", () => {
  it("is true for a ProliferateClientError with status 404", () => {
    const error = new ProliferateClientError("Not Found", 404, null);
    expect(isAutomationsUnavailableError(error)).toBe(true);
  });

  it("is false for a ProliferateClientError with a different status", () => {
    const error = new ProliferateClientError("Unauthorized", 401, null);
    expect(isAutomationsUnavailableError(error)).toBe(false);
  });

  it("is false for a plain Error (network failure, etc.)", () => {
    expect(isAutomationsUnavailableError(new Error("Network request failed"))).toBe(false);
  });

  it("is false for null/undefined/non-error values", () => {
    expect(isAutomationsUnavailableError(null)).toBe(false);
    expect(isAutomationsUnavailableError(undefined)).toBe(false);
    expect(isAutomationsUnavailableError("boom")).toBe(false);
  });
});

describe("deriveMobileAutomationsLoadState", () => {
  it("is 'loading' while the query is in flight, regardless of a stale error/count", () => {
    expect(
      deriveMobileAutomationsLoadState({ isLoading: true, error: new Error("stale"), itemCount: 3 }),
    ).toEqual({ kind: "loading" });
  });

  it("is 'unavailable' when the error is a 404 (server has no /v1/automations route)", () => {
    const error = new ProliferateClientError("Not Found", 404, null);
    expect(
      deriveMobileAutomationsLoadState({ isLoading: false, error, itemCount: 0 }),
    ).toEqual({ kind: "unavailable" });
  });

  it("is 'error' for a non-404 failure", () => {
    const error = new ProliferateClientError("Unauthorized", 401, null);
    expect(
      deriveMobileAutomationsLoadState({ isLoading: false, error, itemCount: 0 }),
    ).toEqual({ kind: "error" });
  });

  it("is 'error' for a generic thrown Error (e.g. offline)", () => {
    expect(
      deriveMobileAutomationsLoadState({
        isLoading: false,
        error: new Error("Network request failed"),
        itemCount: 0,
      }),
    ).toEqual({ kind: "error" });
  });

  it("is 'empty' with no error and zero items", () => {
    expect(
      deriveMobileAutomationsLoadState({ isLoading: false, error: null, itemCount: 0 }),
    ).toEqual({ kind: "empty" });
  });

  it("is 'ready' with no error and at least one item", () => {
    expect(
      deriveMobileAutomationsLoadState({ isLoading: false, error: null, itemCount: 2 }),
    ).toEqual({ kind: "ready" });
  });
});
