import { Pressable, StyleSheet, Text, View } from "react-native";
import { GlassSurface } from "@proliferate/design/glass";

import {
  TERMINAL_ACCESSORY_KEYS,
  type TerminalAccessoryKeyId,
  type TerminalAccessoryModifier,
} from "../../../lib/domain/terminal/terminal-accessory-keys";
import { colors, radius, spacing } from "../../../styles/tokens";

/**
 * F-build — the terminal keyboard accessory row (IA `Term (G)`: "glass
 * key-accessory row (esc ⇥ ⌃ ⌥ / – arrows)"; design-system.md §3.2
 * allowlist: "Floating controls | floating | ... keyboard accessory
 * (terminal: ⌃ ⌥ ⇥ esc arrows)"). Purely presentational — the byte mapping
 * lives in `lib/domain/terminal/terminal-accessory-keys.ts` (TDD'd) and the
 * sticky ctrl/alt modifier *state* is owned by the caller
 * (`MobileWorkspaceTerminalSegment`), since it also has to intercept the
 * *next* keystroke from the WebView's own `onInput`, not just taps on this
 * bar. `armedModifier` only ever reflects one of the two sticky keys here so
 * the caller can render the pressed/armed affordance.
 */
export interface MobileTerminalAccessoryBarProps {
  armedModifier: TerminalAccessoryModifier | null;
  onPressKey: (id: TerminalAccessoryKeyId) => void;
  disabled?: boolean;
}

export function MobileTerminalAccessoryBar({
  armedModifier,
  onPressKey,
  disabled = false,
}: MobileTerminalAccessoryBarProps) {
  return (
    <GlassSurface variant="fab" style={styles.surface}>
      <View style={styles.row}>
        {TERMINAL_ACCESSORY_KEYS.map((key) => {
          const armed = key.sticky && armedModifier === key.id;
          return (
            <Pressable
              key={key.id}
              accessibilityRole="button"
              accessibilityLabel={accessoryKeyAccessibilityLabel(key.id)}
              accessibilityState={{ selected: armed, disabled }}
              disabled={disabled}
              hitSlop={6}
              onPress={() => onPressKey(key.id)}
              style={({ pressed }) => [
                styles.key,
                armed && styles.keyArmed,
                pressed && styles.keyPressed,
                disabled && styles.keyDisabled,
              ]}
            >
              <Text style={styles.keyLabel}>{key.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </GlassSurface>
  );
}

function accessoryKeyAccessibilityLabel(id: TerminalAccessoryKeyId): string {
  switch (id) {
    case "esc":
      return "Escape";
    case "tab":
      return "Tab";
    case "ctrl":
      return "Control";
    case "alt":
      return "Option";
    case "slash":
      return "Slash";
    case "dash":
      return "Dash";
    case "up":
      return "Up arrow";
    case "down":
      return "Down arrow";
    case "left":
      return "Left arrow";
    case "right":
      return "Right arrow";
  }
}

const styles = StyleSheet.create({
  surface: {
    height: 46,
    borderRadius: radius.full,
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: spacing[2],
  },
  key: {
    minWidth: 30,
    minHeight: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
  },
  keyArmed: {
    backgroundColor: colors.accent,
  },
  keyPressed: {
    opacity: 0.6,
  },
  keyDisabled: {
    opacity: 0.35,
  },
  keyLabel: {
    color: colors.fg,
    fontSize: 13,
    fontWeight: "600",
  },
});
