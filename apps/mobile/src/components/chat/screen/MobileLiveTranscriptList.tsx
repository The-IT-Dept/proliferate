import { useEffect, useRef } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";

import type { TranscriptRowViewModel } from "../../../lib/domain/chat/mobile-live-transcript-view";
import { focusedInteractionRowIndex } from "../../../lib/domain/chat/mobile-chat-interaction-focus";
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
  /**
   * Push subsystem Task 6 — the `requestId` carried in from a push/deep
   * link tap (`MobileCloudChat.initialInteractionRequestId`, threaded down
   * by `MobileChatScreen`). When the matching interaction-card row shows up
   * in `rows` (`focusedInteractionRowIndex`, pure/tested), this list
   * scrolls to it once. `null`/no match (e.g. the interaction is still
   * streaming in) is a graceful no-op, not an error.
   */
  focusRequestId?: string | null;
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
  focusRequestId,
}: MobileLiveTranscriptListProps) {
  const listRef = useRef<FlatList<TranscriptRowViewModel>>(null);
  // Latches on the requestId once scrolled-to so a later, unrelated `rows`
  // update (the transcript re-renders often while streaming) doesn't yank
  // the list back to the same card repeatedly or fight the user's own
  // scrolling. A new `focusRequestId` (a different push tap opening the
  // same workspace) clears the latch naturally since the comparison is
  // against its own value, not a boolean.
  const focusedRequestIdRef = useRef<string | null>(null);
  // Mirrors `rows` for the `onScrollToIndexFailed` retry's `setTimeout`
  // below, which reads it 50ms after the failure. A plain closure over
  // `rows` would only see the count as of the failure, not as of the retry —
  // and the deep-linked pending-interaction card is appended last and
  // removed the instant it's resolved/superseded, so `rows` can shrink
  // within that window. Kept in sync unconditionally every render (no
  // `useEffect`) so the retry always reads the true current count.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => {
    if (!focusRequestId || focusedRequestIdRef.current === focusRequestId) {
      return;
    }
    const index = focusedInteractionRowIndex(rows, focusRequestId);
    if (index === null) {
      // Not present yet — the interaction may still be streaming in. Leave
      // the latch unset so the next `rows` update (new transcript event)
      // gets another chance.
      return;
    }
    focusedRequestIdRef.current = focusRequestId;
    requestAnimationFrame(() => {
      try {
        listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0.3 });
      } catch {
        // Best-effort — a mid-flight layout pass can make scrollToIndex
        // throw; onScrollToIndexFailed below covers the common case
        // (unmeasured rows), this guards anything it doesn't.
      }
    });
  }, [rows, focusRequestId]);

  return (
    <FlatList
      ref={listRef}
      style={styles.list}
      contentContainerStyle={[styles.content, { paddingBottom: spacing[3] + composerDockInset }]}
      keyboardShouldPersistTaps="handled"
      data={rows}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <MobileLiveTranscriptRow row={item} interactionActions={interactionActions} />
      )}
      onScrollToIndexFailed={(info) => {
        // FlatList can't jump straight to an index it hasn't measured yet
        // (variable-height rows, no getItemLayout) — scroll to the best
        // estimate first, then retry once layout has caught up.
        listRef.current?.scrollToOffset({
          offset: info.averageItemLength * info.index,
          animated: false,
        });
        setTimeout(() => {
          // `scrollToIndex` throws a synchronous invariant when
          // `index >= getItemCount(data)` (or the list is now empty) —
          // bounds-check against the current row count (see `rowsRef`
          // above) and swallow the throw defensively, mirroring the
          // primary `scrollToIndex` call's try/catch above.
          if (info.index >= rowsRef.current.length) {
            return;
          }
          try {
            listRef.current?.scrollToIndex({ index: info.index, animated: true });
          } catch {
            // Best-effort — see the primary scrollToIndex catch above.
          }
        }, 50);
      }}
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
