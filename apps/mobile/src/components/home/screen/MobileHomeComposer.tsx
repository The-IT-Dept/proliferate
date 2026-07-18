import { Pressable, StyleSheet, Text, View } from "react-native";
import { GlassSurface } from "@proliferate/design/glass";

import { colors, radius, spacing } from "../../../styles/tokens";
import { MobileIcon } from "../../primitives/MobileIcon";
import { MobileTextInput } from "../../primitives/MobileTextInput";

/**
 * The Home composer (mockups.html frame A) — draft field plus a control
 * dock (config summary + send). The card itself is opaque content (frame A
 * renders it as `.card`, no blur); the control row is the one glass element
 * here (design-system.md §3.2 "Composer dock" → `GlassSurface
 * variant="dock"`), a true capsule housing the config link and the send
 * button — the shape `dock` is built for (§6 "Capsule ... height / 2"),
 * unlike the card's own variable, multi-line height. Repo/branch target
 * selection lives one level up in MobileHomeScreen as the pill row above
 * this card.
 */
export function MobileHomeComposer({
  draft,
  configLabel,
  configPending,
  canSubmit,
  onDraftChange,
  onOpenConfig,
  onSubmit,
}: {
  draft: string;
  configLabel: string;
  configPending: boolean;
  canSubmit: boolean;
  onDraftChange: (value: string) => void;
  onOpenConfig: () => void;
  onSubmit: () => void;
}) {
  return (
    <View style={styles.composerCard}>
      <MobileTextInput
        multiline
        value={draft}
        onChangeText={onDraftChange}
        placeholder="Describe a task, @mention files, run /commands"
        style={styles.composerInput}
      />
      <GlassSurface variant="dock" style={styles.composerDock}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open chat settings"
          onPress={onOpenConfig}
          style={({ pressed }) => [
            styles.configLink,
            configPending && styles.configLinkPending,
            pressed && styles.configLinkPressed,
          ]}
        >
          <Text style={styles.configLinkText} numberOfLines={1}>
            {configLabel}
          </Text>
          <MobileIcon name="chevron-down" size={10} color={colors.faint} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: !canSubmit }}
          disabled={!canSubmit}
          onPress={onSubmit}
          style={({ pressed }) => [
            styles.send,
            !canSubmit && styles.sendDisabled,
            pressed && styles.sendPressed,
          ]}
        >
          <MobileIcon name="send" size={18} color={canSubmit ? colors.background : colors.faint} />
        </Pressable>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  composerCard: {
    borderRadius: 26,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[3],
    gap: spacing[3],
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
  composerDock: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[2],
    paddingHorizontal: spacing[2],
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
    paddingHorizontal: spacing[2],
  },
  configLinkPending: {
    backgroundColor: colors.accent,
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
    width: 36,
    height: 36,
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
