import { Platform, StyleSheet, Text, View } from "react-native";

import type { TranscriptRowViewModel } from "../../../lib/domain/chat/mobile-live-transcript-view";
import type { MobileChatInteractionActions } from "../../../hooks/chat/workflows/use-mobile-chat-interaction-actions";
import { MobileMarkdownText } from "../MobileMarkdownText";
import { colors, radius, spacing } from "../../../styles/tokens";
import { MobilePermissionInteractionCard } from "./interactions/MobilePermissionInteractionCard";
import { MobileUserInputInteractionCard } from "./interactions/MobileUserInputInteractionCard";
import { MobileMcpElicitationInteractionCard } from "./interactions/MobileMcpElicitationInteractionCard";

interface MobileLiveTranscriptRowProps {
  row: TranscriptRowViewModel;
  interactionActions: MobileChatInteractionActions;
}

/**
 * Group E1/E3 — renders one `TranscriptRowViewModel` (see
 * `mobile-live-transcript-view.ts` for the pure mapping this consumes).
 * Every row body is opaque (`colors.card`/plain text) — glass is
 * control-layer only per the plan's global constraint, not for transcript
 * content. The three interaction rows (`permission_interaction`/
 * `user_input_interaction`/`mcp_elicitation_interaction`) are the one
 * exception: real cards with buttons/fields, wired to
 * `interactionActions` (`useMobileChatInteractionActions`).
 */
export function MobileLiveTranscriptRow({ row, interactionActions }: MobileLiveTranscriptRowProps) {
  switch (row.kind) {
    case "user_message":
      return <UserMessageRow row={row} />;
    case "assistant_prose":
      return <AssistantProseRow row={row} />;
    case "thought":
      return <ThoughtRow row={row} />;
    case "tool_call":
      return <ToolCallRow row={row} />;
    case "plan":
      return <PlanRow row={row} />;
    case "proposed_plan":
      return <ProposedPlanRow row={row} />;
    case "error":
      return <ErrorRow row={row} />;
    case "permission_interaction":
      return (
        <MobilePermissionInteractionCard
          row={row}
          resolving={interactionActions.resolvingRequestId === row.requestId}
          onSelectOption={interactionActions.resolvePermissionOption}
          onDecision={interactionActions.resolvePermissionDecision}
        />
      );
    case "user_input_interaction":
      return (
        <MobileUserInputInteractionCard
          key={row.requestId}
          row={row}
          resolving={interactionActions.resolvingRequestId === row.requestId}
          onSubmit={interactionActions.submitUserInput}
          onCancel={interactionActions.cancelUserInput}
        />
      );
    case "mcp_elicitation_interaction":
      return (
        <MobileMcpElicitationInteractionCard
          key={row.requestId}
          row={row}
          resolving={interactionActions.resolvingRequestId === row.requestId}
          onAccept={interactionActions.acceptMcpElicitation}
          onDecline={interactionActions.declineMcpElicitation}
          onCancel={interactionActions.cancelMcpElicitation}
          onRevealUrl={interactionActions.revealMcpElicitationUrl}
        />
      );
    default:
      // Exhaustiveness fallback: a component returning `undefined` (rather
      // than `null`) throws. `row.kind` is exhaustively typed today, but a
      // malformed/future row shape reaching here at runtime shouldn't crash
      // the transcript — render nothing for it instead.
      return null;
  }
}

function UserMessageRow({ row }: { row: Extract<TranscriptRowViewModel, { kind: "user_message" }> }) {
  if (!row.text.trim() && !row.isStreaming) {
    return null;
  }
  return (
    <View style={styles.userRow}>
      <View style={styles.userBubble}>
        <Text style={styles.userBubbleText}>{row.text || "…"}</Text>
      </View>
    </View>
  );
}

function AssistantProseRow({
  row,
}: {
  row: Extract<TranscriptRowViewModel, { kind: "assistant_prose" }>;
}) {
  if (!row.text.trim()) {
    return row.isStreaming ? (
      <View style={styles.assistantRow}>
        <Text style={styles.streamingIndicator}>…</Text>
      </View>
    ) : null;
  }
  return (
    <View style={styles.assistantRow}>
      <MobileMarkdownText content={row.text} />
      {row.isStreaming ? <Text style={styles.streamingIndicator}>▍</Text> : null}
    </View>
  );
}

function ThoughtRow({ row }: { row: Extract<TranscriptRowViewModel, { kind: "thought" }> }) {
  if (!row.text.trim()) {
    return null;
  }
  return (
    <View style={styles.thoughtRow}>
      <Text style={styles.thoughtLabel}>Reasoning</Text>
      <Text style={styles.thoughtText}>{row.text}</Text>
    </View>
  );
}

