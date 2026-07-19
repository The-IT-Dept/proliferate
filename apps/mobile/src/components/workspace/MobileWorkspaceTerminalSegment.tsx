import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import {
  resolveWorkspaceConnectionFromContext,
  useAnyHarnessWorkspaceContext,
  useCloseTerminalMutation,
  useCreateTerminalMutation,
  useTerminalsQuery,
  useUpdateTerminalTitleMutation,
} from "@anyharness/sdk-react";
import type { TerminalRecord } from "@anyharness/sdk";
import { GlassSurface } from "@proliferate/design/glass";

import { MobileIcon } from "../primitives/MobileIcon";
import { useMobileToast } from "../../providers/MobileToastProvider";
import { useTerminalStream } from "../../hooks/terminal/derived/use-terminal-stream";
import {
  MobileTerminalView,
  type MobileTerminalViewHandle,
} from "./terminal/MobileTerminalView";
import { MobileTerminalAccessoryBar } from "./terminal/MobileTerminalAccessoryBar";
import { MobileTerminalRosterSheet } from "./terminal/MobileTerminalRosterSheet";
import {
  applyTerminalAccessoryModifier,
  bytesForAccessoryKey,
  controlByteForChar,
  type TerminalAccessoryKeyId,
  type TerminalAccessoryModifier,
} from "../../lib/domain/terminal/terminal-accessory-keys";
import {
  selectActiveTerminal,
  sortTerminalsForRoster,
  terminalDisplayTitle,
} from "../../lib/domain/terminal/terminal-roster";
import {
  terminalConnectionStatusLabel,
  terminalExitedLabel,
  terminalStatusLine,
} from "../../lib/domain/terminal/terminal-status";
import { colors, radius, spacing } from "../../styles/tokens";

interface MobileWorkspaceTerminalSegmentProps {
  /** Space to clear the floating header + capsule + segmented control
   * above, same contract as the other segment bodies. */
  topInset: number;
}

/**
 * Group F-build — the full interactive-terminal surface (IA `Term (G)`,
 * `mockups.html` frame G; extends the Group F spike's minimal one-terminal
 * attach). Owns: the terminal roster (list/switch/create/close/rename via a
 * sheet), the single attached `TerminalStreamController` +
 * `MobileTerminalView`, and the keyboard accessory bar + Interrupt control.
 *
 * Only ever mounts ONE `MobileTerminalView`/WebView, matching the spike's
 * constraint (never N background PTYs) — `selectActiveTerminal` (pure logic,
 * `lib/domain/terminal/terminal-roster.ts`) resolves which `TerminalRecord`
 * that is on every render directly from the live `useTerminalsQuery` data +
 * `activeTerminalId` state (an explicit user selection, set by roster
 * `onSelect`/on create), so a roster refetch after create/close/rename can
 * never silently steal focus away from what the user is looking at, and
 * "switching" is simply React re-keying `MobileTerminalActive` by the new
 * terminal's id (see that component) — a fresh `TerminalStreamController`
 * connects with no `afterSeq`, so the server replays that terminal's
 * scrollback from the start into a freshly-initialized xterm buffer. That's
 * the "reconnect with replay" branch of this group's spec, not
 * "keep every terminal's stream warm in the background" — deliberately, to
 * honor the single-WebView constraint above.
 */
