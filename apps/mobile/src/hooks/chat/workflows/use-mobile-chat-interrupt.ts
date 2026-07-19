import { useCallback } from "react";
import { useCancelSessionMutation } from "@anyharness/sdk-react";

import { useMobileToast } from "../../../providers/MobileToastProvider";

/**
 * Group E2 — interrupt/cancel the running turn ("Stop run", verbatim from
 * `CHAT_COMPOSER_LABELS.stop` in the web's chat-copy.ts). Thin wrapper
 * around the real shared mutation, `useCancelSessionMutation`
 * (`@anyharness/sdk-react`) — the plan's shorthand name matched the actual
 * export, no local reimplementation needed. `client.sessions.cancel`
 * accepts a bare sessionId string, which the mutation's `mutationFn`
 * forwards straight through.
 *
 * Failure surfaces via `useMobileToast()` (never a silent swallow) and
 * does not touch any optimistic/queue state itself — the session stays
 * exactly as it was, so there's nothing to desync.
 */
export function useMobileChatInterrupt() {
  const cancelSessionMutation = useCancelSessionMutation();
  const toast = useMobileToast();

  const cancelActiveSession = useCallback(
    async (sessionId: string) => {
      try {
        await cancelSessionMutation.mutateAsync(sessionId);
      } catch (error) {
        toast.show({
          tone: "error",
          message: error instanceof Error ? error.message : "Could not stop the run.",
        });
      }
    },
    [cancelSessionMutation, toast],
  );

  return {
    cancelActiveSession,
    cancelling: cancelSessionMutation.isPending,
  };
}
