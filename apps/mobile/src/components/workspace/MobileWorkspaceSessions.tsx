import { Fragment } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Session } from "@anyharness/sdk";
import { parseTime, relativeTimeLabel } from "@proliferate/product-domain/workspaces/cloud-work-time";

import { MobileIcon, type MobileIconName } from "../primitives/MobileIcon";
import { useMobileToast } from "../../providers/MobileToastProvider";
import { useMobileWorkspaceSessions } from "../../hooks/workspace/use-mobile-workspace-sessions";
import {
  groupWorkspaceSessions,
  isSessionClosed,
  mobileSessionAttentionDetail,
  mobileSessionGroup,
  mobileSessionStatusLabel,
  type MobileSessionTone,
} from "../../lib/domain/workspace/mobile-session-list";
import { colors, radius, spacing } from "../../styles/tokens";

const DEFAULT_SESSION_AGENT_KIND = "claude";

interface MobileWorkspaceSessionsProps {
  /** Anyharness workspace id, needed to create a session; null until ready. */
  anyharnessWorkspaceId: string | null;
  /** Space to clear the floating header + capsule + segmented control above. */
  topInset: number;
  /** Switch the shell to Chat, targeting the given session. */
  onOpenSession: (sessionId: string) => void;
}

/**
 * The Sessions segment of the workspace shell (mockup E, IA §2.3). Lists the
 * workspace's sessions grouped Active / Earlier, creates a session, switches
 * the active session (tap), and hides/closes one (long-press). All the derived
 * presentation is the pure `mobile-session-list` logic; all the data + actions
 * are the shared `@anyharness/sdk-react` hooks via `useMobileWorkspaceSessions`.
 * Actions surface pending -> success/error via `useMobileToast()` with no
 * optimistic mutation: rows only change after the mutation invalidates and the
 * list refetches.
 */
