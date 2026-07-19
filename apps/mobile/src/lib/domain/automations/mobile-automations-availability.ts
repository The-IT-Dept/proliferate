import { ProliferateClientError } from "@proliferate/cloud-sdk";

/**
 * The mobile Automations tab's load state, derived from a
 * `useAutomations()` query. Distinguishes a genuinely-unavailable server
 * (deployed build has no `/v1/automations` route — 404) from any other
 * failure, so the screen never gets stuck on "Loading automations" and
 * never blames the user's connection for a server-side feature gap. See
 * `server/proliferate/main.py` (AUTOMATIONS PARKED) for why 404 is the
 * expected shape of "not available yet" on this fork's deployed server.
 */
export type MobileAutomationsLoadState =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "error" }
  | { kind: "empty" }
  | { kind: "ready" };

/**
 * True when `error` is the cloud client's 404 — the server has no
 * `/v1/automations` route mounted (as opposed to an auth failure, a
 * transient network error, or any other 4xx/5xx).
 */
export function isAutomationsUnavailableError(error: unknown): boolean {
  return error instanceof ProliferateClientError && error.status === 404;
}

export function deriveMobileAutomationsLoadState(input: {
  isLoading: boolean;
  error: unknown;
  itemCount: number;
}): MobileAutomationsLoadState {
  if (input.isLoading) {
    return { kind: "loading" };
  }
  if (input.error) {
    return isAutomationsUnavailableError(input.error)
      ? { kind: "unavailable" }
      : { kind: "error" };
  }
  if (input.itemCount === 0) {
    return { kind: "empty" };
  }
  return { kind: "ready" };
}
