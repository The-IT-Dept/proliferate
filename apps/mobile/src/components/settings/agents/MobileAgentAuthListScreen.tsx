import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { AgentSummary } from "@anyharness/sdk";
import { useAgentsQuery } from "@anyharness/sdk-react";

import { MobileIcon } from "../../primitives/MobileIcon";
import { MobileScreen } from "../../primitives/MobileLayout";
import { deriveAgentReadinessStatus, type AgentAuthStatusTone } from "../../../lib/domain/agent-auth/agent-auth-status";
import { getProviderDisplayName } from "../../../lib/domain/agent-auth/provider-display";
import { colors, radius, spacing } from "../../../styles/tokens";

interface MobileAgentAuthListScreenProps {
  onOpenAgent: (kind: string) => void;
}

/**
 * Group H — the harness/agent-auth list, the Settings sub-screen the
 * composer's "Agents" affordance and the Settings ACCOUNT row both push into
 * (IA: per-agent auth status, entry point to the device-code login). Mirrors
 * what web's harness sidebar list shows per agent (displayName +
 * `HarnessStatusDot`-derived status), via `useAgentsQuery`
 * (`@anyharness/sdk-react`, RUNTIME-scoped — agent auth is account-level, not
 * workspace-scoped).
 */
export function MobileAgentAuthListScreen({ onOpenAgent }: MobileAgentAuthListScreenProps) {
  const agentsQuery = useAgentsQuery();
  const agents = agentsQuery.data ?? [];

  return (
    <MobileScreen contentStyle={styles.screenContent}>
      <Text style={styles.subtitle}>Sign in and manage models for each coding agent.</Text>

      {agentsQuery.isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.fg} />
        </View>
      ) : agentsQuery.isError ? (
        <Pressable style={styles.centered} onPress={() => void agentsQuery.refetch()}>
          <Text style={styles.centeredTitle}>Couldn't load agents</Text>
          <Text style={styles.centeredText}>Tap to retry.</Text>
        </Pressable>
      ) : agents.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.centeredTitle}>No agents available</Text>
        </View>
      ) : (
        <View style={styles.card}>
          {agents.map((agent) => (
            <AgentRow key={agent.kind} agent={agent} onPress={() => onOpenAgent(agent.kind)} />
          ))}
        </View>
      )}
    </MobileScreen>
  );
}

function AgentRow({ agent, onPress }: { agent: AgentSummary; onPress: () => void }) {
  const status = deriveAgentReadinessStatus(agent);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.rowIconTile}>
        <MobileIcon name={agentIconName(agent.kind)} size={17} color={colors.fg} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {getProviderDisplayName(agent.kind)}
        </Text>
      </View>
      <StatusDot visible={status.dotVisible} tone={status.dotTone} />
      <Text style={[styles.rowValue, { color: toneColor(status.tone) }]} numberOfLines={1}>
        {status.label}
      </Text>
      <MobileIcon name="chevron-right" size={15} color={colors.faint} />
    </Pressable>
  );
}

function StatusDot({ visible, tone }: { visible: boolean; tone: "warning" | "destructive" | null }) {
  if (!visible || !tone) {
    return null;
  }
  return (
    <View
      style={[
        styles.dot,
        { backgroundColor: tone === "warning" ? colors.warning : colors.destructive },
      ]}
    />
  );
}

function toneColor(tone: AgentAuthStatusTone): string {
  switch (tone) {
    case "success":
      return colors.success;
    case "warning":
      return colors.warning;
    case "destructive":
      return colors.destructive;
    default:
      return colors.faint;
  }
}

function agentIconName(kind: string): "claude" | "openai" | "terminal" {
  if (kind === "claude") return "claude";
  if (kind === "codex") return "openai";
  return "terminal";
}

const styles = StyleSheet.create({
  screenContent: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
  },
  subtitle: {
    color: colors.faint,
    fontSize: 12,
    paddingBottom: spacing[3],
  },
  centered: {
    paddingVertical: spacing[8],
    alignItems: "center",
    gap: spacing[1],
  },
  centeredTitle: {
    color: colors.fg,
    fontSize: 14.5,
    fontWeight: "600",
  },
  centeredText: {
    color: colors.faint,
    fontSize: 12.5,
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: "hidden",
  },
  row: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  rowPressed: {
    backgroundColor: colors.accent,
  },
  rowIconTile: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceControl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    color: colors.fg,
    fontSize: 14.5,
    fontWeight: "500",
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: radius.full,
  },
  rowValue: {
    fontSize: 12.5,
    fontWeight: "500",
    maxWidth: 130,
  },
});
