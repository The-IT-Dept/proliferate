import { useState } from "react";
import * as Clipboard from "expo-clipboard";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useMobileWorkInventory, type MobileWorkItem } from "../../hooks/work/derived/use-mobile-work-inventory";
import { useMobileWorkFilters } from "../../hooks/work/ui/use-mobile-work-filters";
import { useMobileWorkClaimActions } from "../../hooks/work/workflows/use-mobile-work-claim-actions";
import { useMobileWorkspaceManagementActions } from "../../hooks/work/workflows/use-mobile-workspace-management-actions";
import { useMobileServerCapabilities } from "../../hooks/access/cloud/capabilities/use-mobile-server-capabilities";
import {
  MOBILE_WORK_STATUS_OPTIONS,
  MOBILE_WORK_TYPE_OPTIONS,
} from "../../lib/domain/work/mobile-work-filters";
import { mobileIconForRuntimeLocation } from "../../lib/domain/work/mobile-work-presentation";
import type { MobileCloudChat } from "../../lib/domain/workspace/mobile-workspace-chat";
import { useMobileToast } from "../../providers/MobileToastProvider";
import { MobileWorkspaceActionSheet } from "../chat/MobileWorkspaceActionSheet";
import { MobileIcon } from "../primitives/MobileIcon";
import {
  MobileEmptyState,
  MobileScreen,
} from "../primitives/MobileLayout";
import { MobileWorkspaceCard } from "./MobileWorkspaceCard";
import {
  MobileWorkFilterSheet,
} from "./screen/MobileWorkFilterSheet";
import { MobileWorkSummaryPill } from "./screen/MobileWorkFilterRows";
import { colors, radius, spacing } from "../../styles/tokens";

interface MobileWorkspacesScreenProps {
  onOpenChat: (chat: MobileCloudChat) => void;
}

