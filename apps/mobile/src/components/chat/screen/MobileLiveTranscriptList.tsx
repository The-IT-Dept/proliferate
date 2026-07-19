import { FlatList, StyleSheet, Text, View } from "react-native";

import type { TranscriptRowViewModel } from "../../../lib/domain/chat/mobile-live-transcript-view";
import type { MobileChatInteractionActions } from "../../../hooks/chat/workflows/use-mobile-chat-interaction-actions";
import { MobileLiveTranscriptRow } from "./MobileLiveTranscriptRow";
import { colors, radius, spacing } from "../../../styles/tokens";

interface MobileLiveTranscriptListProps {
  rows: readonly TranscriptRowViewModel[];
  emptyTitle: string;
  emptyBody: string;
  interactionActions: MobileChatInteractionActions;
  /**
   * Group E2 carryover — the sticky composer dock's rendered footprint
   * (its own measured height plus the bottom safe-area inset it sits
   * above when closed: `KeyboardStickyView offset.closed`). Reserved as
   * extra bottom content padding so the dock — which floats/translates
   * over the transcript rather than resizing it (see
   * `MobileChatScreen`'s `KeyboardStickyView` comment) — can never cover
   * the last transcript row, keyboard open or closed. The dock's own
   * screen-space footprint doesn't change with the keyboard (only its Y
   * position does, to stay glued above it), so one measured value covers
   * both states.
   */
  composerDockInset: number;
}

/**
 * Group E1's primary transcript view — a `FlatList` over the live,
 * streamed `TranscriptState` (via `useSessionTranscriptStream` +
 * `buildLiveTranscriptRows`), replacing the old polling-fed
 * `MobileChatTranscript`/`CloudChatTranscriptRowView` list for the read
 * path.
 *
 * Insets: this list does not add its own top offset. `MobileChatScreen`'s
 * root `KeyboardAvoidingView` already applies `paddingTop: topInset` (the
 * shell's header + floating chrome height) to the whole screen, and the
 * composer sits below this list as a flex sibling, so it naturally clears
 * the keyboard/home-indicator the same way the transcript it replaces did —
 * re-adding either offset here would double it. The bottom side is
 * different: see `composerDockInset` above.
 */
export function MobileLiveTranscriptList({
  rows,
  emptyTitle,
  emptyBody,
  interactionActions,
  composerDockInset,
}: MobileLiveTranscriptListProps) {
  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={[styles.content, { paddingBottom: spacing[3] + composerDockInset }]}
      keyboardShouldPersistTaps="handled"
      data={rows}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <MobileLiveTranscriptRow row={item} interactionActions={interactionActions} />
      )}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{emptyTitle}</Text>
          <Text style={styles.emptyBody}>{emptyBody}</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  content: {
    padding: spacing[4],
    gap: spacing[3],
  },
  empty: {
    padding: spacing[4],
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderLight,
    borderStyle: "dashed",
  },
  emptyTitle: {
    color: colors.fg,
    fontSize: 15,
    fontWeight: "600",
  },
  emptyBody: {
    marginTop: 4,
    color: colors.faint,
    fontSize: 13,
    lineHeight: 18,
  },
});
