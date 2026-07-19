import { Pressable, StyleSheet, Text, View } from "react-native";
import type { PendingPromptQueueRow } from "@proliferate/product-domain/chats/pending-prompts/pending-prompt-queue";

import { MobileIcon } from "../../primitives/MobileIcon";
import { colors, radius, spacing } from "../../../styles/tokens";

interface MobileChatPendingPromptQueueProps {
  rows: readonly PendingPromptQueueRow[];
  steeringSeq: number | null;
  queueMutationInFlight: boolean;
  onBeginEdit: (row: PendingPromptQueueRow) => void;
  onDelete: (row: PendingPromptQueueRow) => void;
  onSteer: (row: PendingPromptQueueRow) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
}

/**
 * Group E2 — the runtime pending-prompt queue, docked directly above the
 * composer (mockup F's composer dock has no queue strip of its own; this
 * follows the same "quiet card above the input" placement the web uses,
 * `PendingPromptList.tsx`). Mirrors the web queue's operations — edit,
 * delete, steer ("send next — interrupts the current turn"), reorder — but
 * reorder is up/down buttons per row rather than a drag handle: mobile has
 * no drag surface here, so this exposes the same neighbor-finding target
 * the web's keyboard (arrow-key) reorder fallback already uses instead of
 * inventing a new operation.
 *
 * Labels are verbatim from `PendingPromptList.tsx` (product-client):
 * "Send next — interrupts the current turn" / "Edit message" /
 * "Edit queued message" / "Remove from queue" / "Delete queued message" /
 * container aria-label "Queued messages".
 */
export function MobileChatPendingPromptQueue({
  rows,
  steeringSeq,
  queueMutationInFlight,
  onBeginEdit,
  onDelete,
  onSteer,
  onMoveUp,
  onMoveDown,
}: MobileChatPendingPromptQueueProps) {
  if (rows.length === 0) {
    return null;
  }

  const runtimeIndexes = rows.flatMap((row, index) => row.seq > 0 ? [index] : []);

  return (
    // Not `accessible` — a plain `accessibilityLabel` here would be a
    // silent no-op without it, but making the whole card one accessible
    // node would swallow the per-row buttons below into a single focus
    // stop. Each button below carries its own descriptive label instead
    // (matching the web's per-action aria-labels rather than one
    // region-level label).
    <View style={styles.card}>
      {rows.map((row, index) => {
        const runtimePosition = runtimeIndexes.indexOf(index);
        const canReorder =
          runtimePosition !== -1
          && runtimeIndexes.length > 1
          && !queueMutationInFlight;
        const isSteering = steeringSeq === row.seq;
        const showSteer = row.seq > 0 && !row.isBeingEdited && !row.isSending && !isSteering;
        const showEdit = row.showEditAction && !row.isBeingEdited && !row.isSending;
        const showDelete = row.showDeleteAction && (!row.isSending || row.canDelete);

        return (
          <View key={row.key} style={[styles.row, index > 0 && styles.rowBorder]}>
            <Text
              style={[styles.label, row.isBeingEdited && styles.labelEditing]}
              numberOfLines={2}
            >
              {row.label}
            </Text>
            {isSteering
              ? <Text style={styles.stateHint}>Steering…</Text>
              : row.isBeingEdited
                ? <Text style={styles.stateHint}>Editing…</Text>
                : row.isSending
                  ? <Text style={styles.stateHint}>Thinking</Text>
                  : (
                    <View style={styles.actions}>
                      {canReorder ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Move up in queue"
                          accessibilityState={{ disabled: runtimePosition <= 0 }}
                          disabled={runtimePosition <= 0}
                          onPress={() => onMoveUp(index)}
                          hitSlop={8}
                          style={({ pressed }) => [
                            styles.actionButton,
                            runtimePosition <= 0 && styles.actionButtonDisabled,
                            pressed && styles.actionButtonPressed,
                          ]}
                        >
                          <View style={styles.rotate180}>
                            <MobileIcon name="chevron-down" size={13} color={colors.faint} />
                          </View>
                        </Pressable>
                      ) : null}
                      {canReorder ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Move down in queue"
                          accessibilityState={{ disabled: runtimePosition >= runtimeIndexes.length - 1 }}
                          disabled={runtimePosition >= runtimeIndexes.length - 1}
                          onPress={() => onMoveDown(index)}
                          hitSlop={8}
                          style={({ pressed }) => [
                            styles.actionButton,
                            runtimePosition >= runtimeIndexes.length - 1 && styles.actionButtonDisabled,
                            pressed && styles.actionButtonPressed,
                          ]}
                        >
                          <MobileIcon name="chevron-down" size={13} color={colors.faint} />
                        </Pressable>
                      ) : null}
                      {showSteer ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Send next — interrupts the current turn"
                          accessibilityState={{ disabled: queueMutationInFlight }}
                          disabled={queueMutationInFlight}
                          onPress={() => onSteer(row)}
                          hitSlop={8}
                          style={({ pressed }) => [
                            styles.actionButton,
                            pressed && styles.actionButtonPressed,
                          ]}
                        >
                          <MobileIcon name="send" size={13} color={colors.faint} />
                        </Pressable>
                      ) : null}
                      {showEdit ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Edit queued message"
                          accessibilityState={{ disabled: !row.canEdit || queueMutationInFlight }}
                          disabled={!row.canEdit || queueMutationInFlight}
                          onPress={() => onBeginEdit(row)}
                          hitSlop={8}
                          style={({ pressed }) => [
                            styles.actionButton,
                            pressed && styles.actionButtonPressed,
                          ]}
                        >
                          <MobileIcon name="pencil" size={13} color={colors.faint} />
                        </Pressable>
                      ) : null}
                      {showDelete ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Delete queued message"
                          accessibilityState={{ disabled: !row.canDelete || queueMutationInFlight }}
                          disabled={!row.canDelete || queueMutationInFlight}
                          onPress={() => onDelete(row)}
                          hitSlop={8}
                          style={({ pressed }) => [
                            styles.actionButton,
                            pressed && styles.actionButtonPressed,
                          ]}
                        >
                          <MobileIcon name="close" size={13} color={colors.faint} />
                        </Pressable>
                      ) : null}
                    </View>
                  )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing[3],
    marginBottom: spacing[1],
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingVertical: spacing[2],
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  label: {
    flex: 1,
    minWidth: 0,
    color: colors.mutedForeground,
    fontSize: 13,
    lineHeight: 18,
  },
  labelEditing: {
    color: colors.faint,
  },
  stateHint: {
    flexShrink: 0,
    color: colors.faint,
    fontSize: 12,
    fontStyle: "italic",
  },
  actions: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  actionButton: {
    width: 26,
    height: 26,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonDisabled: {
    opacity: 0.35,
  },
  actionButtonPressed: {
    backgroundColor: colors.accent,
  },
  rotate180: {
    transform: [{ rotate: "180deg" }],
  },
});
