import { Pressable, StyleSheet, Text, View } from "react-native";

import { formatSessionCount } from "../../../lib/domain/chat/mobile-chat-presentation";
import { colors, radius, spacing } from "../../../styles/tokens";
import { MobileHeaderIconButton } from "../../primitives/MobileHeaderIconButton";
import { MobileIcon } from "../../primitives/MobileIcon";

interface MobileChatHeaderActionsProps {
  sessionsCount: number;
  unclaimed: boolean;
  onOpenSessions: () => void;
  onOpenActions: () => void;
}

/**
 * The workspace route's native `headerRight` content
 * (`app/workspace/[id].tsx`, via `MobileChatScreen`) - a session-count pill
 * plus an ellipsis when sessions exist, a single ellipsis button otherwise.
 * Extracted verbatim from the deleted `MobileChatHeader`/`MobileTopBar`
 * (hand-drawn chrome); now rendered inside Expo Router's native header
 * instead of a custom bar.
 */
export function MobileChatHeaderActions({
  sessionsCount,
  unclaimed,
  onOpenSessions,
  onOpenActions,
}: MobileChatHeaderActionsProps) {
  if (sessionsCount === 0) {
    return (
      <MobileHeaderIconButton name="more" accessibilityLabel="Workspace actions" onPress={onOpenActions} />
    );
  }

  return (
    <View style={styles.group}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Switch sessions. ${formatSessionCount(sessionsCount)}.`}
        disabled={unclaimed}
        onPress={onOpenSessions}
        style={({ pressed }) => [
          styles.sessionCountButton,
          unclaimed && styles.sessionCountButtonDisabled,
          pressed && !unclaimed && styles.pressed,
        ]}
      >
        <MobileIcon name="sessions" size={14} color={colors.faint} />
        <Text style={styles.sessionCountText}>{sessionsCount}</Text>
      </Pressable>
      <View style={styles.divider} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Workspace actions"
        onPress={onOpenActions}
        style={({ pressed }) => [styles.dotsButton, pressed && styles.pressed]}
      >
        <MobileIcon name="more" size={18} color={colors.fg} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.accent,
  },
  sessionCountButton: {
    height: 32,
    minWidth: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingHorizontal: spacing[2],
  },
  sessionCountButtonDisabled: {
    opacity: 0.48,
  },
  sessionCountText: {
    color: colors.fg,
    fontSize: 12,
    fontWeight: "700",
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 18,
    backgroundColor: colors.border,
  },
  dotsButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.68,
  },
});
