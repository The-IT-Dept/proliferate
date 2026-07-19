import { useCallback, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useAgentsQuery, useAgentGatewayModelsQuery, useRefreshAgentGatewayModelsMutation } from "@anyharness/sdk-react";
import { GlassSurface } from "@proliferate/design/glass";

import { useMobileToast } from "../../../providers/MobileToastProvider";
import { useAgentLoginTerminalWorkflow } from "../../../hooks/agent-auth/workflows/use-agent-login-terminal-workflow";
import { deriveAgentCliAuthStatus } from "../../../lib/domain/agent-auth/agent-auth-status";
import { shouldShowLoginTerminalPanel } from "../../../lib/domain/agent-auth/agent-login-terminal";
import {
  GATEWAY_MODEL_CATALOG_COPY,
  deriveGatewayModelCatalogView,
} from "../../../lib/domain/agent-auth/gateway-model-catalog";
import { getProviderDisplayName } from "../../../lib/domain/agent-auth/provider-display";
import { MobileIcon } from "../../primitives/MobileIcon";
import { MobileScreen } from "../../primitives/MobileLayout";
import { MobileAgentLoginTerminalPanel } from "./MobileAgentLoginTerminalPanel";
import { colors, radius, spacing } from "../../../styles/tokens";

interface MobileAgentAuthDetailScreenProps {
  kind: string;
}

/**
 * Group H — one agent's harness pane: auth status, the device-code login
 * terminal (the primary feature — this is what makes "Claude not logged in"
 * go away), the auth methods it supports, and its gateway model catalog.
 * Mirrors web's `HarnessPane`'s cloud surface, narrowed to what's real for
 * cloud-only mobile — see this group's report for the web sections
 * deliberately NOT ported (the gateway/api_key auth-ROUTING editor, a
 * separate `@proliferate/cloud-sdk-react`-backed subsystem outside this
 * group's SDK surface).
 */
export function MobileAgentAuthDetailScreen({ kind }: MobileAgentAuthDetailScreenProps) {
  const toast = useMobileToast();
  const agentsQuery = useAgentsQuery();
  const agent = agentsQuery.data?.find((candidate) => candidate.kind === kind) ?? null;
  const displayName = agent ? getProviderDisplayName(agent.kind) : getProviderDisplayName(kind);

  const workflow = useAgentLoginTerminalWorkflow();
  const session = workflow.sessionsByKind[kind] ?? null;

  const gatewayModelsQuery = useAgentGatewayModelsQuery(kind);
  const refreshGatewayModels = useRefreshAgentGatewayModelsMutation();
  const catalogView = deriveGatewayModelCatalogView({
    response: gatewayModelsQuery.data,
    isLoading: gatewayModelsQuery.isLoading,
    isFetching: gatewayModelsQuery.isFetching,
  });

  const handleAuthenticate = useCallback(() => {
    if (!agent) return;
    void workflow.openAuthTerminal(agent, { restart: Boolean(session) });
  }, [agent, session, workflow]);

  const handleRefreshModels = useCallback(() => {
    refreshGatewayModels.mutate(kind, {
      onError: (error) => {
        toast.show({
          tone: "error",
          message: error.message || `Could not refresh the ${displayName} model catalog.`,
        });
      },
    });
  }, [displayName, kind, refreshGatewayModels, toast]);

  if (agentsQuery.isLoading) {
    return (
      <MobileScreen contentStyle={styles.screenContent}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.fg} />
        </View>
      </MobileScreen>
    );
  }

  if (agentsQuery.isError || !agent) {
    return (
      <MobileScreen contentStyle={styles.screenContent}>
        <Pressable style={styles.centered} onPress={() => void agentsQuery.refetch()}>
          <Text style={styles.centeredTitle}>Couldn't load this agent</Text>
          <Text style={styles.centeredText}>Tap to retry.</Text>
        </Pressable>
      </MobileScreen>
    );
  }

  const cliStatus = deriveAgentCliAuthStatus(agent);
  const showLoginTerminal = shouldShowLoginTerminalPanel(session);

  return (
    <MobileScreen contentStyle={styles.screenContent}>
      <Section eyebrow="Authentication">
        <View style={styles.statusRow}>
          <Text style={[styles.statusLabel, { color: toneColor(cliStatus.tone) }]}>
            {cliStatus.label}
          </Text>
        </View>

        {!workflow.connectionAvailable ? (
          <Text style={styles.bodyMuted}>
            No cloud sandbox is connected yet — sign-in will be available once one is.
          </Text>
        ) : cliStatus.canRunLogin ? (
          <GlassSurface variant="fab" glassStyle="clear" style={styles.authenticateSurface}>
            <Pressable
              accessibilityRole="button"
              disabled={session?.isStarting ?? false}
              onPress={handleAuthenticate}
              style={styles.authenticateButton}
            >
              {session?.isStarting ? (
                <ActivityIndicator color={colors.background} size="small" />
              ) : (
                <MobileIcon name="lock" size={14} color={colors.background} />
              )}
              <Text style={styles.authenticateLabel}>
                {session?.isStarting ? "Opening..." : "Authenticate"}
              </Text>
            </Pressable>
          </GlassSurface>
        ) : null}

        {showLoginTerminal && session ? (
          <MobileAgentLoginTerminalPanel
            session={session}
            onExit={(exitedKind, code) => void workflow.handleTerminalExit(exitedKind, code)}
            onRestart={handleAuthenticate}
            onClose={() => void workflow.closeAuthTerminal(kind)}
          />
        ) : null}
      </Section>

      <Section eyebrow="Sign-in method">
        <View style={styles.methodRow}>
          <MobileIcon name="terminal" size={16} color={colors.fg} />
          <View style={styles.methodText}>
            <Text style={styles.methodTitle}>Subscription login</Text>
            <Text style={styles.methodSubtitle}>
              {agent.supportsLogin
                ? "Device-code sign-in, run inside your cloud sandbox."
                : `${displayName} doesn't support in-app sign-in on Cloud yet.`}
            </Text>
          </View>
        </View>
      </Section>

      <Section
        eyebrow="Models"
        trailing={
          <Pressable
            accessibilityRole="button"
            disabled={refreshGatewayModels.isPending}
            onPress={handleRefreshModels}
            hitSlop={8}
          >
            <Text style={styles.refreshLabel}>
              {refreshGatewayModels.isPending
                ? GATEWAY_MODEL_CATALOG_COPY.refreshing
                : GATEWAY_MODEL_CATALOG_COPY.refresh}
            </Text>
          </Pressable>
        }
      >
        {catalogView.freshnessSource ? (
          <Text style={styles.freshness}>
            {catalogView.freshnessSource === "probe" && catalogView.freshnessProbedAt
              ? GATEWAY_MODEL_CATALOG_COPY.freshnessProbed(
                new Date(catalogView.freshnessProbedAt).toLocaleString(),
              )
              : GATEWAY_MODEL_CATALOG_COPY.freshnessSeed}
          </Text>
        ) : null}

        {catalogView.phase === "loading" ? (
          <Text style={styles.bodyMuted}>{GATEWAY_MODEL_CATALOG_COPY.loading}</Text>
        ) : catalogView.phase === "probing" ? (
          <View style={styles.probingRow}>
            <ActivityIndicator color={colors.faint} size="small" />
            <Text style={styles.bodyMuted}>{GATEWAY_MODEL_CATALOG_COPY.probing}</Text>
          </View>
        ) : catalogView.phase === "empty" ? (
          <Text style={styles.bodyMuted}>{GATEWAY_MODEL_CATALOG_COPY.empty}</Text>
        ) : (
          <View style={styles.modelsCard}>
            {catalogView.rows.map((model) => (
              <View key={model.id} style={styles.modelRow}>
                <View style={styles.modelText}>
                  <Text style={styles.modelTitle} numberOfLines={1}>
                    {model.displayName}
                  </Text>
                  {model.description ? (
                    <Text style={styles.modelSubtitle} numberOfLines={2}>
                      {model.description}
                    </Text>
                  ) : null}
                </View>
                {model.provider ? <Text style={styles.modelProvider}>{model.provider}</Text> : null}
              </View>
            ))}
          </View>
        )}
      </Section>
    </MobileScreen>
  );
}

