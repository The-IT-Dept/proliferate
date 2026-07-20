import { useCallback, useEffect, useRef, useState } from "react";

import {
  deriveOfflineSendDecision,
  OFFLINE_QUEUED_PROMPT_MESSAGE,
  shouldFlushQueuedOfflinePrompt,
} from "../../../lib/domain/chat/mobile-chat-offline-send-gate";

export interface MobileOfflinePromptGate {
  /** Non-null while a send is parked waiting for connectivity to return —
   * render this in the composer's existing inline status slot
   * (`MobileChatScreen`'s `footerCommandMessage`, fed by `pendingPromptStatus`
   * today). */
  queuedOfflineMessage: string | null;
  /** Drop-in replacement for calling `submitPrompt()` directly from the
   * composer's primary action — reuses E2's composer/prompt path unchanged,
   * this only decides whether to call it now or park it. */
  guardedSubmitPrompt: () => Promise<void>;
}

/**
 * Row 40 (parity map) — wraps E2's existing `submitPrompt` (from
 * `useMobileChatPromptActions` via `useMobileChatActions`) with the offline
 * send-gating decision from `mobile-chat-offline-send-gate.ts`: while
 * offline, park the send instead of letting it hit the network and fail;
 * once connectivity returns, fire the parked send automatically (the
 * offline -> online edge, same shape as web's
 * `flushOfflineSessionReconnects`).
 *
 * Deliberately thin — all the actual decision logic (`deriveOfflineSendDecision`,
 * `shouldFlushQueuedOfflinePrompt`) is pure and unit tested in that module;
 * this hook is just React state wiring around it (a queued flag + an effect
 * watching the online transition), so it isn't separately unit tested here,
 * matching how sibling hooks in this directory (e.g.
 * `use-mobile-chat-prompt-actions.ts`) keep orchestration untested and push
 * the testable logic into `lib/domain`.
 *
 * Does NOT snapshot the draft text: `submitPrompt` itself reads whatever is
 * currently in the composer's draft state at call time (see
 * `useMobileChatPromptActions.submitPrompt`), so parking the call and
 * re-invoking it later naturally resends whatever text is in the composer
 * at the moment connectivity returns — including edits made while still
 * offline. Nothing is cleared while queued, so the user's draft stays
 * visible (and editable) in the composer the whole time it's parked.
 */
export function useMobileOfflinePromptGate({
  isOnline,
  submitPrompt,
}: {
  isOnline: boolean;
  submitPrompt: () => Promise<void>;
}): MobileOfflinePromptGate {
  const [isQueued, setIsQueued] = useState(false);
  const wasOnlineRef = useRef(isOnline);

  useEffect(() => {
    const wasOnline = wasOnlineRef.current;
    wasOnlineRef.current = isOnline;
    if (shouldFlushQueuedOfflinePrompt({ wasOnline, isOnline, hasQueuedPrompt: isQueued })) {
      setIsQueued(false);
      void submitPrompt();
    }
  }, [isOnline, isQueued, submitPrompt]);

  const guardedSubmitPrompt = useCallback(async () => {
    const decision = deriveOfflineSendDecision(isOnline);
    if (decision.type === "send") {
      await submitPrompt();
      return;
    }
    setIsQueued(true);
  }, [isOnline, submitPrompt]);

  return {
    queuedOfflineMessage: isQueued ? OFFLINE_QUEUED_PROMPT_MESSAGE : null,
    guardedSubmitPrompt,
  };
}
