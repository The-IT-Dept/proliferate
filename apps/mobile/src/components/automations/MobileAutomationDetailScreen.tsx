import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAutomationActions } from "@proliferate/cloud-sdk-react";

import { useMobileAutomationDetail } from "../../hooks/automations/derived/use-mobile-automation-detail";
import { mobileAutomationStatusDotTone } from "../../lib/domain/automations/mobile-automation-status-dot";
import { useMobileToast } from "../../providers/MobileToastProvider";
import { MobileListRow } from "../primitives/MobileListRow";
import { MobileEmptyState, MobileScreen } from "../primitives/MobileLayout";
import { MobileStatusDot } from "../primitives/MobileStatusDot";
import { colors, radius, spacing } from "../../styles/tokens";

interface MobileAutomationDetailScreenProps {
  automationId: string;
}

/**
 * One automation's detail pane: schedule/target/scope summary, prompt,
 * Run now / Pause / Resume, and run history. Mirrors web's
 * `AutomationDetailSurface` (`apps/packages/product-ui/src/automations`),
 * narrowed to view + trigger only — the field-level definition editor
 * (`onEdit` there) is out of scope for mobile (it depends on
 * `@proliferate/product-surfaces`, a flagged dependency the IA calls out
 * separately). Failures toast rather than an inline "Workflow action
 * failed" banner, per this build's mobile feedback convention (Group C/I1).
 */
export function MobileAutomationDetailScreen({ automationId }: MobileAutomationDetailScreenProps) {
  const detail = useMobileAutomationDetail(automationId);
  const actions = useAutomationActions();
  const toast = useMobileToast();

  const busy = actions.pausingAutomation || actions.resumingAutomation || actions.runningAutomationNow;

  async function runNow() {
    try {
      await actions.runAutomationNow(automationId);
      toast.show({ tone: "success", message: "Run queued." });
    } catch (error) {
      toast.show({ tone: "error", message: `Couldn't queue a run${errorSuffix(error)}` });
    }
  }

  async function toggle() {
    if (!detail.item) return;
    try {
      if (detail.item.enabled) {
        await actions.pauseAutomation(automationId);
      } else {
        await actions.resumeAutomation(automationId);
      }
    } catch (error) {
      toast.show({
        tone: "error",
        message: `Couldn't ${detail.item.enabled ? "pause" : "resume"} this automation${errorSuffix(error)}`,
      });
    }
  }

  if (detail.notFound) {
    return (
      <MobileScreen contentStyle={styles.screenContent}>
        <View style={styles.centered}>
          <Text style={styles.centeredTitle}>Automation not found</Text>
          <Text style={styles.centeredText}>It may have been deleted or you may not have access to it.</Text>
        </View>
      </MobileScreen>
    );
  }

  if (detail.loadingAutomation || !detail.item || !detail.automation) {
    return (
      <MobileScreen contentStyle={styles.screenContent}>
        <MobileEmptyState title="Loading automation" body="Fetching automation details." />
      </MobileScreen>
    );
  }

  const item = detail.item;
  const runNowDisabledReason = item.runNowDisabledReason
    ?? (!item.enabled ? "Resume before queueing a run." : null);

  return (
    <MobileScreen contentStyle={styles.screenContent}>
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <MobileStatusDot status={item.enabled ? "running" : "paused"} size={9} />
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
        </View>
        <Text style={styles.meta}>
          {[item.repoLabel, item.scopeLabel, item.targetLabel, item.scheduleLabel, item.nextRunLabel]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        {detail.automation.prompt ? (
          <View style={styles.promptBlock}>
            <Text style={styles.promptLabel}>Prompt</Text>
            <Text style={styles.promptText}>{detail.automation.prompt}</Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          <ActionButton
            label="Run now"
            disabled={busy || Boolean(runNowDisabledReason)}
            disabledReason={runNowDisabledReason}
            onPress={() => void runNow()}
          />
          <ActionButton
            label={item.enabled ? "Pause" : "Resume"}
            disabled={busy}
            disabledReason={null}
            onPress={() => void toggle()}
          />
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Run history</Text>
        <Text style={styles.sectionCount}>{detail.runs.length}</Text>
      </View>
      {detail.loadingRuns ? (
        <MobileEmptyState title="Loading runs" />
      ) : detail.runs.length === 0 ? (
        <MobileEmptyState title="No runs queued yet" />
      ) : (
        <View style={styles.runList}>
          {detail.runs.map((run) => (
            <MobileListRow
              key={run.id}
              leading={<MobileStatusDot status={mobileAutomationStatusDotTone(run.statusKind)} size={8} />}
              title={run.title}
              subtitle={run.timestampLabel}
              trailing={<Text style={styles.runTrigger}>{run.triggerLabel}</Text>}
            />
          ))}
        </View>
      )}
    </MobileScreen>
  );
}

function errorSuffix(error: unknown): string {
  return error instanceof Error && error.message ? `: ${error.message}` : ".";
}

function ActionButton({
  label,
  disabled,
  disabledReason,
  onPress,
}: {
  label: string;
  disabled: boolean;
  disabledReason: string | null;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={disabledReason ? `${label}: ${disabledReason}` : label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        disabled && styles.actionButtonDisabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.actionButtonText, disabled && styles.actionButtonTextDisabled]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
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
    textAlign: "center",
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing[4],
    gap: spacing[2],
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: colors.fg,
    fontSize: 17,
    fontWeight: "600",
  },
  meta: {
    color: colors.faint,
    fontSize: 12.5,
    lineHeight: 17,
  },
  promptBlock: {
    marginTop: spacing[2],
    paddingTop: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
    gap: 4,
  },
  promptLabel: {
    color: colors.faint,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  promptText: {
    color: colors.fg,
    fontSize: 13.5,
    lineHeight: 19,
  },
  actions: {
    marginTop: spacing[3],
    flexDirection: "row",
    gap: spacing[2],
  },
  actionButton: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    color: colors.fg,
    fontSize: 13.5,
    fontWeight: "600",
  },
  actionButtonTextDisabled: {
    color: colors.faint,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingTop: spacing[5],
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
  runList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLight,
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  runTrigger: {
    color: colors.faint,
    fontSize: 11.5,
  },
  pressed: {
    opacity: 0.7,
  },
});
