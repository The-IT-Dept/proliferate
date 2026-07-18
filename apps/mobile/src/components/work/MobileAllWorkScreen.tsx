import { useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useMobileWorkInventory } from "../../hooks/work/derived/use-mobile-work-inventory";
import { useMobileWorkFilters } from "../../hooks/work/ui/use-mobile-work-filters";
import { useMobileWorkClaimActions } from "../../hooks/work/workflows/use-mobile-work-claim-actions";
import { useMobileServerCapabilities } from "../../hooks/access/cloud/capabilities/use-mobile-server-capabilities";
import {
  MOBILE_WORK_STATUS_OPTIONS,
  MOBILE_WORK_TYPE_OPTIONS,
} from "../../lib/domain/work/mobile-work-filters";
import type { MobileCloudChat } from "../../navigation/navigation-model";
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
import { tabBarFootprint } from "../shell/tabbar/MobileTabBar";
import { colors, layout, radius, spacing } from "../../styles/tokens";

interface MobileWorkspacesScreenProps {
  onOpenChat: (chat: MobileCloudChat) => void;
  onNewChat: () => void;
}

export function MobileWorkspacesScreen({
  onOpenChat,
  onNewChat,
}: MobileWorkspacesScreenProps) {
  const insets = useSafeAreaInsets();
  // The floating glass tab bar is an absolutely-positioned sibling, not a
  // layout participant, so the scroll content must reserve its footprint
  // itself or the last workspace card scrolls to a resting point underneath
  // the bar, where taps hit the bar's Pressables instead.
  const scrollContentBottomPadding = Math.max(layout.screenBottomPadding, tabBarFootprint(insets.bottom));
  const [filterOpen, setFilterOpen] = useState(false);
  const allInventory = useMobileWorkInventory();
  const filterState = useMobileWorkFilters(allInventory.items);
  const inventory = useMobileWorkInventory(filterState.filters);
  const claimActions = useMobileWorkClaimActions();
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
      <View style={styles.header}>
        <View style={styles.headerButton} />
        <Text style={styles.title}>Workspaces</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New chat"
          onPress={onNewChat}
          style={({ pressed }) => [styles.headerButton, styles.headerButtonRaised, pressed && styles.pressed]}
        >
          <MobileIcon name="plus" size={20} color={colors.fg} />
        </Pressable>
      </View>

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
    </MobileScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  header: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing[4],
  },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
  },
  headerButtonRaised: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  title: {
    color: colors.fg,
    fontSize: 16,
    fontWeight: "600",
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
  pressed: {
    opacity: 0.7,
  },
});
