import { Fragment, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { GitDiffScope } from "@anyharness/sdk";
import {
  useCurrentPullRequestQuery,
  useGitBranchDiffFilesQuery,
  useGitDiffQuery,
  useGitStatusQuery,
} from "@anyharness/sdk-react";

import { MobileIcon } from "../primitives/MobileIcon";
import { MobileDiffViewer } from "./diff/MobileDiffViewer";
import { MobilePrStatusBadge } from "./diff/MobilePrStatusBadge";
import { parseUnifiedDiff } from "../../lib/domain/workspace/mobile-diff-parser";
import {
  buildMobileChangesList,
  MOBILE_DIFF_MODE_OPTIONS,
  mobileDiffModeEmptyMessage,
  summarizeMobileChanges,
  type MobileChangedFile,
  type MobileDiffMode,
} from "../../lib/domain/workspace/mobile-diff-changes";
import { resolveMobileDiffBaseRef } from "../../lib/domain/workspace/mobile-diff-base-ref";
import {
  gitFileStatusAccessibilityLabel,
  gitFileStatusPresentation,
} from "../../lib/domain/workspace/mobile-git-file-status";
import { prStatusKindFromSummary } from "../../lib/domain/workspace/mobile-pr-status";
import { colors, radius, spacing } from "../../styles/tokens";

interface MobileWorkspaceDiffSegmentProps {
  /** Space to clear the floating header + capsule + segmented control
   * above, same contract as the other segment bodies. */
  topInset: number;
}

/**
 * Group G — the workspace shell's Diff segment (IA `Diff (H)`,
 * `mockups.html` frame H "Changes & diff"). Two modes only — "Working tree"
 * (`client.git.getStatus`) and "Branch" (`client.git.listBranchDiffFiles`,
 * against the repo's suggested base branch); "Last turn" from the mockup's
 * three-way pill is dropped, it needs the active chat turn's transcript
 * (Group E territory) which this segment has no access to and shouldn't
 * reach for. Tapping a file selects it (highlighted row) and loads its
 * unified diff via `client.git.getDiff`, parsed by the pure
 * `mobile-diff-parser` and rendered by `MobileDiffViewer` — never a WebView.
 * Everything here is read-only: no commit/push/stage actions (mockup H's
 * bottom "Commit… / Push" dock is out of Group G's scope — a future
 * publish-workflow group owns those mutations), so there is nothing that
 * mutates and nothing to toast; query failures get the same inline
 * "Couldn't load / tap to retry" treatment Sessions and Term use.
 */
export function MobileWorkspaceDiffSegment({ topInset }: MobileWorkspaceDiffSegmentProps) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<MobileDiffMode>("working_tree");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const statusQuery = useGitStatusQuery();
  // I2 — precedence mirrors web's `resolveGitPanelBaseRef`
  // (repoPreferenceDefaultBranch -> repoRootDefaultBranch ->
  // suggestedBaseBranch), but this segment only has `suggestedBaseBranch`
  // available: mobile has no repo-preferences store and no RepoRoot query
  // yet (see `resolveMobileDiffBaseRef`'s doc comment for the full
  // rationale). Narrow, documented divergence — not a regression, since
  // `suggestedBaseBranch` alone was already this surface's whole input.
  const baseRef = resolveMobileDiffBaseRef({
    suggestedBaseBranch: statusQuery.data?.suggestedBaseBranch,
  }) ?? undefined;
  const branchFilesQuery = useGitBranchDiffFilesQuery({
    enabled: mode === "branch",
    baseRef,
  });
  const prQuery = useCurrentPullRequestQuery();

  const rawFiles = mode === "working_tree" ? statusQuery.data?.files : branchFilesQuery.data?.files;
  const files = useMemo(() => buildMobileChangesList(rawFiles ?? []), [rawFiles]);
  const totals = useMemo(() => summarizeMobileChanges(files), [files]);

  // Recomputed from live data every render, same discipline as the terminal
  // roster's active-selection: falls back to the first file when the
  // current selection is missing (list just loaded, or the selected path
  // fell out of the list on a refetch) rather than reconciling via effect
  // state that could go stale.
  const selectedFile: MobileChangedFile | null =
    files.find((file) => file.path === selectedPath) ?? files[0] ?? null;
  useEffect(() => {
    if (selectedFile && selectedFile.path !== selectedPath) {
      setSelectedPath(selectedFile.path);
    }
  }, [selectedFile, selectedPath]);

  const diffScope: GitDiffScope = mode === "working_tree" ? "working_tree" : "branch";
  const diffQuery = useGitDiffQuery({
    path: selectedFile?.path ?? null,
    scope: diffScope,
    baseRef: mode === "branch" ? baseRef : undefined,
    oldPath: selectedFile?.oldPath ?? undefined,
    enabled: !!selectedFile,
  });
  const parsedDiff = useMemo(
    () => parseUnifiedDiff(diffQuery.data?.patch),
    [diffQuery.data?.patch],
  );

  const isListLoading = mode === "working_tree" ? statusQuery.isLoading : branchFilesQuery.isLoading;
  const isListError = mode === "working_tree" ? statusQuery.isError : branchFilesQuery.isError;
  const refetchList = mode === "working_tree" ? statusQuery.refetch : branchFilesQuery.refetch;

  const branch = statusQuery.data?.currentBranch ?? null;
  const pr = prQuery.data?.pullRequest ?? null;
  const prBadge = pr
    ? { kind: prStatusKindFromSummary({ state: pr.state, draft: pr.draft }), number: pr.number }
    : null;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topInset + spacing[2], paddingBottom: insets.bottom + 48 },
        ]}
      >
        <View style={styles.modeRow}>
          {MOBILE_DIFF_MODE_OPTIONS.map((option) => {
            const active = option.id === mode;
            return (
              <Pressable
                key={option.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setMode(option.id)}
                style={[styles.modePill, active && styles.modePillActive]}
              >
                <Text style={[styles.modePillText, active && styles.modePillTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
          <View style={styles.totalsRow}>
            {totals.additions > 0 ? (
              <Text style={[styles.totalsText, { color: colors.success }]}>+{totals.additions}</Text>
            ) : null}
            {totals.deletions > 0 ? (
              <Text style={[styles.totalsText, { color: colors.destructive }]}>-{totals.deletions}</Text>
            ) : null}
          </View>
        </View>

        {branch ? (
          <View style={styles.prRow}>
            <MobileIcon name="git-branch" size={14} color={colors.mutedForeground} />
            <Text style={styles.prBranchText} numberOfLines={1}>
              {baseRef && baseRef !== branch ? `${branch} → ${baseRef}` : branch}
            </Text>
            {prBadge ? <MobilePrStatusBadge kind={prBadge.kind} number={prBadge.number} /> : null}
          </View>
        ) : null}

        {isListLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.fg} />
          </View>
        ) : isListError ? (
          <Pressable style={styles.centered} onPress={() => void refetchList()}>
            <Text style={styles.centeredTitle}>Couldn't load changes</Text>
            <Text style={styles.centeredText}>Tap to retry.</Text>
          </Pressable>
        ) : files.length === 0 ? (
          <View style={styles.centered}>
            <Text style={styles.centeredTitle}>{mobileDiffModeEmptyMessage(mode)}</Text>
          </View>
        ) : (
          <View style={styles.fileListCard}>
            {files.map((file, index) => (
              <Fragment key={file.key}>
                {index > 0 ? <View style={styles.separator} /> : null}
                <FileRow
                  file={file}
                  selected={file.path === selectedFile?.path}
                  onPress={() => setSelectedPath(file.path)}
                />
              </Fragment>
            ))}
          </View>
        )}

        {selectedFile ? (
          diffQuery.isLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.fg} />
            </View>
          ) : diffQuery.isError ? (
            <Pressable style={styles.centered} onPress={() => void diffQuery.refetch()}>
              <Text style={styles.centeredTitle}>Couldn't load the diff</Text>
              <Text style={styles.centeredText}>Tap to retry.</Text>
            </Pressable>
          ) : diffQuery.data?.binary ? (
            <View style={styles.centered}>
              <Text style={styles.centeredTitle}>Binary file changed</Text>
            </View>
          ) : (
            <>
              <MobileDiffViewer fileName={selectedFile.displayPath} parsedDiff={parsedDiff} />
              {diffQuery.data?.truncated ? (
                <Text style={styles.truncatedNote}>Diff truncated because it is too large</Text>
              ) : null}
            </>
          )
        ) : null}
      </ScrollView>
    </View>
  );
}