function Section({
  eyebrow,
  trailing,
  children,
}: {
  eyebrow: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionEyebrow}>{eyebrow}</Text>
        {trailing}
      </View>
      {children}
    </View>
  );
}

function toneColor(tone: "muted" | "success" | "warning" | "destructive"): string {
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

const styles = StyleSheet.create({
  screenContent: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
    paddingBottom: spacing[8],
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
  section: {
    marginBottom: spacing[5],
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing[2],
  },
  sectionEyebrow: {
    color: colors.sidebarMutedForeground,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  statusRow: {
    marginBottom: spacing[2],
  },
  statusLabel: {
    fontSize: 14.5,
    fontWeight: "600",
  },
  bodyMuted: {
    color: colors.faint,
    fontSize: 12.5,
    lineHeight: 18,
  },
  authenticateSurface: {
    alignSelf: "flex-start",
    borderRadius: radius.full,
  },
  authenticateButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    height: 38,
    paddingHorizontal: spacing[4],
  },
  authenticateLabel: {
    color: colors.background,
    fontSize: 13.5,
    fontWeight: "600",
  },
  methodRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing[2],
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing[3],
  },
  methodText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  methodTitle: {
    color: colors.fg,
    fontSize: 13.5,
    fontWeight: "600",
  },
  methodSubtitle: {
    color: colors.faint,
    fontSize: 12,
    lineHeight: 16,
  },
  refreshLabel: {
    color: colors.info,
    fontSize: 12.5,
    fontWeight: "600",
  },
  freshness: {
    color: colors.faint,
    fontSize: 11,
    marginBottom: spacing[1],
  },
  probingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  modelsCard: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: "hidden",
  },
  modelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  modelText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  modelTitle: {
    color: colors.fg,
    fontSize: 13,
    fontWeight: "500",
  },
  modelSubtitle: {
    color: colors.faint,
    fontSize: 11.5,
    lineHeight: 15,
  },
  modelProvider: {
    color: colors.faint,
    fontSize: 11,
  },
});
