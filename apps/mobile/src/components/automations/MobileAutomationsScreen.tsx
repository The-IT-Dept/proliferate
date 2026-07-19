import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAutomationActions } from "@proliferate/cloud-sdk-react";
import type { AutomationInventoryItemView } from "@proliferate/product-domain/automations/inventory";

import { useMobileAutomationInventory } from "../../hooks/automations/derived/use-mobile-automation-inventory";
import { useMobileToast } from "../../providers/MobileToastProvider";
import { MobileIcon } from "../primitives/MobileIcon";
import { MobileListRow } from "../primitives/MobileListRow";
import { MobileEmptyState, MobileScreen } from "../primitives/MobileLayout";
import { MobileStatusDot } from "../primitives/MobileStatusDot";
import { colors, radius, spacing } from "../../styles/tokens";

interface MobileAutomationsScreenProps {
  onOpenAutomation: (automationId: string) => void;
}

export function MobileAutomationsScreen({ onOpenAutomation }: MobileAutomationsScreenProps) {
  // MobileScreen's ScrollView now carries the native content inset
  // (contentInsetAdjustmentBehavior="automatic"), so the tab-bar footprint is
  // applied natively — this is just baseline breathing room under the last row.
  const scrollContentBottomPadding = spacing[8];
  const [togglingAutomationId, setTogglingAutomationId] = useState<string | null>(null);
  const inventory = useMobileAutomationInventory();
  const actions = useAutomationActions();
  const toast = useMobileToast();

  async function toggleAutomation(item: AutomationInventoryItemView) {
    if (togglingAutomationId) {
      return;
    }
    setTogglingAutomationId(item.id);
    try {
      if (item.enabled) {
        await actions.pauseAutomation(item.id);
      } else {
        await actions.resumeAutomation(item.id);
      }
    } catch (error) {
      toast.show({
        tone: "error",
        message: `Couldn't ${item.enabled ? "pause" : "resume"} "${item.title}"${errorSuffix(error)}`,
      });
    } finally {
      setTogglingAutomationId(null);
    }
  }

  return (
    <MobileScreen contentStyle={[styles.screenContent, { paddingBottom: scrollContentBottomPadding }]}>
      {/* Native headers have no subtitle slot, so this caption (moved out of
          the route, where it rendered under the title) reads as body content
          below the "Automations" large title. It's the scroll view's first
          child, so it collapses the large title on scroll like the rest. */}
      <Text style={styles.subtitle}>Scheduled runs</Text>
      <View style={styles.intro}>
        <Text style={styles.introText}>Cloud automations you set up on desktop or web.</Text>
      </View>

      {inventory.loadState.kind === "loading" ? (
        <MobileEmptyState title="Loading automations" body="Fetching scheduled cloud work." />
      ) : inventory.loadState.kind === "unavailable" ? (
        // The deployed server has no /v1/automations route mounted (see
        // server/proliferate/main.py — AUTOMATIONS PARKED) rather than a
        // network/auth failure, so this is worded as a server capability gap,
        // not something a retry or re-login would fix.
        <MobileEmptyState
          title="Automations aren't available on this server yet"
          body="This server build doesn't support scheduled automations yet. Check back after the next deploy."
        />
      ) : inventory.loadState.kind === "error" ? (
        <MobileEmptyState
          title="Could not load automations"
          body="Refresh later or sign in again."
        />
      ) : inventory.loadState.kind === "empty" ? (
        <MobileEmptyState
          title="No automations yet"
          body="Create cloud automations from desktop or web. They'll appear here so you can pause, resume, and check status."
        />
      ) : (
        <View style={styles.groups}>
          {inventory.groups.map((group) => (
            <View key={group.id} style={styles.group}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{group.label}</Text>
                <Text style={styles.sectionCount}>{group.count}</Text>
              </View>
              <View style={styles.list}>
                {group.items.map((item) => (
                  <AutomationRow
                    key={item.id}
                    item={item}
                    busy={togglingAutomationId === item.id}
                    onPress={() => onOpenAutomation(item.id)}
                    onToggle={() => void toggleAutomation(item)}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.footnote}>
        Mobile is view-only. Create or edit automations on desktop or web.
      </Text>
    </MobileScreen>
  );
}

function errorSuffix(error: unknown): string {
  return error instanceof Error && error.message ? `: ${error.message}` : ".";
}

function AutomationRow({
  item,
  busy,
  onPress,
  onToggle,
}: {
  item: AutomationInventoryItemView;
  busy: boolean;
  onPress: () => void;
  onToggle: () => void;
}) {
  return (
    <MobileListRow
      onPress={onPress}
      leading={<MobileStatusDot status={item.enabled ? "running" : "paused"} size={8} />}
      title={item.title}
      subtitle={`${item.scheduleLabel} · ${item.repoLabel}`}
      trailing={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={item.enabled ? "Pause automation" : "Resume automation"}
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onToggle}
          style={({ pressed }) => [
            styles.statusPill,
            !item.enabled && styles.statusPillPaused,
            busy && styles.statusPillDisabled,
            pressed && styles.pressed,
          ]}
        >
          <MobileIcon name="calendar-clock" size={12} color={item.enabled ? colors.success : colors.faint} />
          {/* Verbatim from product-domain's inventory-list.ts (same status
              text web's AutomationInventoryList renders) — not the invented
              "On"/"Paused" pair this row used before. */}
          <Text style={[styles.statusText, !item.enabled && styles.statusTextPaused]}>
            {item.statusLabel}
          </Text>
        </Pressable>
      }
    />
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  subtitle: {
    color: colors.faint,
    fontSize: 12,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[1],
  },
  intro: {
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  introText: {
    color: colors.faint,
    fontSize: 12.5,
    lineHeight: 17,
  },
  groups: {
    gap: spacing[5],
  },
  group: {
    gap: 0,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingHorizontal: spacing[4],
    paddingTop: spacing[4],
    paddingBottom: spacing[1],
  },
  sectionTitle: {
    color: colors.faint,
    fontSize: 12.5,
    fontWeight: "600",
  },
  sectionCount: {
    color: colors.faint,
    fontSize: 12.5,
  },
  list: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
  },
  statusPill: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    borderRadius: radius.full,
    backgroundColor: colors.successSubtle,
  },
  statusPillPaused: {
    backgroundColor: colors.accent,
  },
  statusPillDisabled: {
    opacity: 0.55,
  },
  statusText: {
    color: colors.success,
    fontSize: 11.5,
    fontWeight: "600",
  },
  statusTextPaused: {
    color: colors.faint,
  },
  footnote: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[5],
    color: colors.faint,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  pressed: {
    opacity: 0.7,
  },
});
