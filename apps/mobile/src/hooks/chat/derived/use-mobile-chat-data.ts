import type {
  SessionEventEnvelope,
  SessionExecutionSummary,
} from "@anyharness/sdk";
import { useWorkspaceSessionsQuery } from "@anyharness/sdk-react";
import { useMemo } from "react";
import type {
  CloudPendingInteraction,
  CloudSessionEvent,
  CloudTranscriptItem,
} from "@proliferate/cloud-sdk";
import { useCloudWorkspace } from "@proliferate/cloud-sdk-react";
import {
  buildCloudTranscriptView,
  cloudTranscriptHasAgentProgressAfterPrompt,
  cloudTranscriptHasUserPrompt,
} from "@proliferate/product-domain/chats/cloud/transcript-view";

import type {
  MobileCloudChat,
  MobilePendingPrompt,
} from "../../../lib/domain/workspace/mobile-workspace-chat";
import {
  type OptimisticPrompt,
  buildOptimisticPromptRows,
  buildPendingPromptRows,
  latestPendingPromptCommandId,
  optimisticPromptFromPending,
} from "../../../lib/domain/chat/mobile-chat-transcript";
import {
  buildLiveTranscriptRows,
} from "../../../lib/domain/chat/mobile-live-transcript-view";
import {
  cloudPendingInteractionsFromExecutionSummary,
  cloudPendingInteractionsFromReducer,
  cloudSessionEventFromAnyHarness,
  cloudSessionProjectionFromAnyHarness,
} from "../../../lib/domain/chat/mobile-chat-anyharness-projection";
import {
  compareSessions,
  effectiveWorkspaceStatus,
  sessionProjectionFromChat,
} from "../../../lib/domain/chat/mobile-chat-presentation";
import { useSessionTranscriptStream } from "./use-session-transcript-stream";

const EMPTY_TRANSCRIPT_ITEMS: CloudTranscriptItem[] = [];

/**
 * Group E1 rework — this used to run its OWN manual polling `useQuery` for
 * both the session list (`mobile-cloud-anyharness-sessions`, refetching
 * every 1.5-5s) and the session events (same interval), separate from the
 * shell's `@anyharness/sdk-react` `useWorkspaceSessionsQuery`. That meant two
 * independent session sources: `useCreateSessionMutation`'s cache
 * invalidation (keyed by `anyHarnessSessionsKey`) never reached this hook,
 * so creating a session and opening it here showed stale data until the next
 * poll tick (deferred D#3/#4).
 *
 * Now: sessions come from the SAME `useWorkspaceSessionsQuery` the shell
 * uses (shared cache key, so the mutation's invalidation reaches both), and
 * the transcript comes from `useSessionTranscriptStream` (SSE via
 * `streamSession` + the SDK reducer, not polling) gated on `active` — when
 * the Chat segment isn't the shell's active segment, the stream pauses
 * instead of streaming a hidden screen, and resumes from where it left off
 * (via `afterSeq`) without losing accumulated transcript state.
 *
 * The live envelope log the stream accumulates still feeds
 * `buildCloudTranscriptView` (the existing `@proliferate/product-domain`
 * "Cloud" row/pending-prompt projection) so the composer, permission
 * auto-open sheet, and pending-prompt queue (E2's territory) keep working
 * unchanged off the same live data — this hook's return shape is otherwise
 * unchanged from before this rework.
 */
