import { useCallback, useEffect, useRef } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useCreateTerminalMutation, useTerminalsQuery } from "@anyharness/sdk-react";
import type { TerminalRecord } from "@anyharness/sdk";

import { MobileIcon } from "../primitives/MobileIcon";
import { useMobileToast } from "../../providers/MobileToastProvider";
import { useTerminalStream } from "../../hooks/terminal/derived/use-terminal-stream";
import {
  MobileTerminalView,
  type MobileTerminalViewHandle,
} from "./terminal/MobileTerminalView";
import { colors, radius, spacing } from "../../styles/tokens";

interface MobileWorkspaceTerminalSegmentProps {
  /** Space to clear the floating header + capsule + segmented control
   * above, same contract as the other segment bodies. */
  topInset: number;
}

/**
 * Group F spike — the *minimal* end-to-end Term segment (replaces
 * `MobileWorkspaceSegmentPlaceholder` for `segment === "term"` in
 * `MobileWorkspaceShell`): list the workspace's terminals, offer "New
 * terminal" when there are none, and attach to one with a live
 * `connectTerminal` stream + `MobileTerminalView`. Both `useTerminalsQuery`
 * and `useCreateTerminalMutation` (`@anyharness/sdk-react`) resolve against
 * the active workspace from `AnyHarnessWorkspace` context on their own — no
 * workspace id needs threading through here, same as
 * `useSessionTranscriptStream` on the Chat side.
 *
 * Deliberately NOT the full Group F build: one terminal, no roster/switching
 * between multiple terminals, no close/rename affordance, no richer status
 * vocabulary than starting/running vs exited/failed. See this spike's report
 * for what the follow-up F-build still needs to add.
 */
export function MobileWorkspaceTerminalSegment({
  topInset,
}: MobileWorkspaceTerminalSegmentProps) {
  const toast = useMobileToast();
  const terminalsQuery = useTerminalsQuery();
  const createTerminal = useCreateTerminalMutation();

  const terminals = terminalsQuery.data ?? [];
  // Prefer a still-live terminal over an exited/failed one if the workspace
  // happens to have more than one already (e.g. created by another client) —
  // real roster/selection is F-build scope.
  const activeTerminal = terminals.find(
    (terminal) => terminal.status === "starting" || terminal.status === "running",
  ) ?? terminals[0] ?? null;

  function handleCreate() {
    // cols/rows are required at create time but there's no attached
    // MobileTerminalView yet to measure — seed the classic 80x24 default;
    // MobileTerminalAttach's first onResize (from the WebView's own
    // FitAddon, immediately on attach) corrects it via sendResize().
    void createTerminal.mutateAsync({ purpose: "general", cols: 80, rows: 24 }).catch(
      (error: unknown) => {
        const detail = error instanceof Error && error.message ? `: ${error.message}` : ".";
        toast.show({ tone: "error", message: `Couldn't create a terminal${detail}` });
      },
    );
  }

  if (terminalsQuery.isLoading) {
    return (
      <View style={[styles.centered, { paddingTop: topInset }]}>
        <ActivityIndicator color={colors.fg} />
      </View>
    );
  }

  if (terminalsQuery.isError) {
    return (
      <Pressable
        style={[styles.centered, { paddingTop: topInset }]}
        onPress={() => void terminalsQuery.refetch()}
      >
        <Text style={styles.centeredTitle}>Couldn't load terminals</Text>
        <Text style={styles.centeredText}>Tap to retry.</Text>
      </Pressable>
    );
  }

  if (!activeTerminal) {
    return (
      <View style={[styles.centered, { paddingTop: topInset }]}>
        <View style={styles.iconTile}>
          <MobileIcon name="terminal" size={22} color={colors.faint} />
        </View>
        <Text style={styles.centeredTitle}>No terminal yet</Text>
        <Text style={styles.centeredText}>
          Start one to get a live shell in this workspace.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New terminal"
          disabled={createTerminal.isPending}
          onPress={handleCreate}
          style={({ pressed }) => [
            styles.newButton,
            createTerminal.isPending && styles.newButtonDisabled,
            pressed && styles.newButtonPressed,
          ]}
        >
          {createTerminal.isPending ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <>
              <MobileIcon name="plus" size={16} color={colors.background} />
              <Text style={styles.newButtonLabel}>New terminal</Text>
            </>
          )}
        </Pressable>
      </View>
    );
  }

  return <MobileTerminalAttach terminal={activeTerminal} topInset={topInset} />;
}

function MobileTerminalAttach({
  terminal,
  topInset,
}: {
  terminal: TerminalRecord;
  topInset: number;
}) {
  const viewRef = useRef<MobileTerminalViewHandle>(null);

  const handleData = useCallback((bytes: Uint8Array) => {
    viewRef.current?.write(bytes);
  }, []);

  const stream = useTerminalStream({ terminalId: terminal.id, onData: handleData });

  useEffect(() => {
    if (stream.exited) {
      viewRef.current?.writeExitNotice(stream.exitCode);
    }
  }, [stream.exited, stream.exitCode]);

  useEffect(() => {
    if (stream.gapCount > 0) {
      viewRef.current?.writeGapNotice();
    }
  }, [stream.gapCount]);

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <MobileTerminalView ref={viewRef} onInput={stream.sendInput} onResize={stream.sendResize} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing[2],
    paddingHorizontal: spacing[6],
  },
  iconTile: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceControl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing[1],
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
    maxWidth: 280,
  },
  newButton: {
    marginTop: spacing[3],
    height: 46,
    minWidth: 160,
    borderRadius: radius.full,
    backgroundColor: colors.foreground,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: spacing[5],
  },
  newButtonDisabled: {
    opacity: 0.5,
  },
  newButtonPressed: {
    opacity: 0.85,
  },
  newButtonLabel: {
    color: colors.background,
    fontSize: 15,
    fontWeight: "600",
  },
});
