import { useCallback, useState } from "react";
import type {
  InteractionDecision,
  McpElicitationSubmittedField,
  ResolveInteractionRequest,
  UserInputSubmittedAnswer,
} from "@anyharness/sdk";
import {
  useResolveSessionInteractionMutation,
  useRevealMcpElicitationUrlMutation,
} from "@anyharness/sdk-react";
import type { CloudWorkspaceDetail } from "@proliferate/cloud-sdk";

import {
  buildMcpElicitationAcceptedRequest,
  buildMcpElicitationCancelledRequest,
  buildMcpElicitationDeclinedRequest,
  buildPermissionDecisionRequest,
  buildPermissionSelectedRequest,
  buildUserInputCancelledRequest,
  buildUserInputSubmittedRequest,
} from "../../../lib/domain/chat/mobile-chat-interaction-resolve";
import { resolveMobileInteractionBlockReason } from "../../../lib/access/anyharness/cloud-sandbox-runtime";
import { useMobileToast } from "../../../providers/MobileToastProvider";

/**
 * Group E3 — resolves pending session interactions (permission / user_input
 * / mcp_elicitation) from the inline transcript cards. Thin wrapper around
 * the real shared mutations, `useResolveSessionInteractionMutation` and
 * `useRevealMcpElicitationUrlMutation` (both real `@anyharness/sdk-react`
 * exports — the plan's shorthand `useResolveSessionInteractionMutation`
 * matched; the reveal-url export's real name matched too) — never a
 * hand-rolled `client.sessions.resolveInteraction(...)` call (that pattern
 * existed pre-E3 in `use-mobile-chat-actions.ts`'s `resolvePermissionInteraction`
 * and is retired as part of the I2 collapse).
 *
 * No optimistic removal: a card stays on screen after a resolve call until
 * the live stream (`stream.transcript.pendingInteractions`) reflects the
 * resolution and `buildLiveTranscriptRows` stops emitting its row — exactly
 * the plan's "no desync" requirement. Failure surfaces via `useMobileToast()`
 * and leaves the card exactly as it was (nothing to roll back).
 *
 * `resolvingRequestId` tracks the single in-flight request id so a card can
 * disable its own buttons/show a "Sending" state (verbatim label —
 * `MobileInteractionCardShell`'s `MobileInteractionCardFooter`, no
 * ellipsis) without needing its own local pending flag — mirrors the
 * pattern `useMobilePendingPromptQueue` uses for queue mutations.
 */
export function useMobileChatInteractionActions({
  sessionId,
  workspace,
  isUnclaimed,
}: {
  sessionId: string | null;
  workspace: CloudWorkspaceDetail | null;
  isUnclaimed: boolean;
}) {
  const resolveMutation = useResolveSessionInteractionMutation();
  const revealUrlMutation = useRevealMcpElicitationUrlMutation();
  const toast = useMobileToast();
  const [resolvingRequestId, setResolvingRequestId] = useState<string | null>(null);

  const resolve = useCallback(
    async (requestId: string, request: ResolveInteractionRequest) => {
      if (!sessionId) {
        // E3-#2: a silent no-op here reads as a dead button — tell the user
        // why nothing happened instead.
        toast.show({
          tone: "error",
          message: "Session is still loading. Try again in a moment.",
        });
        return;
      }
      const blockReason = resolveMobileInteractionBlockReason({ workspace, isUnclaimed });
      if (blockReason) {
        toast.show({ tone: "error", message: blockReason });
        return;
      }
      setResolvingRequestId(requestId);
      try {
        await resolveMutation.mutateAsync({ sessionId, requestId, request });
      } catch (error) {
        toast.show({
          tone: "error",
          message: error instanceof Error ? error.message : "This response could not be sent.",
        });
      } finally {
        setResolvingRequestId((current) => (current === requestId ? null : current));
      }
    },
    [resolveMutation, sessionId, toast, workspace, isUnclaimed],
  );

  const resolvePermissionOption = useCallback(
    (requestId: string, optionId: string) => resolve(requestId, buildPermissionSelectedRequest(optionId)),
    [resolve],
  );

  const resolvePermissionDecision = useCallback(
    (requestId: string, decision: InteractionDecision) =>
      resolve(requestId, buildPermissionDecisionRequest(decision)),
    [resolve],
  );

  const submitUserInput = useCallback(
    (requestId: string, answers: UserInputSubmittedAnswer[]) =>
      resolve(requestId, buildUserInputSubmittedRequest(answers)),
    [resolve],
  );

  const cancelUserInput = useCallback(
    (requestId: string) => resolve(requestId, buildUserInputCancelledRequest()),
    [resolve],
  );

  const acceptMcpElicitation = useCallback(
    (requestId: string, fields: McpElicitationSubmittedField[]) =>
      resolve(requestId, buildMcpElicitationAcceptedRequest(fields)),
    [resolve],
  );

  const declineMcpElicitation = useCallback(
    (requestId: string) => resolve(requestId, buildMcpElicitationDeclinedRequest()),
    [resolve],
  );

  const cancelMcpElicitation = useCallback(
    (requestId: string) => resolve(requestId, buildMcpElicitationCancelledRequest()),
    [resolve],
  );

  const revealMcpElicitationUrl = useCallback(
    async (requestId: string): Promise<string | null> => {
      if (!sessionId) {
        toast.show({
          tone: "error",
          message: "Session is still loading. Try again in a moment.",
        });
        return null;
      }
      const blockReason = resolveMobileInteractionBlockReason({ workspace, isUnclaimed });
      if (blockReason) {
        toast.show({ tone: "error", message: blockReason });
        return null;
      }
      try {
        const response = await revealUrlMutation.mutateAsync({ sessionId, requestId });
        return response.url;
      } catch (error) {
        toast.show({
          tone: "error",
          message: error instanceof Error ? error.message : "Could not reveal the URL.",
        });
        return null;
      }
    },
    [revealUrlMutation, sessionId, toast, workspace, isUnclaimed],
  );

  return {
    resolvingRequestId,
    resolvePermissionOption,
    resolvePermissionDecision,
    submitUserInput,
    cancelUserInput,
    acceptMcpElicitation,
    declineMcpElicitation,
    cancelMcpElicitation,
    revealMcpElicitationUrl,
  };
}

export type MobileChatInteractionActions = ReturnType<typeof useMobileChatInteractionActions>;
