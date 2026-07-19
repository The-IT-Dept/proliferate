import type { TerminalRecord } from "@anyharness/sdk";

import { isTerminalLive } from "./terminal-status";

/**
 * F-build — the roster's pure derivation logic: display titles, sort order,
 * and single-active-terminal selection. `MobileWorkspaceTerminalSegment`
 * only ever mounts one `MobileTerminalView`/WebView at a time (the spike's
 * constraint, kept for F-build), so `selectActiveTerminal` is also what
 * decides *which* `TerminalRecord` that WebView attaches to — both on first
 * load and every time `useTerminalsQuery` refetches (create/close/rename all
 * invalidate it) — without letting a refetch silently steal focus away from
 * a terminal the user is actively looking at.
 */

/** Mirrors web's `TerminalTopBar.terminalDisplayTitle` exactly: the create
 * flow never sets an explicit title, so every fresh terminal record's
 * `title` is the literal string `"Terminal"` until renamed — that specific
 * value (not "falsy title") is what triggers the positional fallback. */
export function terminalDisplayTitle(
  terminal: Pick<TerminalRecord, "title">,
  index: number,
): string {
  const fallbackTitle = `Terminal ${index + 1}`;
  return terminal.title === "Terminal" ? fallbackTitle : terminal.title;
}

/** Live (starting/running) terminals sort before exited/failed ones; stable
 * within each group (creation order, same order `TerminalsClient.list`
 * returns) so the roster doesn't reshuffle rows as sibling terminals change
 * status around a given one. */
export function sortTerminalsForRoster(terminals: readonly TerminalRecord[]): TerminalRecord[] {
  const live: TerminalRecord[] = [];
  const dead: TerminalRecord[] = [];
  for (const terminal of terminals) {
    (isTerminalLive(terminal.status) ? live : dead).push(terminal);
  }
  return [...live, ...dead];
}

/**
 * Resolves the single terminal that should be attached: keeps
 * `activeTerminalId` if it still exists in `terminals` (an explicit user
 * selection survives a roster refetch), otherwise falls back to the best
 * candidate from `sortTerminalsForRoster` (prefers a live terminal, then the
 * first exited/failed one, matching the spike's original inline
 * preference). Returns `null` for an empty roster.
 */
export function selectActiveTerminal(
  terminals: readonly TerminalRecord[],
  activeTerminalId: string | null,
): TerminalRecord | null {
  if (activeTerminalId !== null) {
    const active = terminals.find((terminal) => terminal.id === activeTerminalId);
    if (active) {
      return active;
    }
  }
  return sortTerminalsForRoster(terminals)[0] ?? null;
}
