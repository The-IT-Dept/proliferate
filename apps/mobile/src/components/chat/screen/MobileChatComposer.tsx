import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { AvailableSessionCommand } from "@anyharness/sdk";
import type { ComposerActionMode } from "../../../lib/domain/chat/mobile-chat-composer-state";
import {
  detectComposerTrigger,
  replaceComposerTrigger,
} from "../../../lib/domain/chat/composer/mobile-composer-triggers";
import { formatMarkdownFileLink } from "../../../lib/domain/chat/composer/mobile-composer-mention-format";
import {
  filterMobileRunnableSessionSlashCommands,
  matchMobileSlashCommandQuery,
  type MobileSlashCommandViewModel,
} from "../../../lib/domain/chat/composer/mobile-composer-slash-commands";
import {
  useMobileFileMentionSearch,
  type MobileFileMentionSearchResult,
} from "../../../hooks/chat/ui/use-mobile-file-mention-search";
import { MobileComposerPickerTray } from "./MobileComposerPickerTray";
import { MobileIcon } from "../../primitives/MobileIcon";
import { MobileTextInput } from "../../primitives/MobileTextInput";
import { colors, radius, spacing } from "../../../styles/tokens";

interface MobileChatComposerProps {
  draft: string;
  placeholder: string;
  controlLabel: string;
  controlPending: boolean;
  canSubmit: boolean;
  actionMode: ComposerActionMode;
  actionLabel: string;
  isEditing: boolean;
  keyboardInset: number;
  onChangeDraft: (value: string) => void;
  onOpenSettings: () => void;
  onSubmit: () => void;
  onCancelEdit: () => void;
  /** Row 23 — the active session's live ACP command list
   * (`transcript.availableCommands`, Group E1). There is no static catalog:
   * this is whatever the connected agent (Claude Code / Codex / ...)
   * reports it knows about right now. */
  availableCommands: readonly AvailableSessionCommand[];
  /** Row 23 — scopes the @mention file search
   * (`useSearchWorkspaceFilesQuery`) to this workspace. `null` while the
   * workspace hasn't resolved yet, matching the same optionality every other
   * `sdk-react` query in this screen already threads through. */
  workspaceId: string | null;
  /** The same "is the AnyHarness runtime actually up" gate
   * `MobileChatScreen` already computes for the composer itself
   * (`workspaceCommandReady`) — file search can't resolve anything before
   * the workspace runtime is ready either. */
  runtimeReady: boolean;
}

/**
 * Group E2 — the primary action button swaps between send / queue / stop /
 * save (see `deriveComposerAction`, `mobile-chat-composer-state.ts`) rather
 * than always being "Send", mirroring the web's `ChatComposerActions.tsx`:
 * a running session with a draft still sends (the runtime queues it), an
 * empty draft while running offers Stop instead of a disabled Send, and
 * editing a queued message takes the button over as Save regardless of run
 * state. `actionLabel` carries the verbatim copy so accessibility and any
 * on-screen label stay in lockstep with the actual behavior.
 *
 * Row 23 (parity map) — slash-command + @mention pickers. Caret tracking is
 * local (`selection` state via `MobileTextInput`'s `onSelectionChange`);
 * mobile's draft is a flat string (no rich draft-node model — see
 * `mobile-composer-triggers.ts`'s module doc), so the trigger detector only
 * needs `draft` + the caret offset, mirroring how web's `ComposerCommandEditor`
 * reads `textareaRef.current.selectionStart`. Selecting a row calls
 * `replaceComposerTrigger` and applies both the new draft text and the new
 * caret position in the same handler (same tick, no extra effect needed —
 * React batches them before the next render).
 */