export function MobileWorkspaceSessions({
  anyharnessWorkspaceId,
  topInset,
  onOpenSession,
}: MobileWorkspaceSessionsProps) {
  const insets = useSafeAreaInsets();
  const toast = useMobileToast();
  const {
    sessions,
    isLoading,
    isError,
    refetch,
    createSession,
    isCreatingSession,
    dismissSession,
    closeSession,
  } = useMobileWorkspaceSessions(anyharnessWorkspaceId);

  const grouped = groupWorkspaceSessions(sessions);
  const isEmpty = grouped.active.length === 0 && grouped.earlier.length === 0;

  // Pending -> success/error, mirroring Group C's discipline. A transient
  // "pending" toast is replaced (dismissed, then re-shown) with the result, so
  // the row never changes optimistically — it changes when the refetch lands.
  function runSessionAction(input: {
    pending: string;
    success: string;
    failVerb: string;
    action: Promise<unknown>;
  }) {
    const pendingId = toast.show({ tone: "info", message: input.pending, durationMs: 15000 });
    void input.action
      .then(() => {
        toast.dismiss(pendingId);
        toast.show({ tone: "success", message: input.success });
      })
      .catch((error: unknown) => {
        toast.dismiss(pendingId);
        const detail = error instanceof Error && error.message ? `: ${error.message}` : ".";
        toast.show({ tone: "error", message: `Couldn't ${input.failVerb}${detail}` });
      });
  }

  function handleNewSession() {
    runSessionAction({
      pending: "Starting a new session…",
      success: "Session started",
      failVerb: "start the session",
      action: createSession({ agentKind: DEFAULT_SESSION_AGENT_KIND }).then((session) => {
        onOpenSession(session.id);
      }),
    });
  }

  function handleLongPress(session: Session) {
    Alert.alert(
      session.title?.trim() || "Session",
      undefined,
      [
        {
          text: "Hide",
          onPress: () =>
            runSessionAction({
              pending: "Hiding session…",
              success: "Session hidden",
              failVerb: "hide the session",
              action: dismissSession(session.id),
            }),
        },
        {
          text: isSessionClosed(session) ? "Closed" : "Close",
          onPress: isSessionClosed(session)
            ? undefined
            : () =>
                runSessionAction({
                  pending: "Closing session…",
                  success: "Session closed",
                  failVerb: "close the session",
                  action: closeSession(session.id),
                }),
        },
        { text: "Cancel", style: "cancel" },
      ],
      { cancelable: true },
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topInset + spacing[2], paddingBottom: insets.bottom + 96 },
        ]}
      >
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.fg} />
            <Text style={styles.centeredText}>Loading history</Text>
          </View>
        ) : isError ? (
          <Pressable style={styles.centered} onPress={() => void refetch()}>
            <Text style={styles.centeredTitle}>Couldn't load sessions</Text>
            <Text style={styles.centeredText}>Tap to retry.</Text>
          </Pressable>
        ) : isEmpty ? (
          <View style={styles.centered}>
            <Text style={styles.centeredTitle}>No sessions yet</Text>
            <Text style={styles.centeredText}>Send a prompt to start one.</Text>
          </View>
        ) : (
          <>
            <SessionGroup
              label="Active"
              sessions={grouped.active}
              onOpenSession={onOpenSession}
              onLongPress={handleLongPress}
            />
            <SessionGroup
              label="Earlier"
              sessions={grouped.earlier}
              onOpenSession={onOpenSession}
              onLongPress={handleLongPress}
            />
            <Text style={styles.footnote}>
              Sessions are chat tabs — switching never stops the agent.
            </Text>
          </>
        )}
      </ScrollView>

      <View style={[styles.newSessionDock, { bottom: insets.bottom + spacing[4] }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New session"
          disabled={isCreatingSession || !anyharnessWorkspaceId}
          onPress={handleNewSession}
          style={({ pressed }) => [
            styles.newSessionButton,
            (isCreatingSession || !anyharnessWorkspaceId) && styles.newSessionButtonDisabled,
            pressed && styles.newSessionButtonPressed,
          ]}
        >
          {isCreatingSession ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <>
              <MobileIcon name="plus" size={16} color={colors.background} />
              <Text style={styles.newSessionLabel}>New session</Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function SessionGroup({
  label,
  sessions,
  onOpenSession,
  onLongPress,
}: {
  label: string;
  sessions: Session[];
  onOpenSession: (sessionId: string) => void;
  onLongPress: (session: Session) => void;
}) {
  if (sessions.length === 0) {
    return null;
  }
  return (
    <View style={styles.group}>
      <Text style={styles.eyebrow}>{label}</Text>
      <View style={styles.card}>
        {sessions.map((session, index) => (
          <Fragment key={session.id}>
            {index > 0 ? <View style={styles.separator} /> : null}
            <SessionRow
              session={session}
              onPress={() => onOpenSession(session.id)}
              onLongPress={() => onLongPress(session)}
            />
          </Fragment>
        ))}
      </View>
    </View>
  );
}

function SessionRow({
  session,
  onPress,
  onLongPress,
}: {
  session: Session;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const status = mobileSessionStatusLabel(session);
  const statusLine = sessionStatusLine(session, status.label);
  const dimmed = mobileSessionGroup(session) === "earlier";

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <MobileIcon
        name={agentKindIcon(session.agentKind)}
        size={17}
        color={dimmed ? colors.faint : colors.mutedForeground}
      />
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, dimmed && styles.rowTitleDimmed]} numberOfLines={1}>
          {session.title?.trim() || "Untitled session"}
        </Text>
        <Text style={[styles.rowStatus, { color: TONE_COLOR[status.tone] }]} numberOfLines={1}>
          {statusLine}
        </Text>
      </View>
      <SessionToneDot tone={status.tone} />
    </Pressable>
  );
}

function sessionStatusLine(session: Session, label: string): string {
  const parts = [label];
  const attention = mobileSessionAttentionDetail(session);
  if (attention) {
    parts.push(attention);
  } else if (mobileSessionGroup(session) === "active") {
    parts.push(session.agentKind);
    if (session.modelId) {
      parts.push(session.modelId);
    }
  } else {
    const at = parseTime(session.lastPromptAt ?? session.updatedAt ?? session.createdAt);
    if (at) {
      parts.push(relativeTimeLabel(at, Date.now()));
    }
  }
  return parts.join(" · ");
}

function SessionToneDot({ tone }: { tone: MobileSessionTone }) {
  return (
    <View
      style={[
        styles.dot,
        { backgroundColor: TONE_COLOR[tone] },
        tone === "live" && styles.dotLive,
      ]}
    />
  );
}

const TONE_COLOR: Record<MobileSessionTone, string> = {
  live: colors.success,
  ready: colors.success,
  attention: colors.warning,
  busy: colors.info,
  stopped: colors.faint,
  failed: colors.destructive,
};

function agentKindIcon(agentKind: string): MobileIconName {
  const kind = agentKind.toLowerCase();
  if (kind.includes("claude")) {
    return "claude";
  }
  if (kind.includes("codex") || kind.includes("openai") || kind.includes("gpt")) {
    return "openai";
  }
  return "sparkles";
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing[5],
  },
  group: {
    marginBottom: spacing[5],
  },
  eyebrow: {
    color: colors.faint,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.3,
    textTransform: "uppercase",
    marginBottom: spacing[2],
  },
  card: {
    backgroundColor: colors.surfaceControl,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingVertical: 13,
    minHeight: 44,
  },
  rowPressed: {
    backgroundColor: colors.accent,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: colors.fg,
    fontSize: 15,
    fontWeight: "600",
  },
  rowTitleDimmed: {
    color: colors.mutedForeground,
  },
  rowStatus: {
    fontSize: 12.5,
    marginTop: 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotLive: {
    shadowColor: colors.success,
    shadowOpacity: 0.6,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  footnote: {
    color: colors.faint,
    fontSize: 12.5,
    textAlign: "center",
    marginTop: spacing[1],
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    paddingVertical: spacing[10],
  },
  centeredTitle: {
    color: colors.fg,
    fontSize: 15,
    fontWeight: "600",
  },
  centeredText: {
    color: colors.faint,
    fontSize: 13,
  },
  newSessionDock: {
    position: "absolute",
    left: spacing[5],
    right: spacing[5],
  },
  newSessionButton: {
    height: 46,
    borderRadius: radius.full,
    backgroundColor: colors.foreground,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  newSessionButtonDisabled: {
    opacity: 0.5,
  },
  newSessionButtonPressed: {
    opacity: 0.85,
  },
  newSessionLabel: {
    color: colors.background,
    fontSize: 15,
    fontWeight: "600",
  },
});