export function useMobileChatData({
  chat,
  active,
  selectedSessionId,
  newSessionMode,
  pendingPrompt,
  pendingPromptFailed,
  pendingPromptStatus,
  optimisticPrompts,
}: {
  chat: MobileCloudChat;
  /** Group D's off-segment gate — whether the Chat segment is the shell's
   * active segment. Threaded through to `useSessionTranscriptStream`. */
  active: boolean;
  selectedSessionId: string | null;
  newSessionMode: boolean;
  pendingPrompt: MobilePendingPrompt | null;
  pendingPromptFailed: boolean;
  pendingPromptStatus: string | null;
  optimisticPrompts: readonly OptimisticPrompt[];
}) {
  const workspaceQuery = useCloudWorkspace(chat.workspaceId, true);
  const workspace = workspaceQuery.data ?? null;

  const sessionsQuery = useWorkspaceSessionsQuery({ workspaceId: chat.workspaceId });
  const sessions = useMemo(() => {
    if (!workspace) {
      return [];
    }
    return [...(sessionsQuery.data ?? [])]
      .map((rawSession) =>
        cloudSessionProjectionFromAnyHarness(
          rawSession,
          workspace.id,
          workspace.anyharnessWorkspaceId ?? "",
        )
      )
      .sort(compareSessions);
  }, [sessionsQuery.data, workspace]);
  const fallbackSession = useMemo(() => sessionProjectionFromChat(chat), [chat]);
  const singleInferredSession = !chat.sessionId && sessions.length === 1 ? sessions[0] ?? null : null;
  const selectedSession = selectedSessionId
    ? sessions.find((candidate) => candidate.sessionId === selectedSessionId)
      ?? (fallbackSession?.sessionId === selectedSessionId ? fallbackSession : null)
    : chat.sessionId
      ? sessions.find((candidate) => candidate.sessionId === chat.sessionId)
        ?? fallbackSession
        ?? null
      : singleInferredSession;
  const session = newSessionMode ? null : selectedSession;
  const sessionChoiceRequired = !newSessionMode && !session && !chat.sessionId && sessions.length > 1;
  const activeSessionId = session?.sessionId ?? selectedSessionId;
  const targetId = session?.targetId ?? workspace?.targetId ?? chat.targetId;
  const workspaceStatus = workspace ? effectiveWorkspaceStatus(workspace) : chat.status;

  const stream = useSessionTranscriptStream({
    sessionId: session?.sessionId ?? null,
    active,
  });
  const sessionLive = {
    lastPatchAt: sessionsQuery.dataUpdatedAt ? new Date(sessionsQuery.dataUpdatedAt) : null,
    isConnected: stream.connectionState === "open",
  };
  // Kept only so the pre-existing composer/permission-sheet call sites
  // (`transcriptRefetch`/`sessionEventsRefetch` — E2's territory) keep their
  // expected shape. They're inert now: the stream pushes new events itself,
  // there is nothing left to imperatively refetch.
  const noopRefetch = () => undefined;
  const transcriptQuery = {
    data: undefined as { transcriptItems: CloudTranscriptItem[]; pendingInteractions: CloudPendingInteraction[] } | undefined,
    isLoading: stream.connectionState === "connecting",
    refetch: noopRefetch,
  };
  const sessionEventsQuery = {
    isLoading: stream.connectionState === "connecting",
    isFetched: stream.hasSynced,
    refetch: noopRefetch,
  };
  const transcriptItems = EMPTY_TRANSCRIPT_ITEMS;
  const sessionEvents = useMemo<CloudSessionEvent[]>(() => {
    if (!session?.sessionId) {
      return [];
    }
    const cloudWorkspaceId = workspace?.id ?? chat.workspaceId;
    return stream.envelopes.map((envelope) =>
      cloudSessionEventFromAnyHarness(envelope, cloudWorkspaceId, session.sessionId)
    );
  }, [stream.envelopes, session?.sessionId, workspace?.id, chat.workspaceId]);
  const pendingInteractions = useMemo(
    () => {
      if (session?.sessionId && stream.hasSynced) {
        return cloudPendingInteractionsFromReducer(
          stream.transcript.pendingInteractions,
          session.sessionId,
        );
      }
      return cloudPendingInteractionsFromExecutionSummary(
        session?.executionSummary as SessionExecutionSummary | null | undefined,
        session?.sessionId ?? null,
      );
    },
    [session?.executionSummary, session?.sessionId, stream.transcript.pendingInteractions, stream.hasSynced],
  );
  const pendingPermissionByRequestId = useMemo(
    () => new Map(
      pendingInteractions
        .filter((interaction) =>
          interaction.kind === "permission"
          && (interaction.status === "pending" || interaction.status === "failed")
        )
        .map((interaction) => [interaction.requestId, interaction]),
    ),
    [pendingInteractions],
  );
  const pendingPromptCommandId = useMemo(
    () => latestPendingPromptCommandId(pendingInteractions),
    [pendingInteractions],
  );
  const transcriptView = useMemo(
    () => buildCloudTranscriptView({
      sessionId: session?.sessionId ?? null,
      events: sessionEvents,
      fallbackItems: transcriptItems,
      pendingInteractions,
    }),
    [pendingInteractions, session?.sessionId, sessionEvents, transcriptItems],
  );
  // The new E1 renderer's row model — the actual TranscriptItem union,
  // mapped straight off the live reduced state (no "Cloud domain"
  // projection in between). This is what `MobileChatScreen` renders now;
  // `transcriptView`/`visibleTranscriptRows` below remain only to keep the
  // pending-prompt queue + permission auto-open sheet (E2/E3 territory)
  // working unchanged off the same live data.
  const liveTranscriptRows = useMemo(
    () => buildLiveTranscriptRows(stream.transcript),
    [stream.transcript],
  );
  const hasActiveOptimisticPrompt = useMemo(
    () =>
      activeSessionId !== null &&
      optimisticPrompts.some((prompt) =>
        prompt.sessionId === activeSessionId && prompt.status !== "failed"
      ),
    [activeSessionId, optimisticPrompts],
  );
  const pendingPromptTranscriptState = useMemo(() => {
    if (
      !pendingPrompt?.dispatchedSessionId
      || activeSessionId !== pendingPrompt.dispatchedSessionId
    ) {
      return { agentStarted: false, promptVisible: false };
    }
    const prompt = optimisticPromptFromPending(pendingPrompt, pendingPrompt.dispatchedSessionId);
    return {
      agentStarted: cloudTranscriptHasAgentProgressAfterPrompt({
        prompt,
        transcriptItems,
        transcriptRows: transcriptView.rows,
      }),
      promptVisible: cloudTranscriptHasUserPrompt({
        prompt,
        transcriptItems,
        transcriptRows: transcriptView.rows,
      }),
    };
  }, [
    activeSessionId,
    pendingPrompt,
    transcriptItems,
    transcriptView.rows,
  ]);
  const pendingPromptDurable = pendingPromptTranscriptState.agentStarted;
  const visibleTranscriptRows = useMemo(
    () => [
      ...transcriptView.rows,
      ...buildPendingPromptRows(
        pendingPrompt,
        activeSessionId,
        pendingInteractions,
        pendingPromptFailed,
        pendingPromptStatus,
        pendingPromptTranscriptState.promptVisible,
        pendingPromptTranscriptState.agentStarted,
      ),
      ...buildOptimisticPromptRows({
        prompts: optimisticPrompts,
        sessionId: activeSessionId,
        transcriptItems,
        transcriptRows: transcriptView.rows,
        pendingInteractions,
        status: pendingPromptStatus,
        allowTextOnlyRowFallback: false,
      }),
    ],
    [
      activeSessionId,
      optimisticPrompts,
      pendingPrompt,
      pendingPromptFailed,
      pendingPromptStatus,
      pendingInteractions,
      pendingPromptTranscriptState.agentStarted,
      pendingPromptTranscriptState.promptVisible,
      transcriptItems,
      transcriptView.rows,
    ],
  );

  return {
    workspaceQuery,
    workspace,
    sessions,
    session,
    sessionChoiceRequired,
    activeSessionId,
    targetId,
    workspaceStatus,
    sessionLive,
    transcriptQuery,
    sessionEventsQuery,
    transcriptItems,
    pendingInteractions,
    pendingPermissionByRequestId,
    pendingPromptCommandId,
    transcriptView,
    hasActiveOptimisticPrompt,
    pendingPromptTranscriptState,
    pendingPromptDurable,
    visibleTranscriptRows,
    // New for E1: the live TranscriptState + its row view-models, and the
    // seam E3 consumes (`stream.transcript.pendingInteractions`, selected
    // via `selectPrimaryPendingInteraction`/`selectPendingApprovalInteraction`
    // from `@anyharness/sdk` directly over `transcript`).
    transcript: stream.transcript,
    transcriptConnectionState: stream.connectionState,
    transcriptStreamError: stream.error,
    liveTranscriptRows,
  };
}