function ToolCallRow({ row }: { row: Extract<TranscriptRowViewModel, { kind: "tool_call" }> }) {
  return (
    <View style={styles.toolCard}>
      <View style={styles.toolHeaderRow}>
        <Text style={styles.toolTitle} numberOfLines={1}>{row.title}</Text>
        <Text style={styles.toolStatus}>{formatStatus(row.status)}</Text>
      </View>
      {row.hint ? <Text style={styles.toolHint} numberOfLines={1}>{row.hint}</Text> : null}
      {row.summaryLines.map((line, index) => (
        <Text key={index} style={styles.toolSummaryLine} numberOfLines={3}>{line}</Text>
      ))}
    </View>
  );
}

function PlanRow({ row }: { row: Extract<TranscriptRowViewModel, { kind: "plan" }> }) {
  return (
    <View style={styles.planCard}>
      {row.entries.map((entry, index) => (
        <View key={index} style={styles.planEntryRow}>
          <Text style={styles.planEntryStatus}>{formatStatus(entry.status)}</Text>
          <Text style={styles.planEntryContent}>{entry.content}</Text>
        </View>
      ))}
    </View>
  );
}

function ProposedPlanRow({
  row,
}: {
  row: Extract<TranscriptRowViewModel, { kind: "proposed_plan" }>;
}) {
  return (
    <View style={styles.planCard}>
      <View style={styles.toolHeaderRow}>
        <Text style={styles.toolTitle} numberOfLines={1}>{row.title}</Text>
        <Text style={styles.toolStatus}>{formatStatus(row.decisionState)}</Text>
      </View>
      <MobileMarkdownText content={row.bodyMarkdown} />
    </View>
  );
}

function ErrorRow({ row }: { row: Extract<TranscriptRowViewModel, { kind: "error" }> }) {
  return (
    <View style={styles.errorCard}>
      {row.code ? <Text style={styles.errorCode}>{row.code}</Text> : null}
      <Text style={styles.errorMessage}>{row.message}</Text>
    </View>
  );
}

function formatStatus(status: string): string {
  // Defends against a malformed plan-entry/tool-call payload (e.g. a
  // reducer bug or an unexpected server shape) handing this a
  // non-string/undefined `status` — `.replace` would otherwise throw and
  // take the whole transcript row down with it.
  if (typeof status !== "string") {
    return "";
  }
  return status.replace(/_/g, " ");
}

const styles = StyleSheet.create({
  userRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingLeft: spacing[6],
  },
  userBubble: {
    maxWidth: "92%",
    borderRadius: 20,
    backgroundColor: colors.card,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  userBubbleText: {
    color: colors.fg,
    fontSize: 15,
    lineHeight: 21,
  },
  assistantRow: {
    paddingRight: spacing[4],
    gap: 4,
  },
  streamingIndicator: {
    color: colors.faint,
    fontSize: 15,
  },
  thoughtRow: {
    paddingRight: spacing[4],
    gap: 2,
  },
  thoughtLabel: {
    color: colors.faint,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  thoughtText: {
    color: colors.faint,
    fontSize: 13.5,
    lineHeight: 19,
    fontStyle: "italic",
  },
  toolCard: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
    backgroundColor: colors.card,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    gap: 3,
  },
  toolHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[2],
  },
  toolTitle: {
    flexShrink: 1,
    minWidth: 0,
    color: colors.fg,
    fontSize: 14.5,
    fontWeight: "600",
  },
  toolStatus: {
    color: colors.faint,
    fontSize: 12,
    textTransform: "capitalize",
  },
  toolHint: {
    color: colors.faint,
    fontSize: 12.5,
  },
  toolSummaryLine: {
    color: colors.mutedText,
    fontSize: 12.5,
    lineHeight: 17,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  planCard: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
    backgroundColor: colors.card,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    gap: 6,
  },
  planEntryRow: {
    flexDirection: "row",
    gap: spacing[2],
  },
  planEntryStatus: {
    color: colors.faint,
    fontSize: 12,
    textTransform: "capitalize",
    minWidth: 72,
  },
  planEntryContent: {
    flex: 1,
    color: colors.fg,
    fontSize: 14,
    lineHeight: 19,
  },
  errorCard: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.red,
    backgroundColor: colors.card,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    gap: 2,
  },
  errorCode: {
    color: colors.red,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  errorMessage: {
    color: colors.fg,
    fontSize: 14,
    lineHeight: 19,
  },
});