export function MobileWorkspacesScreen({
  onOpenChat,
}: MobileWorkspacesScreenProps) {
  // MobileScreen's ScrollView carries the native content inset
  // (contentInsetAdjustmentBehavior="automatic"): the large-title top inset
  // (so the filter pills / list start below the "Workspaces" title) and the
  // tab-bar bottom footprint. This is just baseline bottom breathing room.
  const scrollContentBottomPadding = spacing[8];
  const [filterOpen, setFilterOpen] = useState(false);
  const [managedItem, setManagedItem] = useState<MobileWorkItem | null>(null);
  const allInventory = useMobileWorkInventory();
  const filterState = useMobileWorkFilters(allInventory.items);
  const inventory = useMobileWorkInventory(filterState.filters);
  const claimActions = useMobileWorkClaimActions();
  const managementActions = useMobileWorkspaceManagementActions();
  const toast = useMobileToast();

  // I1: the mutation drives the sheet, not the button press. The sheet stays
  // open (showing the archiving/restoring/deleting/renaming pending label)
  // while `action` is in flight; on success the sheet closes and a brief
  // success toast confirms it; on failure the sheet stays open and the
  // error surfaces as a toast instead of vanishing silently. `workspaceId`
  // guards against a stale close: if the user has since dismissed this sheet
  // and opened a different workspace's before this promise settles, closing
  // is skipped rather than yanking away the *new* sheet. Deliberately no
  // optimistic row removal — the row only disappears once
  // invalidateWorkspaceLists (inside useMobileWorkspaceManagementActions)
  // lands a real refetch.
  function runManagementAction(options: {
    workspaceId: string;
    action: Promise<unknown>;
    verb: string;
    successMessage: string;
  }) {
    void options.action
      .then(() => {
        setManagedItem((current) => (current?.workspace.id === options.workspaceId ? null : current));
        toast.show({ tone: "success", message: options.successMessage });
      })
      .catch((error: unknown) => {
        console.warn(`Failed to ${options.verb} workspace`, error);
        const detail = error instanceof Error && error.message ? `: ${error.message}` : ".";
        toast.show({ tone: "error", message: `Couldn't ${options.verb} workspace${detail}` });
      });
  }
  // Access-loss (PR 7): when managed-Cloud capability is no longer ready, keep
  // existing Cloud workspace records visible but locked and explained. Only
  // treat an explicit non-ready capability as loss — an in-flight/unknown read
  // must not lock records (fail closed on gating, not on presentation).
  const capabilities = useMobileServerCapabilities();
  const cloudAccessLost = capabilities.data?.managedCloud === "disabled"
    || capabilities.data?.managedCloud === "operator_configuration_required";
  const accessLossReason = cloudAccessLost
    ? "Cloud access is no longer available on this deployment. This workspace is read-only until access is restored."
    : null;

  return (
    <MobileScreen
      contentStyle={[styles.screenContent, { paddingBottom: scrollContentBottomPadding }]}
      refreshControl={
        <RefreshControl
          refreshing={inventory.isFetching && !inventory.isLoading}
          tintColor={colors.fg}
          colors={[colors.fg]}
          onRefresh={() => {
            void inventory.refetch();
          }}
        />
      }
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pills}
      >
        <MobileWorkSummaryPill
          label={`All ${allInventory.items.length}`}
          selected={filterState.activeFilterCount === 0}
          onPress={filterState.clearFilters}
        />
        {MOBILE_WORK_STATUS_OPTIONS.filter((option) => option.id !== "all").map((option) => (
          <MobileWorkSummaryPill
            key={option.id}
            label={option.label}
            selected={filterState.status === option.id}
            onPress={() => {
              filterState.setAttentionOnly(false);
              filterState.setStatus(filterState.status === option.id ? "all" : option.id);
            }}
          />
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.pills, styles.typePills]}
      >
        {MOBILE_WORK_TYPE_OPTIONS.map((option) => (
          <MobileWorkSummaryPill
            key={option.id}
            label={option.label}
            icon={option.icon}
            selected={filterState.workType === option.id}
            onPress={() => filterState.setWorkType(option.id)}
          />
        ))}
        <MobileWorkSummaryPill
          label={filterState.activeFilterCount ? `Filters ${filterState.activeFilterCount}` : "Filter"}
          icon="filter"
          selected={filterState.activeFilterCount > 0}
          onPress={() => setFilterOpen(true)}
        />
      </ScrollView>

      {inventory.error && inventory.items.length > 0 ? (
        <View style={styles.partialWarning}>
          <MobileIcon name="cloud" size={13} color={colors.warning} />
          <Text style={styles.partialWarningText}>
            Some workspaces could not refresh. Showing the workspaces that loaded.
          </Text>
        </View>
      ) : null}

      {inventory.isLoading ? (
        <MobileEmptyState title="Loading workspaces" body="Fetching visible cloud workspaces." />
      ) : inventory.error && inventory.items.length === 0 ? (
        <MobileEmptyState title="Could not load workspaces" body="Pull to refresh or sign in again." />
      ) : inventory.items.length === 0 ? (
        <MobileEmptyState
          title="No matching workspaces"
          body="Adjust filters or start a new chat."
        />
      ) : (
        <View style={styles.groups}>
          {inventory.groups.map((group) => (
            <View key={group.view.id} style={styles.group}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{group.view.label}</Text>
              </View>
              <View style={styles.cards}>
                {group.items.map((item) => (
                  <MobileWorkspaceCard
                    key={item.view.id}
                    item={item}
                    claiming={claimActions.claimingWorkspaceId === item.workspace.id}
                    accessLossReason={accessLossReason}
                    onPress={() => onOpenChat(item.chat)}
                    onLongPress={() => setManagedItem(item)}
                    onClaim={() => {
                      void claimActions.claimListWorkspace(item);
                    }}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}

      <MobileWorkFilterSheet
        visible={filterOpen}
        workType={filterState.workType}
        runtime={filterState.runtime}
        ownership={filterState.ownership}
        status={filterState.status}
        repo={filterState.repo}
        sort={filterState.sort}
        repoOptions={filterState.repoOptions}
        onWorkType={filterState.setWorkType}
        onRuntime={filterState.setRuntime}
        onOwnership={(value) => {
          filterState.setAttentionOnly(false);
          filterState.setOwnership(value);
        }}
        onStatus={(value) => {
          filterState.setAttentionOnly(false);
          filterState.setStatus(value);
        }}
        onRepo={filterState.setRepo}
        onSort={filterState.setSort}
        onClear={filterState.clearFilters}
        onClose={() => setFilterOpen(false)}
      />

      {managedItem ? (
        <MobileWorkspaceActionSheet
          visible={Boolean(managedItem)}
          branchLabel={managedItem.view.branchLabel}
          runtimeLabel={managedItem.view.runtimeLocationLabel}
          runtimeDetail={managedItem.view.runtimeLabel}
          runtimeIcon={mobileIconForRuntimeLocation(managedItem.view.runtimeLocation)}
          unclaimed={managedItem.view.unclaimed}
          claimPending={claimActions.claimingWorkspaceId === managedItem.workspace.id}
          promptSubmitting={false}
          sessions={[]}
          activeSessionId={null}
          newSessionMode={false}
          composerControls={[]}
          showSessionManagement={false}
          management={{
            displayName: managedItem.view.title,
            archived: managedItem.view.status === "archived",
            renaming: managementActions.isRenamingWorkspace,
            archiving: managementActions.isArchivingWorkspace,
            restoring: managementActions.isRestoringWorkspace,
            deleting: managementActions.isDeletingWorkspace,
            onOpen: () => onOpenChat(managedItem.chat),
            onRename: (nextName) => {
              runManagementAction({
                workspaceId: managedItem.workspace.id,
                action: managementActions.renameWorkspace(managedItem.workspace.id, nextName),
                verb: "rename",
                successMessage: "Workspace renamed.",
              });
            },
            onArchive: () => {
              runManagementAction({
                workspaceId: managedItem.workspace.id,
                action: managementActions.archiveWorkspace(managedItem.workspace.id),
                verb: "archive",
                successMessage: "Workspace archived.",
              });
            },
            onRestore: () => {
              runManagementAction({
                workspaceId: managedItem.workspace.id,
                action: managementActions.restoreWorkspace(managedItem.workspace.id),
                verb: "restore",
                successMessage: "Workspace restored.",
              });
            },
            onDelete: () => {
              runManagementAction({
                workspaceId: managedItem.workspace.id,
                action: managementActions.deleteWorkspace(managedItem.workspace.id),
                verb: "delete",
                successMessage: "Workspace deleted.",
              });
            },
          }}
          onClaim={() => claimActions.claimListWorkspace(managedItem).then(() => true).catch(() => false)}
          onNewSession={() => {}}
          onSelectSession={() => {}}
          onCopyBranch={() => {
            void Clipboard.setStringAsync(managedItem.view.branchLabel);
          }}
          onClose={() => setManagedItem(null)}
        />
      ) : null}
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  pills: {
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[4],
  },
  typePills: {
    paddingTop: 0,
  },
  groups: {
    gap: spacing[6],
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[8],
  },
  partialWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    marginHorizontal: spacing[4],
    marginTop: spacing[2],
    marginBottom: spacing[3],
    borderRadius: radius.lg,
    backgroundColor: colors.warningSubtle,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  partialWarningText: {
    flex: 1,
    color: colors.warning,
    fontSize: 12,
    lineHeight: 16,
  },
  group: {
    gap: spacing[3],
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: colors.faint,
    fontSize: 13,
    fontWeight: "500",
  },
  cards: {
    gap: spacing[2],
  },
});
