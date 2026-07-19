import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { CloudSessionProjection } from "@proliferate/cloud-sdk";
import type { CloudChatComposerControlView } from "@proliferate/product-domain/chats/cloud/composer-controls";

import { colors, radius, spacing } from "../../styles/tokens";
import { MobileIcon, type MobileIconName } from "../primitives/MobileIcon";
import { MobileTextInput } from "../primitives/MobileTextInput";
import { MobileWorkspaceActionControlDetail } from "./screen/MobileWorkspaceActionControlDetail";
import {
  MobileWorkspaceActionSheetSections,
} from "./screen/MobileWorkspaceActionSheetSections";

/** Per-workspace management (Workspaces list, mockup B / IA §2.2): rename,
 * archive/restore, delete. `displayName` seeds the rename draft; `onOpen` is
 * only meaningful when the sheet is opened from a list row rather than from
 * inside the workspace itself. Delete's confirm ("cannot be undone", web
 * copy family) lives in this component, not the caller.
 *
 * Archive/restore/delete stay open (not closed) while their mutation is
 * pending so `archiving`/`restoring`/`deleting` pending labels render (I1) —
 * the caller (management action's promise) is responsible for closing the
 * sheet on success and surfacing a toast on failure; this component never
 * closes itself in response to firing one of these. */
export interface MobileWorkspaceManagementInput {
  displayName: string;
  archived: boolean;
  renaming: boolean;
  archiving: boolean;
  restoring: boolean;
  deleting: boolean;
  onOpen?: () => void;
  onRename: (nextName: string) => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}

interface MobileWorkspaceActionSheetProps {
  visible: boolean;
  initialExpandedId?: string | null;
  branchLabel: string;
  runtimeLabel: string;
  runtimeDetail: string;
  runtimeIcon: MobileIconName;
  unclaimed: boolean;
  claimPending: boolean;
  promptSubmitting: boolean;
  sessions: readonly CloudSessionProjection[];
  activeSessionId: string | null;
  newSessionMode: boolean;
  composerControls: readonly CloudChatComposerControlView[];
  /** False from the Workspaces list, where there's no active chat to manage
   * sessions/composer controls for — only `management` rows are shown. */
  showSessionManagement?: boolean;
  management?: MobileWorkspaceManagementInput;
  onClaim: () => boolean | Promise<boolean>;
  onNewSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onCopyBranch: () => void;
  onClose: () => void;
}

