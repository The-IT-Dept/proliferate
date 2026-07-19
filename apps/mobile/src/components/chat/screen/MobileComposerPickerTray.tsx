import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { GlassSurface } from "@proliferate/design/glass";

import { MobileIcon } from "../../primitives/MobileIcon";
import { colors, radius, spacing } from "../../../styles/tokens";
import type {
  MobileSlashCommandGroup,
  MobileSlashCommandViewModel,
} from "../../../lib/domain/chat/composer/mobile-composer-slash-commands";
import type { MobileFileMentionSearchResult } from "../../../hooks/chat/ui/use-mobile-file-mention-search";

export type MobileComposerPickerState =
  | { kind: "slash"; commands: readonly MobileSlashCommandViewModel[] }
  | {
      kind: "mention";
      query: string;
      results: readonly MobileFileMentionSearchResult[];
      isLoading: boolean;
      isError: boolean;
    };

interface MobileComposerPickerTrayProps {
  state: MobileComposerPickerState;
  onSelectCommand: (command: MobileSlashCommandViewModel) => void;
  onSelectFile: (result: MobileFileMentionSearchResult) => void;
}

const MONO_FONT = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

/**
 * Row 23 — the composer's slash-command / @mention picker tray. Renders
 * inline, as a sibling directly above `MobileChatComposer` inside the same
 * `KeyboardStickyView` (`MobileChatScreen.tsx`) — so it rides the keyboard
 * for free rather than needing its own keyboard-controller wiring, mirroring
 * web's `ComposerCommandEditor`/deleted `ComposerMentionEditor`, which both
 * render their search tray "in a small host directly above
 * ChatComposerSurface" (`specs/codebase/systems/product/chat/composer.md`
 * §1: "transient editor UI", not a dock-region inhabitant).
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
 */
export function MobileComposerPickerTray({
  state,
  onSelectCommand,
  onSelectFile,
}: MobileComposerPickerTrayProps) {
  const headerIcon = state.kind === "slash" ? "terminal" : "search";
  const headerLabel = state.kind === "slash"
    ? "Commands"
    : state.query
      ? `Search files: ${state.query}`
      : "Type to search workspace files.";
  const showSpinner = state.kind === "mention" && state.isLoading;

  return (
    <View style={styles.card} testID="composer-picker-tray">
      <GlassSurface variant="sheet" style={styles.chrome}>
        <View style={styles.header}>
          <MobileIcon name={headerIcon} size={13} color={colors.faint} />
          <Text style={styles.headerText} numberOfLines={1}>
            {headerLabel}
          </Text>
          {showSpinner ? <ActivityIndicator size="small" color={colors.faint} /> : null}
        </View>
      </GlassSurface>
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {state.kind === "slash" ? (
          <SlashCommandRows commands={state.commands} onSelect={onSelectCommand} />
        ) : (
          <MentionResultRows
            query={state.query}
            results={state.results}
            isError={state.isError}
            onSelect={onSelectFile}
          />
        )}
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

function MentionResultRows({
  query,
  results,
  isError,
  onSelect,
}: {
  query: string;
  results: readonly MobileFileMentionSearchResult[];
  isError: boolean;
  onSelect: (result: MobileFileMentionSearchResult) => void;
}) {
  if (isError) {
    return <TrayMessage text="Couldn't search workspace files." tone="error" />;
  }
  if (results.length === 0) {
    return (
      <TrayMessage
        text={query ? `No files match "${query}".` : "Type to search workspace files."}
      />
    );
  }

  return (
    <>
      {results.map((result) => (
        <Pressable
          key={result.path}
          accessibilityRole="button"
          accessibilityLabel={`Attach ${result.name}`}
          onPress={() => onSelect(result)}
          style={({ pressed }) => [styles.row, styles.mentionRow, pressed && styles.rowPressed]}
        >
          <MobileIcon name="folder" size={14} color={colors.faint} />
          <View style={styles.mentionRowText}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {result.name}
            </Text>
            <Text style={styles.mentionPath} numberOfLines={1} ellipsizeMode="head">
              {result.path}
            </Text>
          </View>
        </Pressable>
      ))}
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
  mentionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  mentionRowText: {
    flex: 1,
    minWidth: 0,
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
  mentionPath: {
    color: colors.faint,
    fontSize: 11.5,
    fontFamily: MONO_FONT,
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
