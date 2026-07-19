import { FlatList, StyleSheet, Text, View } from "react-native";

import type { TranscriptRowViewModel } from "../../../lib/domain/chat/mobile-live-transcript-view";
import { MobileLiveTranscriptRow } from "./MobileLiveTranscriptRow";
import { colors, radius, spacing } from "../../../styles/tokens";

interface MobileLiveTranscriptListProps {
  rows: readonly TranscriptRowViewModel[];
  emptyTitle: string;
  emptyBody: string;
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
 * re-adding either offset here would double it.
 */
export function MobileLiveTranscriptList({
  rows,
  emptyTitle,
  emptyBody,
}: MobileLiveTranscriptListProps) {
  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      data={rows}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <MobileLiveTranscriptRow row={item} />}
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
    paddingBottom: spacing[5],
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
