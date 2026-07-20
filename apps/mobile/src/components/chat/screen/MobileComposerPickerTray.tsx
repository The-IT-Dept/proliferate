import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { GlassSurface } from "@proliferate/design/glass";

import { MobileIcon } from "../../primitives/MobileIcon";
import { colors, spacing } from "../../../styles/tokens";
import type {
  MobileSlashCommandGroup,
  MobileSlashCommandViewModel,
} from "../../../lib/domain/chat/composer/mobile-composer-slash-commands";

export type MobileComposerPickerState = {
  kind: "slash";
  commands: readonly MobileSlashCommandViewModel[];
};

interface MobileComposerPickerTrayProps {
  state: MobileComposerPickerState;
  onSelectCommand: (command: MobileSlashCommandViewModel) => void;
}

/**
 * Row 23 — the composer's slash-command picker tray. Renders inline, as a
 * sibling directly above `MobileChatComposer` inside the same
 * `KeyboardStickyView` (`MobileChatScreen.tsx`) — so it rides the keyboard
 * for free rather than needing its own keyboard-controller wiring, mirroring
 * web's `ComposerCommandEditor`, which renders its search tray "in a small
 * host directly above ChatComposerSurface"
 * (`specs/codebase/systems/product/chat/composer.md` §1: "transient editor
 * UI", not a dock-region inhabitant).
 *
 * Glass chrome scope: `design-system.md` §3.2's `GlassSurfaceVariant`
 * allowlist (`nav | tab | toolbar | sheet | fab | dock | segmented`) has no
 * dedicated "floating tray" entry, and the composer dock itself doesn't use
 * glass yet either (`MobileChatComposer.tsx` — out of Row 23's scope to add).
 * `sheet` is the closest existing shape (top-rounded chrome + opaque clipped
 * body below it — exactly `MobileTerminalRosterSheet`'s technique), reused
 * here for just the thin header strip; the scrollable result list underneath
 * stays on the plain opaque `popover` surface, same "glass on chrome only,
 * list body stays opaque" split as every other sheet in this app.
 *
 * Originally also rendered a @mention file-search result list alongside the
 * slash list (`state.kind === "mention"`); that half was removed to match
 * web's current slash-only composer (`product-client` commit 2e0dcf52c,
 * "feat(desktop): replace composer mentions with slash commands") — see
 * `mobile-composer-triggers.ts`'s module doc.
 */
export function MobileComposerPickerTray({
  state,
  onSelectCommand,
}: MobileComposerPickerTrayProps) {
  return (
    <View style={styles.card} testID="composer-picker-tray">
      <GlassSurface variant="sheet" style={styles.chrome}>
        <View style={styles.header}>
          <MobileIcon name="terminal" size={13} color={colors.faint} />
          <Text style={styles.headerText} numberOfLines={1}>
            Commands
          </Text>
        </View>
      </GlassSurface>
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SlashCommandRows commands={state.commands} onSelect={onSelectCommand} />
      </ScrollView>
    </View>
  );
}

function SlashCommandRows({
  commands,
  onSelect,
}: {
  commands: readonly MobileSlashCommandViewModel[];
  onSelect: (command: MobileSlashCommandViewModel) => void;
}) {
  if (commands.length === 0) {
    return <TrayMessage text="No matching slash commands." />;
  }

  return (
    <>
      {commands.map((command, index) => {
        const previousGroup: MobileSlashCommandGroup | undefined = commands[index - 1]?.group;
        const showGroupLabel = command.group !== "Commands" && previousGroup !== command.group;
        const commandName = command.displayName.startsWith("/")
          ? command.displayName.slice(1)
          : command.displayName;
        const detail = command.description || command.inputHint;
        const trailingHint = command.inputHint && command.description ? command.inputHint : null;

        return (
          <View key={command.id}>
            {showGroupLabel ? <Text style={styles.groupLabel}>{command.group}</Text> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={command.displayName}
              onPress={() => onSelect(command)}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <Text style={styles.rowTitle} numberOfLines={1}>
                <Text style={styles.rowTitleSlash}>/</Text>
                {commandName}
              </Text>
              {detail ? (
                <Text style={styles.rowDetail} numberOfLines={1}>
                  {detail}
                </Text>
              ) : null}
              {trailingHint ? (
                <Text style={styles.rowHint} numberOfLines={1}>
                  {trailingHint}
                </Text>
              ) : null}
            </Pressable>
          </View>
        );
      })}
    </>
  );
}

function TrayMessage({ text, tone = "muted" }: { text: string; tone?: "muted" | "error" }) {
  return (
    <View style={styles.message}>
      <Text style={[styles.messageText, tone === "error" && styles.messageTextError]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing[3],
    marginBottom: spacing[2],
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderHeavy,
    backgroundColor: colors.popover,
    maxHeight: 240,
  },
  chrome: {
    paddingVertical: spacing[1],
  },
  header: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    paddingHorizontal: spacing[3],
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    color: colors.faint,
    fontSize: 11.5,
    fontWeight: "600",
  },
  list: {
    backgroundColor: colors.popover,
  },
  listContent: {
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[1],
  },
  groupLabel: {
    paddingHorizontal: spacing[2],
    paddingTop: spacing[2],
    paddingBottom: 2,
    color: colors.faint,
    fontSize: 11,
    fontWeight: "600",
  },
  row: {
    minHeight: 40,
    justifyContent: "center",
    borderRadius: 12,
    paddingHorizontal: spacing[2],
    paddingVertical: spacing[1],
  },
  rowPressed: {
    backgroundColor: colors.accent,
  },
  rowTitle: {
    color: colors.fg,
    fontSize: 14,
    fontWeight: "600",
  },
  rowTitleSlash: {
    color: colors.mutedForeground,
  },
  rowDetail: {
    color: colors.mutedForeground,
    fontSize: 12,
    marginTop: 1,
  },
  rowHint: {
    color: colors.faint,
    fontSize: 11,
    marginTop: 1,
  },
  message: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[3],
  },
  messageText: {
    color: colors.faint,
    fontSize: 12.5,
    fontWeight: "500",
    textAlign: "center",
  },
  messageTextError: {
    color: colors.destructive,
  },
});
