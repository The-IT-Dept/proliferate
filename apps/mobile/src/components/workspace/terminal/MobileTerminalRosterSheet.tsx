import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { TerminalRecord } from "@anyharness/sdk";
import { GlassSurface } from "@proliferate/design/glass";

import { MobileIcon } from "../../primitives/MobileIcon";
import { MobileTextInput } from "../../primitives/MobileTextInput";
import { terminalDisplayTitle } from "../../../lib/domain/terminal/terminal-roster";
import { terminalStatusLabel, terminalStatusTone } from "../../../lib/domain/terminal/terminal-status";
import { colors, radius, spacing } from "../../../styles/tokens";

const RENAME_MAX_LENGTH = 160;

const TONE_COLOR: Record<ReturnType<typeof terminalStatusTone>, string> = {
  positive: colors.success,
  default: colors.info,
  muted: colors.faint,
  danger: colors.destructive,
};

/**
 * F-build — the terminal roster sheet (IA `Term (G)`: "roster sheet (rename
 * inline ≤160 chars, close when runtime ready, 'New terminal', unread dots,
 * 'No terminals' empty)"; row shape mirrors web's `TerminalTopBar` popover
 * exactly — same rename-inline-160-char-max affordance, same per-row
 * rename/close icon buttons, same "Active" marker on the attached terminal.
 * `terminals` is expected pre-sorted by the caller
 * (`sortTerminalsForRoster`) so index-based `terminalDisplayTitle` fallback
 * numbering matches the order actually rendered.
 *
 * Per design-system.md §3.2's `sheetChrome` allowlist entry ("Grabber +
 * header row of every sheet; sheet *body* is opaque `surface`") and this
 * group's own layout rule ("glass only on control chrome"): only the
 * grabber+header strip is glass — the scrollable terminal list stays on the
 * app's plain opaque sheet surface, same as every other sheet in this app.
 *
 * Deliberately no "unread dot" per row (IA mentions it, mirroring web's
 * `unreadByTerminal`): that signal requires a live background stream per
 * *inactive* terminal to know something happened while it wasn't looked at,
 * and this build intentionally keeps only one `MobileTerminalView`/stream
 * attached at a time (no N background WebSockets) — faking the dot without
 * the signal would be worse than omitting it.
 */
export interface MobileTerminalRosterSheetProps {
  visible: boolean;
  terminals: readonly TerminalRecord[];
  activeTerminalId: string | null;
  creating: boolean;
  closingTerminalId: string | null;
  renamingTerminalId: string | null;
  onSelect: (terminalId: string) => void;
  onCreate: () => void;
  onClose: (terminalId: string, title: string) => void;
  onRename: (terminalId: string, title: string) => void;
  onDismiss: () => void;
}