export function MobileChatComposer({
  draft,
  placeholder,
  controlLabel,
  controlPending,
  canSubmit,
  actionMode,
  actionLabel,
  isEditing,
  keyboardInset,
  onChangeDraft,
  onOpenSettings,
  onSubmit,
  onCancelEdit,
  availableCommands,
  workspaceId,
  runtimeReady,
}: MobileChatComposerProps) {
  const actionIcon = actionMode === "stop" ? "stop" : actionMode === "save" ? "check" : "send";
  const [selection, setSelection] = useState({ start: draft.length, end: draft.length });
  // Clamp rather than resync via effect: an externally-driven draft change
  // (submit clearing it, the queue-edit banner swapping in different text)
  // just needs the selection kept in-bounds for this render — see the
  // component doc for why a full draft-change effect isn't needed for our
  // own programmatic insertions.
  const caret = Math.min(selection.start, draft.length);

  const trigger = useMemo(() => detectComposerTrigger(draft, caret), [draft, caret]);

  const slashCommands = useMemo(() => {
    if (trigger?.kind !== "slash") {
      return [];
    }
    return filterMobileRunnableSessionSlashCommands(availableCommands)
      .filter((command) => matchMobileSlashCommandQuery(command, trigger.query));
  }, [availableCommands, trigger]);

  const mentionSearch = useMobileFileMentionSearch({
    open: trigger?.kind === "mention",
    workspaceId,
    runtimeReady,
    query: trigger?.kind === "mention" ? trigger.query : "",
  });

  function applyTriggerReplacement(replacement: string) {
    if (!trigger) {
      return;
    }
    const result = replaceComposerTrigger(draft, trigger, replacement);
    onChangeDraft(result.text);
    setSelection({ start: result.caret, end: result.caret });
  }

  function selectSlashCommand(command: MobileSlashCommandViewModel) {
    applyTriggerReplacement(command.displayName);
  }

  function selectMentionFile(file: MobileFileMentionSearchResult) {
    applyTriggerReplacement(formatMarkdownFileLink(file.name, file.path));
  }

  const pickerState = trigger?.kind === "slash"
    ? { kind: "slash" as const, commands: slashCommands }
    : trigger?.kind === "mention"
      ? {
        kind: "mention" as const,
        query: trigger.query,
        results: mentionSearch.results,
        isLoading: mentionSearch.isLoading,
        isError: mentionSearch.isError,
      }
      : null;

  return (
    <View style={[styles.composer, keyboardInset > 0 && { marginBottom: keyboardInset }]}>
      {pickerState ? (
        <MobileComposerPickerTray
          state={pickerState}
          onSelectCommand={selectSlashCommand}
          onSelectFile={selectMentionFile}
        />
      ) : null}
      <View style={styles.composerCard}>
        {isEditing ? (
          <View style={styles.editingBanner}>
            <Text style={styles.editingBannerText}>Editing queued message</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel edit"
              onPress={onCancelEdit}
              hitSlop={8}
            >
              <Text style={styles.editingBannerCancel}>Cancel</Text>
            </Pressable>
          </View>
        ) : null}
        <MobileTextInput
          multiline
          value={draft}
          onChangeText={onChangeDraft}
          // Controlled selection: needed so `selectSlashCommand`/
          // `selectMentionFile` can actually move the native cursor to just
          // after the inserted text, not only update `value`. Device note
          // (flagged, not device-verified): fully-controlled `selection` on
          // a multiline RN TextInput is the standard pattern for this, but
          // has known minor jank on some Android versions while typing fast
          // — acceptable here since we only ever *set* it away from the
          // native echo on our own programmatic insertions.
          selection={selection}
          onSelectionChange={(event) => setSelection(event.nativeEvent.selection)}
          placeholder={placeholder}
          style={styles.composerInput}
        />
        <View style={styles.composerFooter}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open chat settings"
            onPress={onOpenSettings}
            style={({ pressed }) => [
              styles.configLink,
              controlPending && styles.configLinkPending,
              pressed && styles.configLinkPressed,
            ]}
          >
            <Text style={styles.configLinkText} numberOfLines={1}>
              {controlLabel}
            </Text>
            <MobileIcon name="chevron-down" size={10} color={colors.faint} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={actionLabel}
            accessibilityState={{ disabled: !canSubmit }}
            disabled={!canSubmit}
            onPress={onSubmit}
            style={({ pressed }) => [
              styles.send,
              !canSubmit && styles.sendDisabled,
              pressed && styles.sendPressed,
            ]}
          >
            <MobileIcon name={actionIcon} size={18} color={canSubmit ? colors.background : colors.faint} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  composer: {
    paddingHorizontal: spacing[3],
    paddingTop: spacing[2],
    paddingBottom: spacing[3],
    backgroundColor: colors.background,
  },
  composerCard: {
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[3],
    gap: spacing[2],
  },
  editingBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[2],
  },
  editingBannerText: {
    color: colors.faint,
    fontSize: 12,
    fontWeight: "600",
  },
  editingBannerCancel: {
    color: colors.info,
    fontSize: 12,
    fontWeight: "600",
  },
  composerInput: {
    minHeight: 23,
    maxHeight: 200,
    borderWidth: 0,
    backgroundColor: "transparent",
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
    color: colors.fg,
    fontSize: 17,
    lineHeight: 23,
  },
  composerFooter: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[2],
  },
  configLink: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "82%",
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.md,
    paddingHorizontal: 2,
    paddingVertical: 0,
  },
  configLinkPending: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing[2],
  },
  configLinkPressed: {
    opacity: 0.82,
  },
  configLinkText: {
    flexShrink: 1,
    minWidth: 0,
    color: colors.mutedForeground,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "400",
    includeFontPadding: false,
  },
  send: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
    backgroundColor: colors.fg,
  },
  sendDisabled: {
    backgroundColor: colors.accent,
  },
  sendPressed: {
    opacity: 0.85,
  },
});
