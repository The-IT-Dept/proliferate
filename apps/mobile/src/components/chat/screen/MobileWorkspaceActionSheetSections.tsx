import { ScrollView, StyleSheet } from "react-native";
import type { CloudSessionProjection } from "@proliferate/cloud-sdk";
import {
  cloudComposerControlTitle,
  formatCloudComposerControlValueLabel,
  type CloudChatComposerControlView,
} from "@proliferate/product-domain/chats/cloud/composer-controls";

import { formatMobileWorkspaceActionSessionCount } from "../../../lib/domain/chat/mobile-workspace-action-session";
import { spacing } from "../../../styles/tokens";
import type { MobileIconName } from "../../primitives/MobileIcon";
import {
  MobileWorkspaceActionSessionRow,
  MobileWorkspaceActionSheetRow,
  MobileWorkspaceActionSheetSection,
} from "./MobileWorkspaceActionSheetRows";

/**
 * Workspace-management rows (Workspaces list, mockup B / IA §2.2 long-press
 * menu): rename, archive/unarchive, delete. Kept separate from the
 * chat-only session/composer concerns above so a list callsite can opt in
 * without also standing up sessions/composerControls data it doesn't have.
 * Verbatim labels/ordering follow web's WorkspaceItemMenu (parity map row
 * 9): Rename, Archive.../Unarchive, ... Delete workspace... .
 */
export interface MobileWorkspaceManagementView {
  archived: boolean;
  renaming: boolean;
  archiving: boolean;
  restoring: boolean;
  deleting: boolean;
  onOpen?: () => void;
  onRename: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}

export function MobileWorkspaceActionSheetSections({
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
  onOpenControlDetail,
}: {
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
  /** False from the Workspaces list: there's no active chat, so the
   * Configuration/Sessions sections (which assume one) are hidden. */
  showSessionManagement?: boolean;
  management?: MobileWorkspaceManagementView;
  onClaim: () => void;
  onNewSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onCopyBranch: () => void;
  onOpenControlDetail: (controlId: string) => void;
}) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {unclaimed ? (
        <MobileWorkspaceActionSheetSection>
          <MobileWorkspaceActionSheetRow
            icon="hand"
            title={claimPending ? "Claiming workspace" : "Claim workspace"}
            subtitle="Unlock replies and sessions."
            disabled={claimPending}
            onPress={onClaim}
          />
        </MobileWorkspaceActionSheetSection>
      ) : null}

      {management?.onOpen ? (
        <MobileWorkspaceActionSheetSection>
          <MobileWorkspaceActionSheetRow icon="workspaces" title="Open" onPress={management.onOpen} />
        </MobileWorkspaceActionSheetSection>
      ) : null}

      {showSessionManagement ? (
        <>
          <MobileWorkspaceActionSheetSection title="Configuration">
            {composerControls.map((control) => (
              <MobileWorkspaceActionSheetRow
                key={control.id}
                icon={controlIcon(control)}
                title={cloudComposerControlTitle(control)}
                value={formatCloudComposerControlValueLabel(control) ?? "Choose"}
                disabled={unclaimed || control.disabled}
                onPress={() => onOpenControlDetail(control.id)}
              />
            ))}
          </MobileWorkspaceActionSheetSection>

          <MobileWorkspaceActionSheetSection title="Sessions" count={sessions.length}>
            <MobileWorkspaceActionSheetRow
              icon="plus"
              title="New session"
              subtitle={
                promptSubmitting
                  ? "Wait for the current prompt first."
                  : sessions.length
                    ? `Start separately from ${formatMobileWorkspaceActionSessionCount(sessions.length)}.`
                    : "Start the first chat here."
              }
              selected={newSessionMode}
              disabled={unclaimed || promptSubmitting}
              onPress={onNewSession}
            />
            {sessions.map((session, index) => {
              const selected = session.sessionId === activeSessionId && !newSessionMode;
              return (
                <MobileWorkspaceActionSessionRow
                  key={session.sessionId}
                  session={session}
                  index={index}
                  selected={selected}
                  onPress={() => onSelectSession(session.sessionId)}
                />
              );
            })}
          </MobileWorkspaceActionSheetSection>
        </>
      ) : null}

      <MobileWorkspaceActionSheetSection title="Workspace">
        {management ? (
          <MobileWorkspaceActionSheetRow
            icon="pencil"
            title="Rename"
            disabled={management.renaming}
            onPress={management.onRename}
          />
        ) : null}
        {management && !management.archived ? (
          <MobileWorkspaceActionSheetRow
            icon="archive"
            title={management.archiving ? "Archiving…" : "Archive..."}
            disabled={management.archiving}
            onPress={management.onArchive}
          />
        ) : null}
        {management?.archived ? (
          <MobileWorkspaceActionSheetRow
            icon="archive"
            title={management.restoring ? "Restoring…" : "Unarchive"}
            disabled={management.restoring}
            onPress={management.onRestore}
          />
        ) : null}
        <MobileWorkspaceActionSheetRow
          icon="copy"
          title="Copy branch"
          value={branchLabel}
          valueMono
          onPress={onCopyBranch}
        />
        <MobileWorkspaceActionSheetRow
          icon={runtimeIcon}
          title="Runtime"
          subtitle={runtimeDetail}
          value={runtimeLabel}
          chevron={false}
        />
      </MobileWorkspaceActionSheetSection>

      {management ? (
        <MobileWorkspaceActionSheetSection>
          <MobileWorkspaceActionSheetRow
            icon="trash"
            title={management.deleting ? "Deleting…" : "Delete workspace..."}
            disabled={management.deleting}
            destructive
            onPress={management.onDelete}
          />
        </MobileWorkspaceActionSheetSection>
      ) : null}
    </ScrollView>
  );
}

function controlIcon(control: CloudChatComposerControlView): MobileIconName {
  switch (control.icon) {
    case "brain":
      return "brain";
    case "sparkles":
    case "zap":
      return "sparkles";
    case "shieldCheck":
      return "shield";
    case "claude":
      return "claude";
    case "openai":
      return "openai";
    case "opencodeBuild":
    case "bot":
      return "sparkles";
    case "settings":
    case "build":
    case "edit":
    case "opencodePlan":
    case "plan":
    case "read":
    default:
      return "settings";
  }
}

const styles = StyleSheet.create({
  scroll: {
    minHeight: 0,
  },
  content: {
    paddingBottom: spacing[2],
  },
});