export function MobileWorkspaceActionSheet({
  visible,
  initialExpandedId,
  branchLabel,
  runtimeLabel,
  runtimeDetail,
  runtimeIcon,
  unclaimed,
  claimPending,
  promptSubmitting,
  sessions,
  activeSessionId,
  newSessionMode,
  composerControls,
  showSessionManagement = true,
  management,
  onClaim,
  onNewSession,
  onSelectSession,
  onCopyBranch,
  onClose,
}: MobileWorkspaceActionSheetProps) {
  const [detailControlId, setDetailControlId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState<string | null>(null);
  const detailControl = useMemo(
    () => composerControls.find((control) => control.id === detailControlId) ?? null,
    [composerControls, detailControlId],
  );

  useEffect(() => {
    if (!visible) {
      setDetailControlId(null);
      setRenameDraft(null);
      return;
    }
    if (initialExpandedId?.startsWith("control:")) {
      setDetailControlId(initialExpandedId.slice("control:".length));
    }
  }, [initialExpandedId, visible]);

  async function runClaim() {
    const claimed = await onClaim();
    if (claimed) {
      closeSheet();
    }
  }

  function closeSheet() {
    setDetailControlId(null);
    setRenameDraft(null);
    onClose();
  }

  function confirmDelete() {
    if (!management) {
      return;
    }
    Alert.alert(
      "Delete workspace?",
      `Delete "${management.displayName}"? Its record and chat history are removed permanently. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete workspace",
          style: "destructive",
          // No closeSheet() here (I1): the sheet stays open showing the
          // "Deleting…" pending label while the mutation runs. The caller's
          // onDelete owns closing the sheet on success / toasting on
          // failure — see MobileWorkspaceManagementInput's doc comment.
          onPress: () => management.onDelete(),
        },
      ],
    );
  }

  function submitRename() {
    if (!management || renameDraft === null) {
      return;
    }
    const trimmed = renameDraft.trim();
    setRenameDraft(null);
    if (trimmed && trimmed !== management.displayName) {
      management.onRename(trimmed);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={closeSheet}>
      <View style={styles.layer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close workspace controls"
          style={styles.scrim}
          onPress={closeSheet}
        />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          {renameDraft !== null ? (
            <View style={styles.renameForm}>
              <Text style={styles.renameLabel}>Rename workspace</Text>
              <MobileTextInput
                value={renameDraft}
                onChangeText={setRenameDraft}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={submitRename}
              />
              <View style={styles.renameActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setRenameDraft(null)}
                  style={({ pressed }) => [styles.renameButton, pressed && styles.pressed]}
                >
                  <Text style={styles.renameButtonText}>Cancel</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={!renameDraft.trim()}
                  onPress={submitRename}
                  style={({ pressed }) => [
                    styles.renameButton,
                    styles.renameButtonPrimary,
                    !renameDraft.trim() && styles.renameButtonDisabled,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.renameButtonPrimaryText}>Save</Text>
                </Pressable>
              </View>
            </View>
          ) : detailControl ? (
            <MobileWorkspaceActionControlDetail
              control={detailControl}
              onBack={() => setDetailControlId(null)}
              onSelect={(option) => {
                detailControl.onSelect?.(option.id);
                setDetailControlId(null);
              }}
            />
          ) : (
            <MobileWorkspaceActionSheetSections
              branchLabel={branchLabel}
              runtimeLabel={runtimeLabel}
              runtimeDetail={runtimeDetail}
              runtimeIcon={runtimeIcon}
              unclaimed={unclaimed}
              claimPending={claimPending}
              promptSubmitting={promptSubmitting}
              sessions={sessions}
              activeSessionId={activeSessionId}
              newSessionMode={newSessionMode}
              composerControls={composerControls}
              showSessionManagement={showSessionManagement}
              management={management && {
                archived: management.archived,
                renaming: management.renaming,
                archiving: management.archiving,
                restoring: management.restoring,
                deleting: management.deleting,
                onOpen: management.onOpen && (() => {
                  closeSheet();
                  management.onOpen?.();
                }),
                onRename: () => setRenameDraft(management.displayName),
                // No closeSheet() (I1): archive/restore stay open showing
                // their pending label while the mutation runs, same as
                // delete above — the caller's promise closes the sheet on
                // success and toasts on failure.
                onArchive: () => management.onArchive(),
                onRestore: () => management.onRestore(),
                onDelete: confirmDelete,
              }}
              onClaim={() => {
                void runClaim();
              }}
              onNewSession={() => {
                onNewSession();
                closeSheet();
              }}
              onSelectSession={(sessionId) => {
                onSelectSession(sessionId);
                closeSheet();
              }}
              onCopyBranch={() => {
                onCopyBranch();
                closeSheet();
              }}
              onOpenControlDetail={setDetailControlId}
            />
          )}
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
    maxHeight: "78%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderHeavy,
    backgroundColor: colors.popover,
    paddingTop: spacing[2],
    paddingBottom: spacing[4],
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderHeavy,
    marginBottom: spacing[2],
  },
  renameForm: {
    gap: spacing[3],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[2],
    paddingBottom: spacing[3],
  },
  renameLabel: {
    color: colors.faint,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  renameActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing[2],
  },
  renameButton: {
    minHeight: 40,
    minWidth: 84,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
    paddingHorizontal: spacing[4],
    backgroundColor: colors.card,
  },
  renameButtonPrimary: {
    backgroundColor: colors.fg,
  },
  renameButtonDisabled: {
    opacity: 0.5,
  },
  renameButtonText: {
    color: colors.fg,
    fontSize: 14,
    fontWeight: "600",
  },
  renameButtonPrimaryText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.72,
  },
});
