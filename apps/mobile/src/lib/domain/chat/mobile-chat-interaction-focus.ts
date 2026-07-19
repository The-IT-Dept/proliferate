import type { TranscriptRowViewModel } from "./mobile-live-transcript-view";

/**
 * Push subsystem Task 6 — "which card to focus" derivation. Consumes the
 * `requestId` carried by `MobileCloudChat.initialInteractionRequestId`
 * (set from the `?interaction={requestId}` deep-link/push route param —
 * see `mobile-deep-link.ts`, `mobile-workspace-route.ts`) against the live
 * `liveTranscriptRows` (`mobile-live-transcript-view.ts`,
 * `buildLiveTranscriptRows`) to find the one row to scroll the transcript
 * `FlatList` to.
 *
 * Only the three synthetic interaction-card rows
 * (`permission_interaction`/`user_input_interaction`/
 * `mcp_elicitation_interaction`) carry a `requestId` field at all — every
 * other row kind is structurally ineligible to match, so this can't be
 * fooled by an ordinary transcript item whose `id` happens to collide with
 * a request id (`id` and `requestId` are different fields/namespaces; see
 * `pendingInteractionRow`'s `pending-interaction:{requestId}` id format).
 *
 * Returns `null` — not an error, not a throw — when `requestId` is absent
 * or when no row matches yet: the target interaction may still be
 * streaming in (its `TurnEnded`/interaction-requested event hasn't landed
 * in the transcript reducer yet), and the caller re-derives this on every
 * `rows` update until it resolves or the screen unmounts.
 */
export function focusedInteractionRowIndex(
  rows: readonly TranscriptRowViewModel[],
  requestId: string | null | undefined,
): number | null {
  if (!requestId) {
    return null;
  }
  const index = rows.findIndex((row) => "requestId" in row && row.requestId === requestId);
  return index >= 0 ? index : null;
}
