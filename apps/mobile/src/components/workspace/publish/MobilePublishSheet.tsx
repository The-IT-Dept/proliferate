import { useEffect } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MobileIcon } from "../../primitives/MobileIcon";
import { MobileTextInput } from "../../primitives/MobileTextInput";
import { MobilePrStatusBadge } from "../diff/MobilePrStatusBadge";
import { prStatusKindFromSummary } from "../../../lib/domain/workspace/mobile-pr-status";
import type { MobilePublishWorkflow } from "../../../hooks/workspace/workflows/use-mobile-publish-workflow";
import type { PublishRunPhase } from "../../../lib/domain/workspace/mobile-publish-run-state";
import { colors, radius, spacing } from "../../../styles/tokens";

interface MobilePublishSheetProps {
  visible: boolean;
  publish: MobilePublishWorkflow;
  onClose: () => void;
}

const PHASE_LABEL: Partial<Record<PublishRunPhase, string>> = {
  committing: "Committing…",
  pushing: "Pushing…",
  creatingPr: "Creating pull request…",
};

/**
 * Row 29 — the publish sheet (scope: select which files publish via the
 * "Include unstaged changes" toggle over `publish-file-groups`, a commit
 * message input, and the commit+push(+create/update PR) action). Body
 * mirrors web's `PublishDialog`
 * (`product-client/src/components/workspace/git/PublishDialog.tsx`) almost
 * exactly, minus the intent-tab footer and PR-authoring form fields (mobile
 * has neither — see `mobile-publish-view.ts`'s module doc): a commit
 * textarea shown only while there are dirty changes, the same
 * "Include unstaged changes" checkbox gated on `hasUnstagedChanges`, the
 * same partial-file warning copy, and the same `publishStatus` line when the
 * tree is clean. `title`'s three-way ternary is copied verbatim from
 * `PublishDialog`'s (dropping the outer `intent === "pull_request"` check
 * since mobile's intent is always fixed).
 *
 * Progress while submitting comes from the mobile-only
 * `PublishRunPhase` (`mobile-publish-run-state.ts`) — web has no per-step
 * progress copy to mirror there, so `PHASE_LABEL` is new. Failures toast
 * (owned by the hook); this component never renders its own error banner,
 * so there's only one place `Failed to publish.`-style copy can appear.
 */
