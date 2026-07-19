import { useState } from "react";
import * as Clipboard from "expo-clipboard";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack } from "expo-router";
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
import { useMobileChatPermissionSheet } from "../../hooks/chat/ui/use-mobile-chat-permission-sheet";
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
import { colors, radius, spacing } from "../../styles/tokens";
import { MobileChatClaimBanner } from "./screen/MobileChatClaimBanner";
import { MobileChatComposer } from "./screen/MobileChatComposer";
import { MobileChatHeaderActions } from "./screen/MobileChatHeaderActions";
import { MobileChatToolDetailSheet } from "./screen/MobileChatToolDetailSheet";
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
    pendingPermissionByRequestId,
    transcriptView,
    hasActiveOptimisticPrompt,
    pendingPromptDurable,
    visibleTranscriptRows,
    liveTranscriptRows,
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
  // E1 note: `visibleTranscriptRows` still exists (fed by the same live
  // stream as `liveTranscriptRows` below, via the existing "Cloud domain"
  // projection) purely so this hook's auto-open effect keeps surfacing the
  // permission sheet the moment a permission interaction is requested — no
  // tap required. `openToolDetailRow` (manual tap-to-open) has no caller
  // now: the new live transcript renders tool calls as non-interactive per
  // the plan ("E1 renders at most a minimal non-interactive placeholder for
  // a pending interaction"); wiring real taps into a card is E3's job.
  const {
    toolDetailRow,
    toolDetailPermission,
    permissionResolveError,
    resolvingPermissionKey,
    setToolDetailRow,
    setPermissionResolveError,
    setResolvingPermissionKey,
    closeToolDetailSheet,
    resetPermissionSheet,
  } = useMobileChatPermissionSheet({
    pendingPermissionByRequestId,
    visibleTranscriptRows,
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
    resolvePermissionInteraction,
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
    isUnclaimed: false,
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
    setPermissionResolveError,
    setResolvingPermissionKey,
    setToolDetailRow,
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
    resetPermissionSheet,
  });
  function openWorkspaceActionSheet(expandedId: string | null = null) {
    setActionSheetInitialExpandedId(expandedId);
    setActionSheetOpen(true);
  }

  function closeWorkspaceActionSheet() {
    setActionSheetOpen(false);
    setActionSheetInitialExpandedId(null);
  }

  const isUnclaimed = false;
  const commandReadiness = workspace ? cloudCommandReadiness(workspace) : null;
  const workspaceCommandReady =
    workspaceStatus === "ready"
    && Boolean(workspace?.anyharnessWorkspaceId)
    && commandReadiness?.commandable === true;
  const canSubmit = Boolean(
    draft.trim()
      && !isUnclaimed
      && !promptSubmitting
      && !sessionChoiceRequired
      && (session ? true : canStartNewSession)
      && workspaceCommandReady,
  );
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
  const composerPlaceholder = isUnclaimed
    ? "Claim this workspace to reply"
    : sessionChoiceRequired
      ? "Choose a session or start a new one"
    : session
      ? "Message this session"
      : !canStartNewSession
        ? "Choose an available cloud agent"
      : workspaceCommandReady
        ? "Start a session with a message"
        : "Waiting for workspace";
  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: topInset ?? headerHeight }]}
      behavior={Platform.select({ ios: "padding", default: undefined })}
      keyboardVerticalOffset={0}
    >
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
        emptyTitle={emptyTitle}
        emptyBody={
          !session
            ? sessionChoiceRequired
              ? "Open the workspace menu to switch sessions or start a new one."
              : "Send a prompt below to start a projected session."
            : "Transcript projection will appear here."
        }
      />

      {footerCommandMessage ? (
        <View style={styles.footerNote}>
          <Text style={styles.footerNoteText}>{footerCommandMessage}</Text>
        </View>
      ) : null}

      <MobileChatComposer
        draft={draft}
        placeholder={composerPlaceholder}
        controlLabel={composerControlSummary.label}
        controlPending={composerControlSummary.pending}
        canSubmit={canSubmit}
        keyboardInset={keyboardInset}
        onChangeDraft={setDraft}
        onOpenSettings={() => openWorkspaceActionSheet()}
        onSubmit={() => void submitPrompt()}
      />

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
      <MobileChatToolDetailSheet
        row={toolDetailRow}
        pendingPermission={toolDetailPermission}
        resolvingPermissionKey={resolvingPermissionKey}
        permissionResolveError={permissionResolveError}
        onResolvePermission={(interaction, option) => {
          void resolvePermissionInteraction(interaction, option);
        }}
        onClose={closeToolDetailSheet}
      />
    </KeyboardAvoidingView>
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
