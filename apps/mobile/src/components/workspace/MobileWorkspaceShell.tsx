import { useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack } from "expo-router";
import { ContextCapsule } from "@proliferate/design/glass";
import { useCloudWorkspace } from "@proliferate/cloud-sdk-react";
import { useSessionQuery, useWorkspaceSessionsQuery } from "@anyharness/sdk-react";
import { resolveSessionSidebarActivityState } from "@proliferate/product-domain/sessions/activity";

import { MobileChatScreen } from "../chat/MobileChatScreen";
import { MobileWorkspaceSegmentedControl } from "./MobileWorkspaceSegmentedControl";
import { MobileWorkspaceSessions } from "./MobileWorkspaceSessions";
import { MobileWorkspaceSegmentPlaceholder } from "./MobileWorkspaceSegmentPlaceholder";
import type { MobileCloudChat } from "../../lib/domain/workspace/mobile-workspace-chat";
import {
  defaultWorkspaceSegment,
  type WorkspaceSegmentId,
} from "../../lib/domain/workspace/mobile-workspace-segment";
import {
  chatSegmentAttentionCount,
  sessionActivitySnapshotFromSession,
} from "../../lib/domain/workspace/mobile-session-list";
import {
  contextCapsuleStatusFromMobileStatus,
  contextCapsuleStatusFromSessionActivity,
  effectiveWorkspaceStatus,
  mobileStatus,
} from "../../lib/domain/chat/mobile-chat-presentation";
import { colors, radius, spacing } from "../../styles/tokens";

interface MobileWorkspaceShellProps {
  chat: MobileCloudChat;
  ownerUserId: string | null;
  productToken: string | null;
  onSessionSelected: (sessionId: string) => void;
  onInitialPendingPromptConsumed?: () => void;
}

// Seed the chrome height so the first frame insets bodies sensibly; the real
// height is measured via onLayout and corrects any drift (Dynamic Type etc.).
const CHROME_HEIGHT_ESTIMATE = 110;

/**
 * Group D — the workspace shell (IA §2.3, mockups C-F). Full-screen, pushed
 * over the tabs. Owns two pieces of shared chrome pinned below the native
 * header: the signature `repo · branch · status` ContextCapsule (moved up out
 * of MobileChatScreen so it shows across every segment) and the glass
 * segmented control that swaps the body between Sessions / Chat / Term / Diff.
 *
 * Chat stays mounted across segment switches (preserving its transcript +
 * dispatch state) but hidden + inactive when another segment is showing, so it
 * yields the native header to the shell. Sessions is the real Group D surface;
 * Term (Group F) and Diff (Group G) are honest "coming" placeholders.
 */