export function MobileWorkspaceTerminalSegment({
  topInset,
}: MobileWorkspaceTerminalSegmentProps) {
  const toast = useMobileToast();
  const terminalsQuery = useTerminalsQuery();
  const createTerminal = useCreateTerminalMutation();
  const closeTerminal = useCloseTerminalMutation();
  const renameTerminal = useUpdateTerminalTitleMutation();

  // `useCloseTerminalMutation`/`useUpdateTerminalTitleMutation`
  // (`@anyharness/sdk-react`) take an explicit `connection` — unlike
  // `useTerminalsQuery`/`useCreateTerminalMutation`, which resolve the
  // active workspace from `AnyHarnessWorkspace` context internally. Same
  // `resolveWorkspaceConnectionFromContext` + stable-ref-across-renders
  // pattern `use-terminal-stream.ts` already uses for the same reason
  // (`AnyHarnessWorkspace`'s context value is a fresh object every render).
  const workspace = useAnyHarnessWorkspaceContext();
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const resolveConnection = useCallback(async () => {
    const resolved = await resolveWorkspaceConnectionFromContext(workspaceRef.current);
    return { runtimeUrl: resolved.connection.runtimeUrl, authToken: resolved.connection.authToken };
  }, []);

  const terminals = terminalsQuery.data ?? [];
  const sortedTerminals = useMemo(() => sortTerminalsForRoster(terminals), [terminals]);

  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [rosterVisible, setRosterVisible] = useState(false);
  const [closingTerminalId, setClosingTerminalId] = useState<string | null>(null);
  const [renamingTerminalId, setRenamingTerminalId] = useState<string | null>(null);
  // Bumped on a WebView renderer death (see `MobileTerminalView`'s
  // `onRendererGone`) and folded into `MobileTerminalActive`'s `key` below
  // — forcing a full remount is what gets a *fresh* `TerminalStreamController`
  // (see that class's module doc: "a fresh TerminalStreamController connects
  // with no afterSeq, so the server replays that terminal's scrollback from
  // the start"), the same mechanism already used when switching terminals.
  // Without this, the terminal's live connection would just keep resuming
  // from its last-seen seq into the newly-reloaded (blank) WebView buffer,
  // never replaying the scrollback the reload just wiped out.
  const [rendererEpoch, setRendererEpoch] = useState(0);

  // Recomputed from live data every render (not reconciled via effect): if
  // the explicit selection is gone (closed elsewhere) this naturally falls
  // back to the best live candidate; if it's still present it's kept
  // untouched by an unrelated roster refetch.
  const activeTerminal = selectActiveTerminal(terminals, activeTerminalId);
  const activeIndex = activeTerminal
    ? sortedTerminals.findIndex((terminal) => terminal.id === activeTerminal.id)
    : -1;

  function handleCreate() {
    // cols/rows are required at create time but there's no attached
    // MobileTerminalView yet to measure — seed the classic 80x24 default;
    // MobileTerminalActive's onReady/onResize (from the WebView's own
    // FitAddon) corrects it via sendResize() as soon as it attaches.
    void createTerminal.mutateAsync({ purpose: "general", cols: 80, rows: 24 })
      .then((created) => {
        setActiveTerminalId(created.id);
        toast.show({ tone: "success", message: "Terminal created" });
      })
      .catch((error: unknown) => {
        const detail = error instanceof Error && error.message ? `: ${error.message}` : ".";
        toast.show({ tone: "error", message: `Couldn't create a terminal${detail}` });
      });
  }

  async function handleClose(terminalId: string, title: string) {
    setClosingTerminalId(terminalId);
    try {
      const connection = await resolveConnection();
      await closeTerminal.mutateAsync({ connection, terminalId });
      toast.show({ tone: "success", message: `Closed "${title}"` });
    } catch (error) {
      const detail = error instanceof Error && error.message ? `: ${error.message}` : ".";
      toast.show({ tone: "error", message: `Couldn't close the terminal${detail}` });
    } finally {
      setClosingTerminalId(null);
    }
  }

  async function handleRename(terminalId: string, title: string) {
    setRenamingTerminalId(terminalId);
    try {
      const connection = await resolveConnection();
      await renameTerminal.mutateAsync({ connection, terminalId, request: { title } });
      toast.show({ tone: "success", message: "Terminal renamed" });
    } catch (error) {
      const detail = error instanceof Error && error.message ? `: ${error.message}` : ".";
      toast.show({ tone: "error", message: `Couldn't rename the terminal${detail}` });
    } finally {
      setRenamingTerminalId(null);
    }
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

  return (
    <>
      {!activeTerminal ? (
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
      ) : (
        <MobileTerminalActive
          key={`${activeTerminal.id}:${rendererEpoch}`}
          terminal={activeTerminal}
          index={activeIndex}
          topInset={topInset}
          onOpenRoster={() => setRosterVisible(true)}
          onRendererGone={() => setRendererEpoch((epoch) => epoch + 1)}
        />
      )}

      <MobileTerminalRosterSheet
        visible={rosterVisible}
        terminals={sortedTerminals}
        activeTerminalId={activeTerminal?.id ?? null}
        creating={createTerminal.isPending}
        closingTerminalId={closingTerminalId}
        renamingTerminalId={renamingTerminalId}
        onSelect={(terminalId) => setActiveTerminalId(terminalId)}
        onCreate={handleCreate}
        onClose={(terminalId, title) => void handleClose(terminalId, title)}
        onRename={(terminalId, title) => void handleRename(terminalId, title)}
        onDismiss={() => setRosterVisible(false)}
      />
    </>
  );
}

function MobileTerminalActive({
  terminal,
  index,
  topInset,
  onOpenRoster,
  onRendererGone,
}: {
  terminal: TerminalRecord;
  index: number;
  topInset: number;
  onOpenRoster: () => void;
  /** The WebView's renderer process died and `MobileTerminalView` has
   * already reloaded itself — the caller (here) needs to force a full
   * remount so a fresh `TerminalStreamController` re-attaches with no
   * `afterSeq`, replaying scrollback into the freshly-reloaded (blank)
   * buffer. Implemented by the parent bumping a key epoch, same mechanism
   * as switching terminals — see that key's comment. */
  onRendererGone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const toast = useMobileToast();
  const viewRef = useRef<MobileTerminalViewHandle>(null);
  const [size, setSize] = useState<{ cols: number; rows: number } | null>(null);
  // The armed sticky modifier's source of truth is this ref, not the
  // `modifier` state below — React 19's automatic batching means two
  // `onInput` events that both fire before a render commits would both
  // still see the same (stale) `modifier` state value if that were the
  // only place it lived, e.g. an armed Ctrl + two fast keystrokes both
  // reading "ctrl" and producing Ctrl-C *and* Ctrl-D instead of just the
  // first. `modifierRef` is read-and-cleared synchronously inside
  // `handleInput`/the accessory handlers below; `modifier` state exists
  // purely so `MobileTerminalAccessoryBar` can render the armed affordance
  // (a chip) — never consulted for the actual byte transform.
  const modifierRef = useRef<TerminalAccessoryModifier | null>(null);
  const [modifier, setModifier] = useState<TerminalAccessoryModifier | null>(null);

  const handleData = useCallback((bytes: Uint8Array) => {
    viewRef.current?.write(bytes);
  }, []);

  const stream = useTerminalStream({ terminalId: terminal.id, onData: handleData });

  // Print the exit / gap notices inline in the scrollback, same as the
  // spike (`writeExitNotice`/`writeGapNotice` mirror product-client's
  // terminal-registry gap banner and the host page's own exit banner).
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

  const handleReady = useCallback(
    (nextSize: { cols: number; rows: number }) => {
      setSize(nextSize);
      stream.sendResize(nextSize.cols, nextSize.rows);
    },
    [stream.sendResize],
  );

  const handleResize = useCallback(
    (cols: number, rows: number) => {
      setSize({ cols, rows });
      stream.sendResize(cols, rows);
    },
    [stream.sendResize],
  );

  // Clears the armed modifier synchronously (ref first, so a same-tick
  // re-read never sees a stale value) and mirrors the clear to state for
  // the accessory bar's render.
  const clearModifier = useCallback(() => {
    if (modifierRef.current !== null) {
      modifierRef.current = null;
      setModifier(null);
    }
  }, []);

  const handleInput = useCallback(
    (data: string) => {
      // Read-and-clear the ref SYNCHRONOUSLY, in this call, before
      // `sendInput` — two `onInput` events fired back-to-back (both queued
      // in the same batch) still each get their own read of `modifierRef`
      // since the ref mutation isn't deferred like the `setModifier` state
      // update is.
      const armed = modifierRef.current;
      if (armed) {
        modifierRef.current = null;
        setModifier(null);
      }
      stream.sendInput(applyTerminalAccessoryModifier(armed, data));
    },
    [stream.sendInput],
  );

  function handleAccessoryKeyPress(id: TerminalAccessoryKeyId) {
    if (id === "ctrl" || id === "alt") {
      const next = modifierRef.current === id ? null : id;
      modifierRef.current = next;
      setModifier(next);
      return;
    }
    // An immediate (non-sticky) accessory key sends its own bytes verbatim
    // — composing it with an armed Ctrl/Alt isn't a meaningful action, so
    // clear the arm rather than letting it leak onto the NEXT real
    // keystroke.
    clearModifier();
    const bytes = bytesForAccessoryKey(id);
    if (bytes !== null) {
      stream.sendInput(bytes);
    }
  }

  function handleInterrupt() {
    // Same reasoning as the accessory keys above: Interrupt is its own
    // immediate action, not something to compose with an armed modifier.
    clearModifier();
    const byte = controlByteForChar("c");
    if (byte !== null) {
      stream.sendInput(byte);
    }
  }

  // Non-fatal bridge/webview-page errors (a caught guest `window.onerror`,
  // the WebView failing to load, or an HTTP error loading it) — the
  // terminal isn't necessarily dead, so just surface it; nothing to recover
  // here beyond what the user already sees.
  const handleBridgeError = useCallback(
    (message: string) => {
      toast.show({ tone: "error", message: `Terminal error: ${message}` });
    },
    [toast],
  );

  // The renderer process died — `MobileTerminalView` has already reloaded
  // its own WebView by the time this fires (see that prop's doc comment).
  // Toast it (this failure mode is different/more alarming than an
  // ordinary stream disconnect, which the status line already covers) and
  // ask the parent to force a fresh `TerminalStreamController` re-attach so
  // the reloaded, now-blank buffer gets its scrollback replayed back in.
  const handleRendererGone = useCallback(() => {
    toast.show({ tone: "error", message: "Terminal disconnected — reloading." });
    onRendererGone();
  }, [onRendererGone, toast]);

  const displayTitle = terminalDisplayTitle(terminal, Math.max(index, 0));
  const connectionLabel = stream.exited
    ? terminalExitedLabel(stream.exitCode)
    : terminalConnectionStatusLabel(stream.connectionState);
  const statusLine = terminalStatusLine({
    title: displayTitle,
    cols: size?.cols ?? null,
    rows: size?.rows ?? null,
    connectionLabel,
  });
  const inputDisabled = stream.exited || stream.connectionState !== "open";

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      <MobileTerminalView
        ref={viewRef}
        onInput={handleInput}
        onResize={handleResize}
        onReady={handleReady}
        onBridgeError={handleBridgeError}
        onRendererGone={handleRendererGone}
      />

      {/* Status line + roster trigger — thin overlay over the terminal
          field, `box-none` so everything but the button itself stays
          touchable underneath (mockup: "status line ... roster sheet ...
          lives behind the ellipsis"). Deliberately in this segment's own
          body chrome rather than the shell's native header, to keep the
          whole roster affordance self-contained to this group's files. */}
      <View style={styles.overlayToolbar} pointerEvents="box-none">
        <Text style={styles.statusLine} numberOfLines={1}>
          {statusLine}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Terminal roster"
          onPress={onOpenRoster}
          hitSlop={8}
          style={({ pressed }) => [styles.rosterButton, pressed && styles.rosterButtonPressed]}
        >
          <MobileIcon name="more" size={16} color={colors.fg} />
        </Pressable>
      </View>

      {/* Keyboard accessory dock (IA: "clear-glass Interrupt; glass
          key-accessory row"). Rides the keyboard as one unit exactly like
          the chat composer dock (`KeyboardStickyView`,
          `offset.closed: insets.bottom` clears the home indicator when the
          keyboard's down). No bottom padding is reserved on the terminal
          body for this — "full-bleed PTY ... hard-edge scroll under the
          glass chrome" (mockup G caption): the dock is meant to float over
          the last rows, not push them up. */}
      <KeyboardStickyView offset={{ closed: insets.bottom, opened: 0 }}>
        <View style={styles.dock}>
          <View style={styles.interruptRow}>
            <GlassSurface variant="fab" glassStyle="clear" style={styles.interruptSurface}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Interrupt (Ctrl-C)"
                disabled={inputDisabled}
                onPress={handleInterrupt}
                style={({ pressed }) => [styles.interruptButton, pressed && styles.rosterButtonPressed]}
              >
                <MobileIcon name="close" size={13} color={colors.destructive} />
                <Text style={styles.interruptLabel}>Interrupt</Text>
              </Pressable>
            </GlassSurface>
          </View>
          <MobileTerminalAccessoryBar
            armedModifier={modifier}
            onPressKey={handleAccessoryKeyPress}
            disabled={inputDisabled}
          />
        </View>
      </KeyboardStickyView>
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
  overlayToolbar: {
    position: "absolute",
    top: spacing[2],
    right: spacing[2],
    left: spacing[2],
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing[2],
  },
  statusLine: {
    flexShrink: 1,
    color: "rgba(255,255,255,0.4)",
    fontSize: 10.5,
    fontVariant: ["tabular-nums"],
  },
  rosterButton: {
    width: 26,
    height: 26,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  rosterButtonPressed: {
    opacity: 0.6,
  },
  dock: {
    paddingHorizontal: spacing[2],
    paddingBottom: spacing[2],
    gap: spacing[2],
  },
  interruptRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  interruptSurface: {
    borderRadius: radius.full,
  },
  interruptButton: {
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: spacing[3],
  },
  interruptLabel: {
    color: colors.fg,
    fontSize: 12.5,
    fontWeight: "600",
  },
});
