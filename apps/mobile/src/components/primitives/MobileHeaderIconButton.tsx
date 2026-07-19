import { Pressable, StyleSheet } from "react-native";

import { colors, radius } from "../../styles/tokens";
import { MobileIcon, type MobileIconName } from "./MobileIcon";

interface MobileHeaderIconButtonProps {
  name: MobileIconName;
  accessibilityLabel: string;
  onPress?: () => void;
  disabled?: boolean;
}

/**
 * A tappable icon sized for a native header's `headerLeft`/`headerRight`
 * slot (`Stack.Screen options` - see the `(tabs)/*​/index.tsx` routes and
 * `MobileChatHeaderActions`). Replaces `MobileTopBarIconButton` now that
 * headers are Expo Router's native chrome rather than a hand-drawn bar.
 */
export function MobileHeaderIconButton({
  name,
  accessibilityLabel,
  onPress,
  disabled = false,
}: MobileHeaderIconButtonProps) {
  const isDisabled = disabled || !onPress;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.button,
        pressed && styles.pressed,
        isDisabled && styles.disabled,
      ]}
    >
      <MobileIcon name={name} size={20} color={colors.fg} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
  },
  pressed: {
    opacity: 0.55,
    backgroundColor: colors.accent,
  },
  disabled: {
    opacity: 0.42,
  },
});