export function MobileWorkspaceShell({
  chat,
  ownerUserId,
  productToken,
  onSessionSelected,
  onInitialPendingPromptConsumed,
}: MobileWorkspaceShellProps) {
  const insets = useSafeAreaInsets();
  const [segment, setSegment] = useState<WorkspaceSegmentId>(() =>
    defaultWorkspaceSegment(chat.sessionId),
  );
  const [chromeHeight, setChromeHeight] = useState(CHROME_HEIGHT_ESTIMATE);

  // Same compact-header height MobileChatScreen reconstructs (expo-router
  // doesn't re-export useHeaderHeight). The floating chrome sits directly
  // below it, and each segment body clears header + chrome.
  const headerHeight = insets.top + Platform.select({ ios: 44, default: 56 });
  const bodyTopInset = headerHeight + chromeHeight;

  const workspaceQuery = useCloudWorkspace(chat.workspaceId, true);
  const workspace = workspaceQuery.data ?? null;
  const activeSessionQuery = useSessionQuery(chat.sessionId ?? null);
  const activeSession = activeSessionQuery.data ?? null;
  const sessionsQuery = useWorkspaceSessionsQuery();
  const chatAttention = chatSegmentAttentionCount(sessionsQuery.data ?? []);

  const workspaceName = workspace?.displayName ?? chat.workspaceName;
  const repoLabel = workspace?.repo
    ? `${workspace.repo.owner}/${workspace.repo.name}`
    : chat.repoLabel;
  const branchLabel =
    workspace?.repo?.branch ?? workspace?.repo?.baseBranch ?? chat.branchLabel;
  // Consistent-by-construction with the Sessions list (mobile-session-list.ts):
  // once we have the active session, derive the capsule status from the same
  // `resolveSessionSidebarActivityState` resolver the list uses, over the
  // same activity snapshot, instead of the raw `SessionStatus` alone - that
  // path can't see the `awaiting_interaction` execution phase and mishandled
  // the real `"errored"` status value. Falls back to the coarser
  // status-only derivation only while there's no active session to resolve
  // (e.g. before the workspace/session queries have settled).
  const capsuleStatus = activeSession
    ? contextCapsuleStatusFromSessionActivity(
        resolveSessionSidebarActivityState(sessionActivitySnapshotFromSession(activeSession)),
      )
    : contextCapsuleStatusFromMobileStatus(
        mobileStatus(workspace ? effectiveWorkspaceStatus(workspace) : chat.status),
      );

  function openSession(sessionId: string) {
    onSessionSelected(sessionId);
    setSegment("chat");
  }

  return (
    <View style={styles.root}>
      {/* Chat is always mounted (keeps transcript + dispatch state), hidden and
          inactive when another segment is showing. */}
      <View
        style={[StyleSheet.absoluteFill, segment !== "chat" && styles.hidden]}
        pointerEvents={segment === "chat" ? "auto" : "none"}
      >
        <MobileChatScreen
          chat={chat}
          ownerUserId={ownerUserId}
          productToken={productToken}
          onInitialPendingPromptConsumed={onInitialPendingPromptConsumed}
          onSessionSelected={onSessionSelected}
          topInset={bodyTopInset}
          active={segment === "chat"}
        />
      </View>

      {segment === "sessions" ? (
        <View style={StyleSheet.absoluteFill}>
          <MobileWorkspaceSessions
            anyharnessWorkspaceId={workspace?.anyharnessWorkspaceId ?? null}
            workspace={workspace}
            topInset={bodyTopInset}
            onOpenSession={openSession}
          />
        </View>
      ) : null}

      {segment === "term" ? (
        <View style={StyleSheet.absoluteFill}>
          <MobileWorkspaceSegmentPlaceholder
            icon="terminal"
            title="Terminal"
            body="Attach to a workspace terminal — stream I/O and resize, right from your phone. Landing in an upcoming update."
            topInset={bodyTopInset}
          />
        </View>
      ) : null}

      {segment === "diff" ? (
        <View style={StyleSheet.absoluteFill}>
          <MobileWorkspaceSegmentPlaceholder
            icon="git-branch"
            title="Changes"
            body="Review the working tree, per-file diffs, and PR status. Landing in an upcoming update."
            topInset={bodyTopInset}
          />
        </View>
      ) : null}

      {/* Floating glass chrome: context capsule + segmented control, pinned
          below the native header. Content scrolls beneath it. */}
      <View
        style={[styles.chrome, { top: headerHeight }]}
        onLayout={(event) => setChromeHeight(event.nativeEvent.layout.height)}
        pointerEvents="box-none"
      >
        <View style={styles.capsuleRow}>
          {repoLabel ? (
            <View style={styles.capsulePill}>
              <ContextCapsule repo={repoLabel} branch={branchLabel} status={capsuleStatus} />
            </View>
          ) : null}
        </View>
        <View style={styles.segmentedRow}>
          <MobileWorkspaceSegmentedControl
            segment={segment}
            onSelect={setSegment}
            badges={{ chat: chatAttention }}
          />
        </View>
      </View>

      {/* When the shell shows a non-Chat segment it owns the native header
          title (Chat owns it when active — see MobileChatScreen `active`). */}
      {segment !== "chat" ? (
        <Stack.Screen options={{ title: workspaceName, headerRight: () => null }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  hidden: {
    display: "none",
  },
  chrome: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 10,
  },
  capsuleRow: {
    alignItems: "center",
    paddingTop: spacing[2],
    paddingBottom: spacing[1],
    minHeight: 42,
    justifyContent: "center",
  },
  capsulePill: {
    backgroundColor: colors.accent,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.full,
  },
  segmentedRow: {
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[3],
  },
});