export function MobilePublishSheet({ visible, publish, onClose }: MobilePublishSheetProps) {
  const insets = useSafeAreaInsets();
  const { view } = publish;

  useEffect(() => {
    if (!visible) {
      publish.reset();
    }
    // `publish.reset` is a `useCallback([])`-stable identity (see the hook),
    // so listing it here is both exhaustive and still only actually fires
    // the reset on a real `visible` transition, never on every draft
    // keystroke.
  }, [visible, publish.reset]);

  function close() {
    publish.reset();
    onClose();
  }

  async function handlePrimaryPress() {
    if (view.viewsExistingPrOnly && view.existingPr) {
      void Linking.openURL(view.existingPr.url);
      close();
      return;
    }
    const completed = await publish.submit();
    if (completed) {
      close();
    }
  }

  const stats = [...view.fileGroups.staged, ...view.fileGroups.partial, ...view.fileGroups.unstaged].reduce(
    (total, file) => ({
      additions: total.additions + file.additions,
      deletions: total.deletions + file.deletions,
    }),
    { additions: 0, deletions: 0 },
  );

  const hasDirtyChanges = view.hasStagedChanges || view.hasUnstagedChanges;
  // Verbatim from `PublishDialog`'s title ternary, minus the outer
  // `intent === "pull_request"` branch (mobile's intent is always fixed).
  const title = view.existingPr
    ? (hasDirtyChanges ? "Update pull request" : "Pull request")
    : "Create pull request";

  const primaryDisabled = publish.isLoading
    || publish.isError
    || (!view.viewsExistingPrOnly && !!view.disabledReason);
  const phaseLabel = PHASE_LABEL[publish.phase] ?? null;
  const prBadge = view.existingPr
    ? { kind: prStatusKindFromSummary({ state: view.existingPr.state, draft: view.existingPr.draft }), number: view.existingPr.number }
    : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        // Mirrors web's `ModalShell disableClose={isSubmitting}` — no
        // dismissing mid-publish via the Android back button.
        if (!publish.isSubmitting) {
          close();
        }
      }}
    >
      <KeyboardAvoidingView behavior={Platform.select({ ios: "padding", default: undefined })} style={styles.layer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close publish sheet"
          style={styles.scrim}
          onPress={() => {
            if (!publish.isSubmitting) {
              close();
            }
          }}
        />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <MobileIcon name="git-branch" size={14} color={colors.mutedForeground} />
              <Text style={styles.title}>{title}</Text>
              {view.branchName ? (
                <Text style={styles.branch} numberOfLines={1}>
                  {view.branchName}
                </Text>
              ) : null}
            </View>
            {(stats.additions > 0 || stats.deletions > 0) && (
              <View style={styles.statsRow}>
                {stats.additions > 0 ? <Text style={styles.statsAdd}>+{stats.additions}</Text> : null}
                {stats.deletions > 0 ? <Text style={styles.statsDel}>−{stats.deletions}</Text> : null}
              </View>
            )}
          </View>

          <ScrollView style={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {publish.isError ? (
              <Pressable style={styles.centered} onPress={publish.retry}>
                <Text style={styles.centeredTitle}>Couldn't load git status</Text>
                <Text style={styles.centeredText}>Tap to retry.</Text>
              </Pressable>
            ) : publish.isLoading ? (
              <View style={styles.centered}>
                <ActivityIndicator color={colors.fg} />
              </View>
            ) : (
              <>
                {prBadge ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`View pull request #${prBadge.number}`}
                    onPress={() => void Linking.openURL(view.existingPr!.url)}
                    style={({ pressed }) => [styles.prRow, pressed && styles.pressed]}
                  >
                    <MobilePrStatusBadge kind={prBadge.kind} number={prBadge.number} />
                    <MobileIcon name="external" size={13} color={colors.faint} />
                  </Pressable>
                ) : null}

                {hasDirtyChanges ? (
                  <View style={styles.section}>
                    <MobileTextInput
                      accessibilityLabel="Commit message"
                      value={publish.commitSummary}
                      onChangeText={publish.setCommitSummary}
                      placeholder="Commit message"
                      editable={!publish.isSubmitting}
                      multiline
                      style={styles.commitInput}
                    />
                    {view.hasUnstagedChanges ? (
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: publish.includeUnstaged, disabled: publish.isSubmitting }}
                        disabled={publish.isSubmitting}
                        onPress={() => publish.setIncludeUnstaged(!publish.includeUnstaged)}
                        style={({ pressed }) => [styles.checkboxRow, pressed && styles.pressed]}
                      >
                        <View style={[styles.checkbox, publish.includeUnstaged && styles.checkboxChecked]}>
                          {publish.includeUnstaged ? <MobileIcon name="check" size={12} color={colors.background} /> : null}
                        </View>
                        <Text style={styles.checkboxLabel}>Include unstaged changes</Text>
                      </Pressable>
                    ) : null}
                    {view.partialWarning ? <Text style={styles.warning}>{view.partialWarning}</Text> : null}
                  </View>
                ) : view.publishStatus ? (
                  <Text style={styles.publishStatus}>{view.publishStatus}</Text>
                ) : null}

                {phaseLabel ? (
                  <View style={styles.progressRow}>
                    <ActivityIndicator size="small" color={colors.mutedForeground} />
                    <Text style={styles.progressText}>{phaseLabel}</Text>
                  </View>
                ) : view.disabledReason && !view.viewsExistingPrOnly ? (
                  <Text style={styles.disabledReason}>{view.disabledReason}</Text>
                ) : (
                  <Text style={styles.summary}>{view.summary}</Text>
                )}
              </>
            )}
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: insets.bottom + spacing[3] }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={view.primaryLabel}
              accessibilityState={{ disabled: primaryDisabled || publish.isSubmitting, busy: publish.isSubmitting }}
              disabled={primaryDisabled || publish.isSubmitting}
              onPress={() => void handlePrimaryPress()}
              style={({ pressed }) => [
                styles.primaryButton,
                (primaryDisabled || publish.isSubmitting) && styles.primaryButtonDisabled,
                pressed && styles.pressed,
              ]}
            >
              {publish.isSubmitting ? (
                <ActivityIndicator size="small" color={colors.background} />
              ) : (
                <Text style={styles.primaryButtonLabel}>{view.primaryLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    maxHeight: "82%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderHeavy,
    backgroundColor: colors.popover,
    paddingTop: spacing[2],
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
    paddingHorizontal: spacing[4],
    paddingBottom: spacing[2],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing[3],
  },
  headerTitleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  title: {
    color: colors.fg,
    fontSize: 16,
    fontWeight: "700",
    flexShrink: 0,
  },
  branch: {
    flex: 1,
    minWidth: 0,
    color: colors.faint,
    fontSize: 12.5,
  },
  statsRow: {
    flexDirection: "row",
    gap: 6,
  },
  statsAdd: {
    color: colors.success,
    fontSize: 12.5,
    fontWeight: "600",
  },
  statsDel: {
    color: colors.destructive,
    fontSize: 12.5,
    fontWeight: "600",
  },
  body: {
    paddingHorizontal: spacing[4],
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[1],
    paddingVertical: spacing[8],
  },
  centeredTitle: {
    color: colors.fg,
    fontSize: 15,
    fontWeight: "600",
  },
  centeredText: {
    color: colors.faint,
    fontSize: 13,
  },
  prRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing[3],
    paddingBottom: spacing[2],
    gap: spacing[2],
  },
  commitInput: {
    minHeight: 88,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingVertical: spacing[1],
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.borderHeavy,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: colors.fg,
    borderColor: colors.fg,
  },
  checkboxLabel: {
    color: colors.fg,
    fontSize: 14,
  },
  warning: {
    color: colors.faint,
    fontSize: 12,
    lineHeight: 16,
  },
  publishStatus: {
    color: colors.mutedForeground,
    fontSize: 13,
    paddingTop: spacing[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingVertical: spacing[3],
  },
  progressText: {
    color: colors.mutedForeground,
    fontSize: 13,
  },
  disabledReason: {
    color: colors.faint,
    fontSize: 12.5,
    paddingVertical: spacing[3],
  },
  summary: {
    color: colors.faint,
    fontSize: 12.5,
    paddingVertical: spacing[3],
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: spacing[4],
    paddingTop: spacing[3],
  },
  primaryButton: {
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.fg,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonDisabled: {
    opacity: 0.4,
  },
  primaryButtonLabel: {
    color: colors.background,
    fontSize: 15,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.72,
  },
});
