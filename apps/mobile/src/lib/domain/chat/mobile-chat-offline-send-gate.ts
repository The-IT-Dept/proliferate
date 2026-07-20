/**
 * Row 40 (parity map) — offline send-gating for the chat composer's primary
 * "Send" action (`MobileChatScreen.handleComposerPrimaryAction`, Group E2's
 * composer/prompt path — see `use-mobile-chat-prompt-actions.ts`).
 *
 * Verified web behavior first (product-client): web's composer/prompt send
 * path (`useSessionIntentActions.sendPrompt`) does NOT check
 * `isConnectivityOnline()` before attempting a send, and there is no
 * "queued, will send when online" copy anywhere in product-client. Web
 * instead sends optimistically; if the runtime detects the connection was
 * lost it surfaces a `network_connection` transcript error item ("Connection
 * interrupted" / "The connection to the model was lost. Your work is saved —
 * retry to continue.", `session-error-presentation.ts`) with a Retry button
 * disabled while offline. The one place web *does* gate on connectivity
 * up front is a different feature — parking the session-stream reconnect
 * runner while offline and firing it on the offline -> online edge
 * (`registerOfflineSessionReconnect` / `flushOfflineSessionReconnects`,
 * `session-reconnect-state.ts`).
 *
 * Since web has no verbatim "queued, will send when online" copy to mirror
 * for prompt sends, this applies web's *actual* offline-park-and-flush
 * pattern (the one above) to the composer's send action instead of letting
 * a definitely-offline send attempt hit the network and fail: `expo-network`
 * gives mobile a synchronous, reasonably reliable "are we online" signal
 * (unlike the browser's best-effort `navigator.onLine`), so it's worth
 * avoiding the doomed network call. `OFFLINE_QUEUED_PROMPT_MESSAGE` is
 * therefore original copy (not sourced from web — there's nothing to
 * source), written in the Row 40 spec's own words ("queued, will send when
 * online") and this app's existing footer-note tone (see
 * `MobileChatScreen`'s `footerCommandMessage`, which already renders
 * `pendingPromptStatus` the same way).
 */

export const OFFLINE_QUEUED_PROMPT_MESSAGE = "Queued — will send once you're back online.";

export type MobileOfflineSendDecision =
  | { type: "send" }
  | { type: "queue"; message: string };

export function deriveOfflineSendDecision(isOnline: boolean): MobileOfflineSendDecision {
  if (isOnline) {
    return { type: "send" };
  }
  return { type: "queue", message: OFFLINE_QUEUED_PROMPT_MESSAGE };
}

/**
 * Mirrors the offline -> online edge check web's
 * `flushOfflineSessionReconnects` trigger implicitly relies on
 * (`use-connectivity-listeners.ts`'s `handleOnline`): only fire on the
 * transition, and only if there is actually something parked to flush.
 */
export function shouldFlushQueuedOfflinePrompt(input: {
  wasOnline: boolean;
  isOnline: boolean;
  hasQueuedPrompt: boolean;
}): boolean {
  return !input.wasOnline && input.isOnline && input.hasQueuedPrompt;
}
