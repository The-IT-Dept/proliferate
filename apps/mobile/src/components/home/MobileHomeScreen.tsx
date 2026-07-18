import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useMobileHomeLaunchModel } from "../../hooks/home/derived/use-mobile-home-launch-model";
import { useMobileHomeLaunchActions } from "../../hooks/home/workflows/use-mobile-home-launch-actions";
import { useMobileCloudRepoReadiness } from "../../hooks/access/cloud/repositories/use-mobile-cloud-repo-readiness";
import { useVisualViewportKeyboardInset } from "../../hooks/ui/keyboard/use-visual-viewport-keyboard-inset";
import { useMobileWorkInventory } from "../../hooks/work/derived/use-mobile-work-inventory";
import { formatMobileHomeDateEyebrow } from "../../lib/domain/home/mobile-home-date";
import { deriveMobileHomeLaunchEnablement } from "../../lib/domain/home/mobile-home-launch-enablement";
import { summarizeMobileHomeLaunchConfig } from "../../lib/domain/home/mobile-home-config-summary";
import type { MobileCloudChat } from "../../navigation/navigation-model";
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
}

type HomeSheet = "repo" | "branch" | "config" | null;

const RECENT_LIMIT = 3;
const SCROLL_CONTENT_BOTTOM_PADDING = 140;

export function MobileHomeScreen({
  ownerUserId,
  onOpenChat,
  onConfigureRepos,
}: MobileHomeScreenProps) {
  const keyboardInset = useVisualViewportKeyboardInset();
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
    harnessUnavailableReason: launchModel.harnessAvailability.message,
    submitting: launchActions.submitting,
  });
  const dateEyebrow = formatMobileHomeDateEyebrow(new Date());
  const heroRepoName = launchModel.selectedRepo?.gitRepoName ?? null;

  function closeSheet() {
    setSheet(null);
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.select({ ios: "padding", default: undefined })}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          keyboardInset > 0 && { paddingBottom: SCROLL_CONTENT_BOTTOM_PADDING + keyboardInset },
        ]}
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

        {launchActions.status
          || launchActions.error
          || launchEnablement.disabledReason
          || launchModel.harnessAvailability.message ? (
            <Text style={[styles.launchNote, launchActions.error && styles.launchError]}>
              {launchActions.error
                ?? launchActions.status
                ?? launchEnablement.disabledReason
                // Model/harness availability (web: modelAvailabilityNotice) is a
                // persistent notice — shown regardless of draft text, unlike the
                // repo/branch target reason above it.
                ?? launchModel.harnessAvailability.message}
            </Text>
          ) : null}

        <MobileHomeRecentSection items={recentItems} onOpenChat={onOpenChat} />
      </ScrollView>

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
    </KeyboardAvoidingView>
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
    paddingTop: spacing[8],
    paddingBottom: SCROLL_CONTENT_BOTTOM_PADDING,
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
  pressed: {
    opacity: 0.7,
  },
});
