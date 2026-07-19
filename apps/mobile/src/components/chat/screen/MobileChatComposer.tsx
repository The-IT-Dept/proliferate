import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ComposerActionMode } from "../../../lib/domain/chat/mobile-chat-composer-state";
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
}: MobileChatComposerProps) {
  const actionIcon = actionMode === "stop" ? "stop" : actionMode === "save" ? "check" : "send";
  return (
    <View style={[styles.composer, keyboardInset > 0 && { marginBottom: keyboardInset }]}>
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