function FileRow({
  file,
  selected,
  onPress,
}: {
  file: MobileChangedFile;
  selected: boolean;
  onPress: () => void;
}) {
  const presentation = gitFileStatusPresentation(file.status);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={gitFileStatusAccessibilityLabel(file.displayPath, file.status)}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.fileRow,
        selected && styles.fileRowSelected,
        pressed && styles.fileRowPressed,
      ]}
    >
      <MobileIcon name={presentation.icon} size={14} color={TONE_COLOR[presentation.tone]} />
      <Text style={styles.filePath} numberOfLines={1}>
        {file.displayPath}
      </Text>
      <View style={styles.fileStats}>
        {file.additions > 0 ? (
          <Text style={[styles.fileStatsText, { color: colors.success }]}>+{file.additions}</Text>
        ) : null}
        {file.deletions > 0 ? (
          <Text style={[styles.fileStatsText, { color: colors.destructive }]}>-{file.deletions}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const TONE_COLOR = {
  positive: colors.success,
  caution: colors.warning,
  danger: colors.destructive,
  neutral: colors.info,
} as const;

const MONO_FONT = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" });

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing[4],
  },
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  modePill: {
    height: 28,
    borderRadius: radius.full,
    paddingHorizontal: spacing[3],
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  modePillActive: {
    backgroundColor: colors.foreground,
  },
  modePillText: {
    fontSize: 12.5,
    fontWeight: "600",
    color: colors.mutedForeground,
  },
  modePillTextActive: {
    color: colors.background,
  },
  totalsRow: {
    marginLeft: "auto",
    flexDirection: "row",
    gap: 6,
  },
  totalsText: {
    fontFamily: MONO_FONT,
    fontSize: 12,
    fontWeight: "600",
  },
  prRow: {
    marginTop: spacing[3],
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingVertical: 10,
    paddingHorizontal: spacing[3],
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    borderRadius: radius.xl,
  },
  prBranchText: {
    flex: 1,
    minWidth: 0,
    color: colors.mutedForeground,
    fontFamily: MONO_FONT,
    fontSize: 11.5,
  },
  fileListCard: {
    marginTop: spacing[3],
    backgroundColor: colors.surfaceControl,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    paddingHorizontal: spacing[3],
    paddingVertical: 11,
    minHeight: 44,
  },
  fileRowSelected: {
    backgroundColor: colors.accent,
  },
  fileRowPressed: {
    opacity: 0.7,
  },
  filePath: {
    flex: 1,
    minWidth: 0,
    color: colors.fg,
    fontFamily: MONO_FONT,
    fontSize: 12,
  },
  fileStats: {
    flexDirection: "row",
    gap: 6,
  },
  fileStatsText: {
    fontFamily: MONO_FONT,
    fontSize: 11,
  },
  truncatedNote: {
    marginTop: spacing[1],
    textAlign: "center",
    color: colors.faint,
    fontSize: 12,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    paddingVertical: spacing[8],
  },
  centeredTitle: {
    color: colors.fg,
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
  },
  centeredText: {
    color: colors.faint,
    fontSize: 13,
    textAlign: "center",
  },
});
