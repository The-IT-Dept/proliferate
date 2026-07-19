import { Platform, StyleSheet, Text, View } from "react-native";

import type { TranscriptRowViewModel } from "../../../lib/domain/chat/mobile-live-transcript-view";
import {
  resolveProposedPlanDecisionActions,
  resolveProposedPlanDecisionStatus,
  resolveProposedPlanFailureMessage,
  shouldShowProposedPlanDecisionChip,
} from "../../../lib/domain/chat/mobile-proposed-plan-decision";
import type { MobileChatInteractionActions } from "../../../hooks/chat/workflows/use-mobile-chat-interaction-actions";
import type { MobilePlanDecisionActions } from "../../../hooks/chat/workflows/use-mobile-plan-decision-actions";
import { MobileMarkdownText } from "../MobileMarkdownText";
import { colors, radius, spacing } from "../../../styles/tokens";
import { MobilePermissionInteractionCard } from "./interactions/MobilePermissionInteractionCard";
import { MobileUserInputInteractionCard } from "./interactions/MobileUserInputInteractionCard";
import { MobileMcpElicitationInteractionCard } from "./interactions/MobileMcpElicitationInteractionCard";
import { MobileInteractionCardFooter } from "./interactions/MobileInteractionCardShell";

interface MobileLiveTranscriptRowProps {
  row: TranscriptRowViewModel;
  interactionActions: MobileChatInteractionActions;
  planDecisionActions: MobilePlanDecisionActions;
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
export function MobileLiveTranscriptRow({
  row,
  interactionActions,
  planDecisionActions,
}: MobileLiveTranscriptRowProps) {
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
    case "proposed_plan": {
      const isDecidingThisPlan = planDecisionActions.decidingPlanId === row.planId;
      return (
        <ProposedPlanRow
          row={row}
          deciding={isDecidingThisPlan}
          approving={isDecidingThisPlan && planDecisionActions.decidingAction === "approve"}
          rejecting={isDecidingThisPlan && planDecisionActions.decidingAction === "reject"}
          onApprove={planDecisionActions.approvePlan}
          onReject={planDecisionActions.rejectPlan}
        />
      );
    }
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

/**
 * Row 20 — mirrors web's `ProposedPlanCard.tsx`: a status chip (fixed
 * Title-case vocabulary, verbatim from `resolveProposedPlanDecisionStatus`,
 * shown only once `shouldShowProposedPlanDecisionChip` is true — Fix 1,
 * reviewer finding: no chip while the plan body is still streaming and no
 * decision has arrived yet) plus, while a decision is actionable, an
 * Approve/Reject footer (reusing the shared interaction-card footer — same
 * secondary-left/primary-right layout as the permission/user_input/mcp
 * elicitation cards, not a forked one-off). A native-continuation failure
 * gets its own destructive note line under the header, matching web.
 *
 * Fix 2 (reviewer finding): `deciding` alone used to drive `busy` on the
 * Approve button, so tapping Reject wrongly flipped Approve into its
 * "Sending" state. `approving`/`rejecting` (derived from the hook's
 * `decidingAction`, one call site up) now drive each button from its own
 * in-flight action; `deciding` (either action in flight) still drives the
 * shared `disabled` double-tap guard on both buttons. The shared footer
 * shell only swaps a *primary* button's label to "Sending" while busy
 * (`MobileInteractionCardShell.tsx`) — there's no secondary-button busy
 * affordance there for Reject to plug into (every other card's secondary
 * actions are still just plain taps), so Reject's own progress reuses that
 * same "Sending" word via its label here rather than growing the shared
 * shell's contract for this one caller.
 */
function ProposedPlanRow({
  row,
  deciding,
  approving,
  rejecting,
  onApprove,
  onReject,
}: {
  row: Extract<TranscriptRowViewModel, { kind: "proposed_plan" }>;
  deciding: boolean;
  approving: boolean;
  rejecting: boolean;
  onApprove: (planId: string, decisionVersion: number) => void;
  onReject: (planId: string, decisionVersion: number) => void;
}) {
  const status = resolveProposedPlanDecisionStatus(row);
  const actions = resolveProposedPlanDecisionActions(row);
  const failureMessage = resolveProposedPlanFailureMessage(row);
  const decisionVersion = row.decisionVersion;
  const showStatusChip = shouldShowProposedPlanDecisionChip(decisionVersion);

  return (
    <View style={styles.planCard}>
      <View style={styles.toolHeaderRow}>
        <Text style={styles.toolTitle} numberOfLines={1}>{row.title}</Text>
        {showStatusChip ? (
          <Text style={[styles.planStatusLabel, planStatusToneStyle(status.tone)]}>{status.label}</Text>
        ) : null}
      </View>
      <MobileMarkdownText content={row.bodyMarkdown} />
      {failureMessage ? <Text style={styles.planFailureMessage}>{failureMessage}</Text> : null}
      {decisionVersion !== null && (actions.canApprove || actions.canReject) ? (
        <MobileInteractionCardFooter
          disabled={deciding}
          secondaryActions={actions.canReject
            ? [{ label: rejecting ? "Sending" : "Reject", onPress: () => onReject(row.planId, decisionVersion) }]
            : []}
          primaryAction={actions.canApprove
            ? { label: "Approve", onPress: () => onApprove(row.planId, decisionVersion), busy: approving }
            : undefined}
        />
      ) : null}
    </View>
  );
}

function planStatusToneStyle(tone: ReturnType<typeof resolveProposedPlanDecisionStatus>["tone"]) {
  switch (tone) {
    case "warning":
      return { color: colors.warning };
    case "destructive":
      return { color: colors.red };
    case "muted":
      return { color: colors.mutedText };
    case "neutral":
    default:
      return { color: colors.fg };
  }
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
  // Row 20 — no `textTransform` (unlike `toolStatus`/`planEntryStatus`
  // above): the decision-state label is verbatim Title-case copy from
  // `resolveProposedPlanDecisionStatus` ("Awaiting approval", not
  // "Awaiting Approval"), not a raw status enum needing case-normalizing.
  planStatusLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  planFailureMessage: {
    color: colors.red,
    fontSize: 12.5,
    lineHeight: 17,
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