export function MobileTerminalRosterSheet({
  visible,
  terminals,
  activeTerminalId,
  creating,
  closingTerminalId,
  renamingTerminalId,
  onSelect,
  onCreate,
  onClose,
  onRename,
  onDismiss,
}: MobileTerminalRosterSheetProps) {
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  useEffect(() => {
    if (!visible) {
      setRenameId(null);
      setRenameDraft("");
    }
  }, [visible]);

  function close() {
    setRenameId(null);
    onDismiss();
  }

  function beginRename(terminal: TerminalRecord, index: number) {
    setRenameId(terminal.id);
    setRenameDraft(terminalDisplayTitle(terminal, index));
  }

  function submitRename() {
    if (!renameId) {
      return;
    }
    const title = renameDraft.trim();
    if (!title || title.length > RENAME_MAX_LENGTH) {
      return;
    }
    onRename(renameId, title);
    setRenameId(null);
  }

  function confirmClose(terminal: TerminalRecord, displayTitle: string) {
    Alert.alert(
      "Close terminal?",
      `Close "${displayTitle}"? Any running process is terminated.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Close terminal",
          style: "destructive",
          onPress: () => onClose(terminal.id, displayTitle),
        },
      ],
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.layer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close terminal roster"
          style={styles.scrim}
          onPress={close}
        />
        <View style={styles.sheet}>
          <GlassSurface variant="sheet" style={styles.chrome}>
            <View style={styles.grabber} />
            <View style={styles.header}>
              <Text style={styles.title}>Terminals</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="New terminal"
                disabled={creating}
                onPress={onCreate}
                style={({ pressed }) => [
                  styles.newButton,
                  pressed && styles.pressed,
                  creating && styles.disabled,
                ]}
              >
                {creating ? (
                  <ActivityIndicator color={colors.fg} />
                ) : (
                  <MobileIcon name="plus" size={17} color={colors.fg} />
                )}
              </Pressable>
            </View>
          </GlassSurface>

          <View style={styles.body}>
            <ScrollView
              contentContainerStyle={styles.list}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {terminals.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyText}>No terminals</Text>
                </View>
              ) : (
                terminals.map((terminal, index) => {
                  const displayTitle = terminalDisplayTitle(terminal, index);
                  const isActive = terminal.id === activeTerminalId;
                  const isEditing = renameId === terminal.id;
                  const isClosing = closingTerminalId === terminal.id;
                  const isRenaming = renamingTerminalId === terminal.id;
                  const tone = TONE_COLOR[terminalStatusTone(terminal.status)];

                  return (
                    <View key={terminal.id} style={styles.row}>
                      {isEditing ? (
                        <View style={styles.renameForm}>
                          <MobileTextInput
                            value={renameDraft}
                            maxLength={RENAME_MAX_LENGTH}
                            autoFocus
                            onChangeText={setRenameDraft}
                            style={styles.renameInput}
                            returnKeyType="done"
                            onSubmitEditing={submitRename}
                          />
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Save terminal name"
                            disabled={!renameDraft.trim() || isRenaming}
                            onPress={submitRename}
                            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                          >
                            {isRenaming ? (
                              <ActivityIndicator color={colors.fg} size="small" />
                            ) : (
                              <MobileIcon name="check" size={16} color={colors.fg} />
                            )}
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Cancel rename"
                            onPress={() => setRenameId(null)}
                            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                          >
                            <MobileIcon name="close" size={16} color={colors.faint} />
                          </Pressable>
                        </View>
                      ) : (
                        <>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Switch to ${displayTitle}`}
                            accessibilityState={{ selected: isActive }}
                            onPress={() => {
                              onSelect(terminal.id);
                              close();
                            }}
                            style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}
                          >
                            <MobileIcon name="terminal" size={16} color={colors.faint} />
                            <View style={styles.rowText}>
                              <Text style={styles.rowTitle} numberOfLines={1}>
                                {displayTitle}
                              </Text>
                              <View style={styles.rowMeta}>
                                <View style={[styles.statusDot, { backgroundColor: tone }]} />
                                <Text style={[styles.rowStatus, { color: tone }]}>
                                  {terminalStatusLabel(terminal.status)}
                                </Text>
                              </View>
                            </View>
                            {isActive ? <Text style={styles.activeLabel}>Active</Text> : null}
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Rename ${displayTitle}`}
                            onPress={() => beginRename(terminal, index)}
                            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                          >
                            <MobileIcon name="pencil" size={15} color={colors.faint} />
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Close ${displayTitle}`}
                            disabled={isClosing}
                            onPress={() => confirmClose(terminal, displayTitle)}
                            style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                          >
                            {isClosing ? (
                              <ActivityIndicator color={colors.destructive} size="small" />
                            ) : (
                              <MobileIcon name="trash" size={15} color={colors.destructive} />
                            )}
                          </Pressable>
                        </>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  layer: {
    flex: 1,
    justifyContent: "flex-end",
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    maxHeight: "72%",
    borderTopLeftRadius: 38,
    borderTopRightRadius: 38,
    overflow: "hidden",
    backgroundColor: colors.popover,
  },
  chrome: {
    paddingTop: spacing[2],
    paddingBottom: spacing[2],
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderHeavy,
    marginBottom: spacing[2],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
  },
  title: {
    color: colors.fg,
    fontSize: 17,
    fontWeight: "700",
  },
  newButton: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  body: {
    backgroundColor: colors.popover,
  },
  list: {
    paddingHorizontal: spacing[3],
    paddingBottom: spacing[4],
    paddingTop: spacing[1],
    gap: spacing[1],
  },
  empty: {
    minHeight: 90,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: colors.faint,
    fontSize: 14,
    fontWeight: "500",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    borderRadius: 16,
    paddingVertical: spacing[1],
    paddingHorizontal: spacing[1],
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    borderRadius: 14,
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[2],
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    color: colors.fg,
    fontSize: 15,
    fontWeight: "600",
  },
  rowMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  rowStatus: {
    fontSize: 12,
    fontWeight: "500",
  },
  activeLabel: {
    color: colors.faint,
    fontSize: 12,
    fontWeight: "600",
  },
  iconButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
  },
  renameForm: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    paddingVertical: spacing[1],
  },
  renameInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 38,
    fontSize: 14,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.72,
  },
});
