import { useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";

import { useMobileHomeLaunchModel } from "../../hooks/home/derived/use-mobile-home-launch-model";
import { useMobileHomeLaunchActions } from "../../hooks/home/workflows/use-mobile-home-launch-actions";
import { useMobileCloudRepoReadiness } from "../../hooks/access/cloud/repositories/use-mobile-cloud-repo-readiness";
import { useVisualViewportKeyboardInset } from "../../hooks/ui/keyboard/use-visual-viewport-keyboard-inset";
import { useMobileWorkInventory } from "../../hooks/work/derived/use-mobile-work-inventory";
import { formatMobileHomeDateEyebrow } from "../../lib/domain/home/mobile-home-date";
import {
  deriveMobileHomeLaunchEnablement,
  resolveMobileModelAvailabilityNotice,
} from "../../lib/domain/home/mobile-home-launch-enablement";
import { summarizeMobileHomeLaunchConfig } from "../../lib/domain/home/mobile-home-config-summary";
import type { MobileCloudChat } from "../../lib/domain/workspace/mobile-workspace-chat";
import { MobileIcon } from "../primitives/MobileIcon";
import { colors, spacing } from "../../styles/tokens";
import { MobileBranchPickerSheet } from "./MobileBranchPickerSheet";
import { MobileHomeComposer } from "./screen/MobileHomeComposer";
import { MobileHomeConfigSheet } from "./screen/MobileHomeConfigSheet";
import { MobileHomeRecentSection } from "./screen/MobileHomeRecentSection";
import { MobileHomeRepoPopover } from "./screen/MobileHomeRepoPopover";

interface MobileHomeScreenProps {
  ownerUserId: string | null;
  onOpenChat: (chat: MobileCloudChat) => void;
  onConfigureRepos: () => void;
  /**
   * The "Agents" affordance on the model-availability notice (web parity —
   * `HomeNextScreen`'s `handleHomeAction("agent-settings")`). No dedicated
   * agent-setup/harness screen exists on mobile yet, so this navigates to
   * the Settings tab — the same target `onConfigureRepos` already uses.
   */
  onOpenAgents: () => void;
}

type HomeSheet = "repo" | "branch" | "config" | null;

const RECENT_LIMIT = 3;
// Baseline breathing room under the last row. The tab-bar footprint itself is
// now applied natively by NativeTabs' automatic content inset (see the
// KeyboardAwareScrollView's `contentInsetAdjustmentBehavior` below), so this is
// no longer the ~140pt "reserve the whole floating bar" hack it used to be.
const SCROLL_CONTENT_BOTTOM_PADDING = spacing[8];

export function MobileHomeScreen({
  ownerUserId,
  onOpenChat,
  onConfigureRepos,
  onOpenAgents,
}: MobileHomeScreenProps) {
  const keyboardInset = useVisualViewportKeyboardInset();
  // The native tab bar (app/(tabs)/_layout.tsx) computes its own content
  // insets for the first scroll view in a tab screen, so this no longer
  // needs to reserve a floating bar's footprint by hand - just the
  // screen's own baseline bottom padding.
  const scrollContentBottomPadding = SCROLL_CONTENT_BOTTOM_PADDING;
  const [draft, setDraft] = useState("");
  const [sheet, setSheet] = useState<HomeSheet>(null);
  const launchModel = useMobileHomeLaunchModel();
  const recentInventory = useMobileWorkInventory();
  const recentItems = recentInventory.recentItems.slice(0, RECENT_LIMIT);
  // Gate workspace creation on the same managed-Cloud / GitHub App readiness
  // the Add Repository modal uses, resolved for the selected repo.
  const cloudRepoReadiness = useMobileCloudRepoReadiness({
    enabled: Boolean(launchModel.selectedRepo),
    repo: launchModel.selectedRepo
      ? {
          gitOwner: launchModel.selectedRepo.gitOwner,
          gitRepoName: launchModel.selectedRepo.gitRepoName,
        }
      : null,
  });
  // Skip surfacing a blocked reason while readiness is still resolving —
  // otherwise a fully-configured deployment briefly shows the operator
  // "not configured" copy (the readiness gate fail-closes to "disabled"
  // before /meta resolves).
  const readinessBlockedReason = launchModel.selectedRepo
      && !cloudRepoReadiness.checking
      && cloudRepoReadiness.blocker
    ? cloudRepoReadiness.blocker.description
    : null;
  const launchActions = useMobileHomeLaunchActions({
    ownerUserId,
    catalog: launchModel.agentCatalog.data,
    launchableAgentKinds: launchModel.launchableAgentKinds,
    selectedRepo: launchModel.selectedRepo,
    selectedBaseBranch: launchModel.selectedBaseBranch,
    selectedRuntime: launchModel.selectedRuntime,
    selection: launchModel.resolvedLaunchSelection,
    onOpenChat,
    onSubmitted: () => setDraft(""),
    readinessBlockedReason,
  });
  const launchConfigSummary = summarizeMobileHomeLaunchConfig(
    launchModel.launchComposerControls,
    launchModel.selectedRuntime?.label ?? "Runtime",
  );
  // Mirrors the web home composer's launch-enablement derivation (repo
  // selected + base branch resolved → can create), extended with the
  // readiness/harness gates this screen already enforces elsewhere.
  const launchEnablement = deriveMobileHomeLaunchEnablement({
    draft,
    hasSelectedRepo: Boolean(launchModel.selectedRepo),
    branchesLoading: launchModel.repoBranches.isLoading,
    branchesError: launchModel.repoBranches.isError,
    branchOptionsCount: launchModel.branchOptions.length,
    selectedBaseBranch: launchModel.selectedBaseBranch,
    readinessBlockedReason,
    modelAvailabilityState: launchModel.modelAvailabilityState,
    submitting: launchActions.submitting,
  });
  // The web-verbatim model-availability notice (HomeNextScreen's
  // `modelAvailabilityNotice`) — a separate persistent banner, shown
  // regardless of draft text, never folded into `launchEnablement.disabledReason`.
  const modelAvailabilityNotice = resolveMobileModelAvailabilityNotice(
    launchModel.modelAvailabilityState,
  );
  const dateEyebrow = formatMobileHomeDateEyebrow(new Date());
  const heroRepoName = launchModel.selectedRepo?.gitRepoName ?? null;

  function closeSheet() {
    setSheet(null);
  }

  return (
    <View style={styles.root}>
      {/*
        KeyboardAwareScrollView (react-native-keyboard-controller) rides the
        keyboard on iOS/Android using native keyboard tracking, replacing the
        old KeyboardAvoidingView + manual `behavior`/`keyboardVerticalOffset`
        platform-select. `useVisualViewportKeyboardInset` stays: it's a
        web-only fallback (returns 0 on native) for the mobile-web target,
        which has no native keyboard-controller equivalent to ride.
      */}
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: scrollContentBottomPadding },
          keyboardInset > 0 && { paddingBottom: scrollContentBottomPadding + keyboardInset },
        ]}
        // Root-cause fix: iOS defaults `contentInsetAdjustmentBehavior` to
        // `"never"`, so without this the eyebrow + hero + composer rendered at
        // y=0, under the "Home" large title and the status-bar clock.
        // `"automatic"` applies the large-title TOP inset (and lets the title
        // collapse on scroll, since this is the screen's first/primary
        // scrollable) plus the NativeTabs bottom tab-bar inset.
        contentInsetAdjustmentBehavior="automatic"
        automaticallyAdjustsScrollIndicatorInsets
        bottomOffset={16}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.dateEyebrow}>{dateEyebrow}</Text>
        <Text style={styles.heroTitle}>
          {"What should we\nbuild"}
          {heroRepoName ? (
            <>
              {" in "}
              <Text style={styles.heroRepo}>{heroRepoName}</Text>
            </>
          ) : null}
          {"?"}
        </Text>

        <View style={styles.pillRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose repository"
            onPress={() => setSheet("repo")}
            style={({ pressed }) => [styles.repoPill, styles.repoPillWide, pressed && styles.pressed]}
          >
            <MobileIcon name="folder" size={15} color={colors.mutedForeground} />
            <Text style={styles.repoPillText} numberOfLines={1}>
              {launchModel.selectedRepo?.label ?? "Choose a GitHub repo"}
            </Text>
            <MobileIcon name="chevron-down" size={11} color={colors.faint} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose branch"
            disabled={!launchModel.selectedRepo}
            onPress={() => setSheet("branch")}
            style={({ pressed }) => [
              styles.repoPill,
              styles.branchPill,
              !launchModel.selectedRepo && styles.disabledPill,
              pressed && styles.pressed,
            ]}
          >
            <MobileIcon name="git-branch" size={15} color={colors.mutedForeground} />
            <Text style={styles.repoPillText} numberOfLines={1}>
              {launchModel.selectedBaseBranch
                ?? (launchModel.repoBranches.isLoading ? "Loading" : "Branch")}
            </Text>
            <MobileIcon name="chevron-down" size={11} color={colors.faint} />
          </Pressable>
        </View>

        <MobileHomeComposer
          draft={draft}
          configLabel={launchConfigSummary.label}
          configPending={launchConfigSummary.pending}
          canSubmit={launchEnablement.canSubmit}
          onDraftChange={setDraft}
          onOpenConfig={() => setSheet("config")}
          onSubmit={() => {
            void launchActions.submit(draft);
          }}
        />

        {launchActions.status || launchActions.error || launchEnablement.disabledReason ? (
          <Text style={[styles.launchNote, launchActions.error && styles.launchError]}>
            {launchActions.error ?? launchActions.status ?? launchEnablement.disabledReason}
          </Text>
        ) : null}

        {modelAvailabilityNotice ? (
          <View style={styles.availabilityNotice}>
            <Text style={styles.availabilityNoticeText}>{modelAvailabilityNotice.text}</Text>
            {modelAvailabilityNotice.actionLabel ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={modelAvailabilityNotice.actionLabel}
                onPress={onOpenAgents}
                hitSlop={8}
              >
                <Text style={styles.availabilityNoticeAction}>
                  {modelAvailabilityNotice.actionLabel}
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        <MobileHomeRecentSection items={recentItems} onOpenChat={onOpenChat} />
      </KeyboardAwareScrollView>

      <MobileHomeRepoPopover
        visible={sheet === "repo"}
        loading={launchModel.repoConfigs.isLoading}
        repoOptions={launchModel.repoOptions}
        selectedRepoId={launchModel.selectedRepo?.id ?? null}
        onSelectRepo={launchModel.setRepoId}
        onConfigureRepos={onConfigureRepos}
        onClose={closeSheet}
      />

      <MobileBranchPickerSheet
        visible={sheet === "branch"}
        onClose={closeSheet}
        loading={launchModel.repoBranches.isLoading}
        branches={launchModel.branchOptions}
        selectedBranch={launchModel.selectedBaseBranch}
        repoLabel={launchModel.selectedRepo?.label}
        onSelect={launchModel.setBaseBranch}
      />

      <MobileHomeConfigSheet
        visible={sheet === "config"}
        onClose={closeSheet}
        controls={launchModel.launchComposerControls}
        runtimeOptions={launchModel.runtimeOptions}
        selectedRuntimeId={launchModel.selectedRuntime?.id ?? null}
        onRuntimeSelect={launchModel.setRuntimeId}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing[5],
    // Small gap below the native large title; the header inset itself is
    // applied by the scroll view's automatic contentInsetAdjustmentBehavior,
    // so this is a body gap, not a header clearance hack.
    paddingTop: spacing[3],
    // paddingBottom is set inline (scrollContentBottomPadding).
    gap: spacing[3],
  },
  dateEyebrow: {
    color: colors.info,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: colors.fg,
    fontSize: 30,
    fontWeight: "700",
    lineHeight: 35,
    letterSpacing: -0.3,
    marginTop: spacing[1],
  },
  heroRepo: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 25,
    fontWeight: "600",
  },
  pillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    marginTop: spacing[3],
  },
  repoPill: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[1],
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: spacing[3],
    overflow: "hidden",
  },
  repoPillWide: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "62%",
  },
  branchPill: {
    minWidth: 92,
    maxWidth: "36%",
    flexShrink: 1,
  },
  disabledPill: {
    opacity: 0.55,
  },
  repoPillText: {
    flexShrink: 1,
    minWidth: 0,
    color: colors.fg,
    fontSize: 12,
    fontWeight: "500",
  },
  launchNote: {
    minHeight: 18,
    color: colors.faint,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: spacing[1],
    textAlign: "center",
  },
  launchError: {
    color: colors.destructive,
  },
  availabilityNotice: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: spacing[1],
    marginTop: spacing[1],
    paddingHorizontal: spacing[2],
  },
  availabilityNoticeText: {
    color: colors.faint,
    fontSize: 12.5,
    lineHeight: 18,
    textAlign: "center",
  },
  availabilityNoticeAction: {
    color: colors.fg,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  pressed: {
    opacity: 0.7,
  },
});
