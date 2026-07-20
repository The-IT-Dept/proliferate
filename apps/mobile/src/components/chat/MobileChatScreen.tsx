import { useState } from "react";
import * as Clipboard from "expo-clipboard";
import {
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { Stack } from "expo-router";
import type { SessionExecutionSummary, SessionStatus } from "@anyharness/sdk";
import {
  DEFAULT_DIRECT_PROMPT_AGENT_KIND,
  DEFAULT_DIRECT_PROMPT_MODEL_ID,
  type CloudLaunchComposerSelection,
  type PendingConfigChange,
} from "@proliferate/product-domain/chats/cloud/composer-controls";
import {
  cloudCommandReadiness,
} from "@proliferate/product-domain/workspaces/cloud-work-inventory";

import { useVisualViewportKeyboardInset } from "../../hooks/ui/keyboard/use-visual-viewport-keyboard-inset";
import { useMobileChatData } from "../../hooks/chat/derived/use-mobile-chat-data";
import { useMobileChatLifecycle } from "../../hooks/chat/lifecycle/use-mobile-chat-lifecycle";
import { useMobileChatActions } from "../../hooks/chat/workflows/use-mobile-chat-actions";
import { useMobileChatInteractionActions } from "../../hooks/chat/workflows/use-mobile-chat-interaction-actions";
import { useMobilePlanDecisionActions } from "../../hooks/chat/workflows/use-mobile-plan-decision-actions";
import { useMobileChatInterrupt } from "../../hooks/chat/workflows/use-mobile-chat-interrupt";
import { useMobilePendingPromptQueue } from "../../hooks/chat/workflows/use-mobile-pending-prompt-queue";
import { MobileWorkspaceActionSheet } from "./MobileWorkspaceActionSheet";
import type {
  MobileCloudChat,
  MobilePendingPrompt,
} from "../../lib/domain/workspace/mobile-workspace-chat";
import type { OptimisticPrompt } from "../../lib/domain/chat/mobile-chat-transcript";
import {
  summarizeRuntimeContext,
} from "../../lib/domain/chat/mobile-chat-presentation";
import {
  isAssistantLoadingRow,
  isPromptProgressStatus,
  loadingStatusText,
} from "../../lib/domain/chat/mobile-chat-row-presentation";
import {
  deriveComposerAction,
  deriveComposerPlaceholder,
  isMobileSessionRunning,
} from "../../lib/domain/chat/mobile-chat-composer-state";
import { colors, radius, spacing } from "../../styles/tokens";
import { MobileChatClaimBanner } from "./screen/MobileChatClaimBanner";
import { MobileChatComposer } from "./screen/MobileChatComposer";
import { MobileChatHeaderActions } from "./screen/MobileChatHeaderActions";
import { MobileChatPendingPromptQueue } from "./screen/MobileChatPendingPromptQueue";
import { MobileLiveTranscriptList } from "./screen/MobileLiveTranscriptList";

interface MobileChatScreenProps {
  chat: MobileCloudChat;
  ownerUserId: string | null;
  productToken: string | null;
  onInitialPendingPromptConsumed?: () => void;
  onSessionSelected?: (sessionId: string) => void;
  /**
   * Group D: when mounted inside the workspace shell, the shell owns the
   * top offset (native header + context capsule + segmented control) and
   * passes it here so the transcript clears the floating chrome. Standalone
   * (no shell) it falls back to the internal compact-header height.
   */
  topInset?: number;
  /**
   * Group D: whether the Chat segment is the active shell segment. When the
   * shell shows another segment it keeps Chat mounted (preserving transcript
   * + dispatch state) but hidden and inactive, so Chat yields the native
   * header options to the shell instead of setting its own.
   */
  active?: boolean;
}

// Seed for `composerDockHeight` — see its `useState` below.
const COMPOSER_DOCK_HEIGHT_ESTIMATE = 96;

export function MobileChatScreen({
  chat,
  ownerUserId,
  productToken,
  onInitialPendingPromptConsumed,
  onSessionSelected,
  topInset,
  active = true,
}: MobileChatScreenProps) {
  const keyboardInset = useVisualViewportKeyboardInset();
  const insets = useSafeAreaInsets();
  // This route's header is compact + `headerTransparent` (blur glass) — set on
  // the workspace/[id] Stack.Screen in app/_layout.tsx. A transparent header
  // floats over the content, and React Navigation's native-stack docs are
  // explicit: "if you don't want your content to appear under the header, you
  // need to manually add a top margin to your content. React Navigation won't
  // do it automatically." So we offset the whole body by the header height.
  // (expo-router doesn't re-export `useHeaderHeight`, and adding
  // @react-navigation/elements would risk the pinned react version, so we
  // reconstruct the compact-header height: status-bar/top safe inset + the
  // platform nav-bar height.) This keeps the signature ContextCapsule — which
  // the IA requires "always present, under the title" — below the header
  // instead of hidden beneath it, with the transcript scrolling in the region
  // below and the composer above the keyboard + home indicator.
  const headerHeight = insets.top + Platform.select({ ios: 44, default: 56 });
  const [draft, setDraft] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(chat.sessionId);
  const [launchSelection, setLaunchSelection] = useState<CloudLaunchComposerSelection>({
    agentKind: DEFAULT_DIRECT_PROMPT_AGENT_KIND,
    modelId: DEFAULT_DIRECT_PROMPT_MODEL_ID,
    modeId: null,
    controlValues: {},
  });
  const [newSessionMode, setNewSessionMode] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<MobilePendingPrompt | null>(null);
  const [pendingPromptStatus, setPendingPromptStatus] = useState<string | null>(null);
  const [pendingPromptFailed, setPendingPromptFailed] = useState(false);
  const [optimisticPrompts, setOptimisticPrompts] = useState<OptimisticPrompt[]>([]);
  const [pendingConfigChanges, setPendingConfigChanges] = useState<
    Record<string, PendingConfigChange>
  >({});
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [actionSheetInitialExpandedId, setActionSheetInitialExpandedId] = useState<string | null>(null);
  // Seed the dock height so the first frame reserves sensible transcript
  // bottom padding; the real height is measured via `onLayout` below and
  // corrects any drift (footer note/queue rows appearing, Dynamic Type,
  // etc.) — mirrors `MobileWorkspaceShell`'s `CHROME_HEIGHT_ESTIMATE`.
  const [composerDockHeight, setComposerDockHeight] = useState(COMPOSER_DOCK_HEIGHT_ESTIMATE);
  const {
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
    transcriptView,
    hasActiveOptimisticPrompt,
    pendingPromptDurable,
    visibleTranscriptRows,
    liveTranscriptRows,
    transcript,
    transcriptConnectionState,
  } = useMobileChatData({
    chat,
    active,
    selectedSessionId,
    newSessionMode,
    pendingPrompt,
    pendingPromptFailed,
    pendingPromptStatus,
    optimisticPrompts,
  });
  // Group E3 (I2 collapse) — the old permission auto-open sheet
  // (`use-mobile-chat-permission-sheet.ts`) and `MobileChatToolDetailSheet`
  // are gone: they drove interaction display off the "Cloud domain"
  // projection (`visibleTranscriptRows`/`pendingPermissionByRequestId`) in
  // parallel with the SDK-reducer-driven transcript. Every interaction
  // (permission/user_input/mcp_elicitation) now renders as an inline card
  // in `liveTranscriptRows` (via `buildLiveTranscriptRows`, off
  // `stream.transcript` directly) and resolves through
  // `useMobileChatInteractionActions`, which the transcript list threads
  // down to each card. `visibleTranscriptRows` remains in scope only for
  // the two non-interaction checks below (`commandMessageShownInTranscript`)
  // and `transcriptView.source` (`emptyTitle`) — neither reads pending
  // interactions.
  // Hoisted here (rather than declared just before its first read further
  // down, near the claim banner/command-readiness checks) so both
  // `useMobileChatInteractionActions` and `useMobileChatActions` below can
  // take it as an input. Always `false` for now — mobile has no claim flow
  // wired up yet (`claimChat()` is a stub returning `false`); this becomes
  // real once that lands.
  const isUnclaimed = false;
  const interactionActions = useMobileChatInteractionActions({
    sessionId: session?.sessionId ?? null,
    workspace,
    isUnclaimed,
  });
  // Row 20 — plan Approve/Reject. A sibling of `interactionActions`, not a
  // part of it: it wraps `useApprovePlanMutation`/`useRejectPlanMutation`
  // (workspace-scoped plan endpoints), not
  // `useResolveSessionInteractionMutation` — see that hook's module doc.
  const planDecisionActions = useMobilePlanDecisionActions({
    workspace,
    isUnclaimed,
  });
  const runtimeContext = summarizeRuntimeContext(workspace, workspaceStatus);
  const {
    workspaceHarnessAvailability,
    canStartNewSession,
    liveConfig,
    composerControls,
    composerControlSummary,
    client,
    invalidateWorkspaceLists,
    pendingDispatchRunRef,
    claimPending,
    promptSubmitting,
    submitPrompt,
    claimChat,
    startNewSession,
    selectSession,
  } = useMobileChatActions({
    ownerUserId,
    productToken,
    workspace,
    session,
    draft,
    pendingPrompt,
    pendingPromptFailed,
    hasActiveOptimisticPrompt,
    launchSelection,
    runtimeLabel: runtimeContext.label,
    transcriptItems,
    transcriptRows: transcriptView.rows,
    isUnclaimed,
    pendingConfigChanges,
    setDraft,
    setLaunchSelection,
    setPendingPrompt,
    setPendingPromptStatus,
    setPendingPromptFailed,
    setOptimisticPrompts,
    setPendingConfigChanges,
    setSelectedSessionId,
    setNewSessionMode,
    onSessionSelected,
    closeWorkspaceActionSheet,
    workspaceRefetch: workspaceQuery.refetch,
    transcriptRefetch: transcriptQuery.refetch,
    sessionEventsRefetch: sessionEventsQuery.refetch,
  });
  useMobileChatLifecycle({
    chat,
    ownerUserId,
    onInitialPendingPromptConsumed,
    onSessionSelected,
    client,
    productToken,
    invalidateWorkspaceLists,
    workspace,
    workspaceStatus,
    workspaceRefetch: workspaceQuery.refetch,
    session,
    targetId,
    sessionLiveLastPatchAt: sessionLive.lastPatchAt,
    transcriptRefetch: transcriptQuery.refetch,
    sessionEventsRefetch: sessionEventsQuery.refetch,
    transcriptItems,
    transcriptRows: transcriptView.rows,
    pendingInteractions,
    pendingPrompt,
    pendingPromptFailed,
    pendingPromptDurable,
    hasActiveOptimisticPrompt,
    optimisticPrompts,
    liveConfig,
    pendingConfigChanges,
    pendingDispatchRunRef,
    setDraft,
    setSelectedSessionId,
    setNewSessionMode,
    setPendingPrompt,
    setPendingPromptStatus,
    setPendingPromptFailed,
    setOptimisticPrompts,
    setPendingConfigChanges,
  });
  // Group E2: interrupt ("Stop run") + the runtime pending-prompt queue
  // (edit/delete/reorder/steer on already-queued messages). Both read off
  // the same live stream E1 exposes (`transcript`/`transcriptConnectionState`)
  // rather than a separate poll, and both are real `@anyharness/sdk-react`
  // mutations — no hand-rolled client calls.
  const { cancelActiveSession } = useMobileChatInterrupt();
  const pendingPromptQueue = useMobilePendingPromptQueue({
    sessionId: session?.sessionId ?? null,
    entries: transcript.pendingPrompts,
  });
  const isSessionRunning = isMobileSessionRunning({
    status: (session?.status as SessionStatus | null | undefined) ?? null,
    executionSummary: session?.executionSummary as SessionExecutionSummary | null | undefined,
    isStreaming: transcript.isStreaming,
    pendingInteractions: transcript.pendingInteractions,
    connectionState: transcriptConnectionState,
    // Group D's `sessionActivitySnapshotFromSession` pattern
    // (`Boolean(session.lastPromptAt)`) — without it a `"starting"` session
    // with no prompt sent yet would read as running (see
    // `isMobileSessionRunning`'s doc comment).
    hasPromptActivity: Boolean(session?.lastPromptAt),
  });
  function openWorkspaceActionSheet(expandedId: string | null = null) {
    setActionSheetInitialExpandedId(expandedId);
    setActionSheetOpen(true);
  }

  function closeWorkspaceActionSheet() {
    setActionSheetOpen(false);
    setActionSheetInitialExpandedId(null);
  }

  const commandReadiness = workspace ? cloudCommandReadiness(workspace) : null;
  const workspaceCommandReady =
    workspaceStatus === "ready"
    && Boolean(workspace?.anyharnessWorkspaceId)
    && commandReadiness?.commandable === true;
  // Everything the composer needs blocked *except* draft emptiness — feeds
  // `deriveComposerAction` below, which handles emptiness itself per-mode
  // (send/save gate on it, stop never does).
  const composerDisabledBase = Boolean(
    isUnclaimed
      || promptSubmitting
      || sessionChoiceRequired
      || !(session ? true : canStartNewSession)
      || !workspaceCommandReady,
  );
  const composerDraft = pendingPromptQueue.isEditing ? pendingPromptQueue.editDraft : draft;
  const composerAction = deriveComposerAction({
    isRunning: isSessionRunning,
    isEmpty: composerDraft.trim().length === 0,
    isDisabled: composerDisabledBase,
    isEditingQueuedPrompt: pendingPromptQueue.isEditing,
  });
  function handleComposerPrimaryAction() {
    if (composerAction.mode === "stop") {
      if (session) {
        void cancelActiveSession(session.sessionId);
      }
      return;
    }
    if (composerAction.mode === "save") {
      void pendingPromptQueue.commitEdit();
      return;
    }
    void submitPrompt();
  }
  const title = newSessionMode
    ? "New session"
    : session?.title ?? workspace?.displayName ?? chat.title;
  const branchLabel = workspace?.repo?.branch ?? workspace?.repo?.baseBranch ?? chat.branchLabel;
  const commandMessage =
    pendingPromptStatus ??
    (!session && !canStartNewSession ? workspaceHarnessAvailability.message : null) ??
    (!workspaceCommandReady && workspaceStatus === "ready" ? commandReadiness?.message ?? null : null);
  const commandMessageShownInTranscript = visibleTranscriptRows.some((row) =>
    isAssistantLoadingRow(row) && Boolean(loadingStatusText(row))
  );
  const footerCommandMessage =
    commandMessageShownInTranscript || isPromptProgressStatus(commandMessage)
      ? null
      : commandMessage;
  const emptyTitle = !session
    ? sessionChoiceRequired ? "Choose a session" : newSessionMode ? "New session" : "No active session yet."
    : sessionEventsQuery.isLoading && transcriptView.source === "empty"
      ? "Loading transcript"
      : "Waiting for the first projected transcript event.";
  // Verbatim mockup/web copy ("Describe a task, @mention files, run
  // /commands" — CHAT_COMPOSER_LABELS.placeholder, chat-copy.ts; mockup F's
  // "Message this session" composer-dock line is the session-title context,
  // not the placeholder) once the composer is actually usable; the blocked
  // states below it keep their own explanatory text since web has no
  // equivalent (its composer is always attached to a materialized session).
  const composerReadyPlaceholder = deriveComposerPlaceholder({
    hasSessionTurns: transcript.turnOrder.length > 0,
  });
  const composerPlaceholder = isUnclaimed
    ? "Claim this workspace to reply"
    : sessionChoiceRequired
      ? "Choose a session or start a new one"
    : session
      ? composerReadyPlaceholder
      : !canStartNewSession
        ? "Choose an available cloud agent"
      : workspaceCommandReady
        ? composerReadyPlaceholder
        : "Waiting for workspace";
  return (
    <View style={[styles.root, { paddingTop: topInset ?? headerHeight }]}>
      {/*
        Native header (compact, not large-title - see the workspace/[id]
        Stack.Screen options in app/_layout.tsx for the glass setup). Actions
        that used to live in the custom MobileChatHeader's trailing slot move
        into headerRight; the back button is the native default. Group D: the
        context capsule (repo · branch · status) moved UP to the workspace
        shell so it shows across every segment; this screen no longer renders
        it. The `<Stack.Screen>` is gated on `active` so that when the shell
        shows another segment (Sessions/Term/Diff) the shell owns the header
        title instead of this (still-mounted) Chat screen.
      */}
      {active ? (
        <Stack.Screen
          options={{
            title,
            headerRight: () => (
              <MobileChatHeaderActions
                sessionsCount={sessions.length}
                unclaimed={isUnclaimed}
                onOpenSessions={() => openWorkspaceActionSheet("sessions")}
                onOpenActions={() => openWorkspaceActionSheet()}
              />
            ),
          }}
        />
      ) : null}

      {isUnclaimed ? (
        <MobileChatClaimBanner
          claimPending={claimPending}
          onClaim={() => void claimChat()}
        />
      ) : null}

      <MobileLiveTranscriptList
        rows={liveTranscriptRows}
        interactionActions={interactionActions}
        planDecisionActions={planDecisionActions}
        composerDockInset={insets.bottom + composerDockHeight}
        focusRequestId={chat.initialInteractionRequestId}
        emptyTitle={emptyTitle}
        emptyBody={
          !session
            ? sessionChoiceRequired
              ? "Open the workspace menu to switch sessions or start a new one."
              : "Send a prompt below to start a projected session."
            : "Transcript projection will appear here."
        }
      />

      {/*
        Group E2: the composer dock (+ queued-message list, + the footer
        status note that used to sit above it as a plain flex sibling) rides
        the keyboard as one unit via `KeyboardStickyView`
        (react-native-keyboard-controller) — the primitive built for
        exactly this "bottom-docked chat composer" shape, translating above
        the keyboard rather than resizing the whole screen the way the
        former root `KeyboardAvoidingView` did. `offset.closed` adds the
        safe-area bottom inset so the dock clears the home indicator when
        the keyboard is closed (previously unhandled on native —
        `useVisualViewportKeyboardInset` below is a web-only measurement,
        always 0 on native); `offset.opened: 0` because the keyboard itself
        already provides that clearance once it's up.

        Group E3 carryover (M-ish bottom-padding fix): because the dock
        floats/translates over the transcript instead of resizing it, the
        transcript needs its own bottom padding reserved so the dock can't
        cover the last row — see `composerDockInset` above, fed by
        `composerDockHeight` measured here via `onLayout` (seeded with
        `COMPOSER_DOCK_HEIGHT_ESTIMATE` for the first frame, corrected once
        layout runs — mirrors `MobileWorkspaceShell`'s identical
        `CHROME_HEIGHT_ESTIMATE`/`onLayout` pattern for its floating chrome).
      */}
      <KeyboardStickyView offset={{ closed: insets.bottom, opened: 0 }}>
        <View onLayout={(event) => setComposerDockHeight(event.nativeEvent.layout.height)}>
          {footerCommandMessage ? (
            <View style={styles.footerNote}>
              <Text style={styles.footerNoteText}>{footerCommandMessage}</Text>
            </View>
          ) : null}

          <MobileChatPendingPromptQueue
            rows={pendingPromptQueue.rows}
            steeringSeq={pendingPromptQueue.steeringSeq}
            queueMutationInFlight={pendingPromptQueue.queueMutationInFlight}
            onBeginEdit={pendingPromptQueue.beginEdit}
            onDelete={pendingPromptQueue.onDelete}
            onSteer={pendingPromptQueue.onSteer}
            onMoveUp={pendingPromptQueue.onMoveUp}
            onMoveDown={pendingPromptQueue.onMoveDown}
          />

          <MobileChatComposer
            draft={composerDraft}
            placeholder={composerPlaceholder}
            controlLabel={composerControlSummary.label}
            controlPending={composerControlSummary.pending}
            canSubmit={composerAction.enabled}
            actionMode={composerAction.mode}
            actionLabel={composerAction.label}
            isEditing={pendingPromptQueue.isEditing}
            keyboardInset={keyboardInset}
            onChangeDraft={pendingPromptQueue.isEditing ? pendingPromptQueue.setEditDraftText : setDraft}
            onOpenSettings={() => openWorkspaceActionSheet()}
            onSubmit={handleComposerPrimaryAction}
            onCancelEdit={pendingPromptQueue.cancelEdit}
            availableCommands={transcript.availableCommands}
          />
        </View>
      </KeyboardStickyView>

      <MobileWorkspaceActionSheet
        visible={actionSheetOpen}
        initialExpandedId={actionSheetInitialExpandedId}
        branchLabel={branchLabel}
        runtimeLabel={runtimeContext.label}
        runtimeDetail={runtimeContext.detail}
        runtimeIcon={runtimeContext.icon}
        unclaimed={isUnclaimed}
        claimPending={claimPending}
        promptSubmitting={promptSubmitting}
        sessions={sessions}
        activeSessionId={session?.sessionId ?? null}
        newSessionMode={newSessionMode}
        composerControls={composerControls}
        onClaim={claimChat}
        onNewSession={startNewSession}
        onSelectSession={selectSession}
        onCopyBranch={() => void copyBranchToClipboard(branchLabel)}
        onClose={closeWorkspaceActionSheet}
      />
    </View>
  );
}

async function copyBranchToClipboard(branchLabel: string): Promise<void> {
  await Clipboard.setStringAsync(branchLabel);
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  footerNote: {
    marginHorizontal: spacing[4],
    marginBottom: spacing[2],
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[3],
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  footerNoteText: {
    color: colors.faint,
    fontSize: 12,
    fontStyle: "italic",
  },
});
