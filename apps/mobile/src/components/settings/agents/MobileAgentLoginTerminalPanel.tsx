import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useMobileToast } from "../../../providers/MobileToastProvider";
import { useAgentLoginTerminalStream } from "../../../hooks/agent-auth/derived/use-agent-login-terminal-stream";
import { deriveLoginTerminalStatusText } from "../../../lib/domain/agent-auth/agent-login-terminal";
import type { AgentLoginTerminalSessionState } from "../../../lib/domain/agent-auth/agent-login-terminal";
import { MobileTerminalView, type MobileTerminalViewHandle } from "../../workspace/terminal/MobileTerminalView";
import { colors, radius, spacing } from "../../../styles/tokens";

interface MobileAgentLoginTerminalPanelProps {
  session: AgentLoginTerminalSessionState;
  onExit: (kind: string, code: number | null) => void;
  /** Re-runs `startLoginTerminal` for this kind (web: "Restart auth"/"Retry
   * auth" — `AgentLoginTerminalPanel.tsx`). */
  onRestart: () => void;
  /** Tears the session down and closes the terminal record (web: "Close"). */
  onClose: () => void;
}

/**
 * Group H — the device-code login terminal viewport: this IS the fix for
 * "Claude not logged in". Reuses Group F's `MobileTerminalView` (xterm in a
 * WebView) verbatim, wired to `useAgentLoginTerminalStream`
 * (`connectAgentLoginTerminal`, not `connectTerminal`) instead of
 * `useTerminalStream` — same write/exit/gap wiring pattern as
 * `MobileWorkspaceTerminalSegment`'s `MobileTerminalActive`. Mirrors web's
 * `AgentLoginTerminalPanel.tsx` (status header + message/error banners +
 * terminal body), with the pure `deriveLoginTerminalStatusText` doing the
 * status-text derivation both share the same vocabulary for.
 */
export function MobileAgentLoginTerminalPanel({
  session,
  onExit,
  onRestart,
  onClose,
}: MobileAgentLoginTerminalPanelProps) {
  const terminalId = session.terminal?.id ?? null;
  // Bumped when the terminal viewport's WebView renderer dies mid-login (see
  // `MobileAgentLoginTerminalStream`'s `onRendererGone` below) and folded
  // into that component's `key` — forcing a full remount, which is what
  // gets a *fresh* stream controller with no `afterSeq`
  // (`use-agent-login-terminal-stream.ts`'s controller only resets itself
  // on a terminalId CHANGE, not a same-terminal reconnect, so a renderer
  // death needs a full component remount to force one). Same
  // mechanism/rationale as `MobileWorkspaceTerminalSegment`'s
  // `rendererEpoch`. Without this, the reloaded (blank) WebView never gets
  // the earlier scrollback replayed back in, and the one-time device
  // code/URL is lost.
  const [rendererEpoch, setRendererEpoch] = useState(0);

  const statusText = deriveLoginTerminalStatusText(session);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.headerLabel}>Auth terminal</Text>
          <Text style={styles.headerStatus}>{statusText}</Text>
        </View>
        {/* Gated on isStarting like the Authenticate button
            (MobileAgentAuthDetailScreen's own `disabled={session?.isStarting}`)
            — during the opening window `session.terminal` is still null, so
            an un-gated tap here would skip the "close the old terminal"
            branch in openAuthTerminal and fire a SECOND
            startLoginTerminal, opening two PTYs for one session. */}
        <Pressable
          accessibilityRole="button"
          disabled={session.isStarting}
          onPress={onRestart}
          hitSlop={8}
        >
          <Text style={[styles.headerAction, session.isStarting && styles.headerActionDisabled]}>
            {session.terminal ? "Restart" : "Retry"}
          </Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onClose} hitSlop={8}>
          <Text style={styles.headerAction}>Close</Text>
        </Pressable>
      </View>

      {session.terminal ? (
        <Text style={styles.commandLine} numberOfLines={1}>
          {session.terminal.commandDisplay}
        </Text>
      ) : null}

      {session.message ? <Text style={styles.message}>{session.message}</Text> : null}
      {session.errorMessage ? <Text style={styles.error}>{session.errorMessage}</Text> : null}

      {session.isStarting && !session.terminal ? (
        <View style={styles.body}>
          <Text style={styles.bodyMuted}>Opening auth terminal...</Text>
        </View>
      ) : session.terminal ? (
        <MobileAgentLoginTerminalStream
          key={`${terminalId}:${rendererEpoch}`}
          session={session}
          onExit={onExit}
          onRendererGone={() => setRendererEpoch((epoch) => epoch + 1)}
        />
      ) : session.errorMessage ? null : (
        <View style={styles.body}>
          <Text style={styles.bodyMuted}>Terminal unavailable</Text>
        </View>
      )}
    </View>
  );
}

/**
 * Owns the live PTY data bridge (`useAgentLoginTerminalStream`) and the
 * `MobileTerminalView` WebView for one login-terminal id. Split out of
 * `MobileAgentLoginTerminalPanel` so the parent can force a full remount of
 * just this piece (via its `key`, folding in `rendererEpoch`) without
 * disturbing the header/message/error chrome around it — the same split as
 * `MobileWorkspaceTerminalSegment`/`MobileTerminalActive`.
 */
function MobileAgentLoginTerminalStream({
  session,
  onExit,
  onRendererGone,
}: {
  session: AgentLoginTerminalSessionState;
  onExit: (kind: string, code: number | null) => void;
  /** The WebView's renderer process died and `MobileTerminalView` has
   * already reloaded itself (see that prop's doc comment) — the parent
   * needs to force a full remount so a fresh stream controller re-attaches
   * with no `afterSeq`, replaying scrollback (including the one-time
   * device code/URL a login terminal prints once) into the
   * freshly-reloaded (blank) buffer. Mirrors
   * `MobileWorkspaceTerminalSegment`'s `onRendererGone` contract. */
  onRendererGone: () => void;
}) {
  const toast = useMobileToast();
  const viewRef = useRef<MobileTerminalViewHandle>(null);
  const terminalId = session.terminal?.id ?? null;
  const terminalIsLive = session.terminal?.status === "starting" || session.terminal?.status === "running";

  const handleData = useCallback((bytes: Uint8Array) => {
    viewRef.current?.write(bytes);
  }, []);

  const stream = useAgentLoginTerminalStream({
    terminalId: terminalIsLive ? terminalId : null,
    onData: handleData,
  });

  // Guards the exit effect below against firing its "process exited" notice
  // (and the onExit refetch) more than once for this terminal. `onExit` is
  // an inline, unstable prop (recreated by the parent screen's own
  // re-render — see MobileAgentAuthDetailScreen's
  // `onExit={(exitedKind, code) => ...}`), so it's an effect dependency
  // that changes on renders unrelated to the terminal's exit; without this
  // guard, any such re-render while `stream.exited` stays true re-runs the
  // effect and double-fires. A plain component-lifetime ref is enough here
  // (not module state) — this component fully remounts per terminal session
  // (keyed by terminalId + rendererEpoch in the parent), so the ref starts
  // fresh exactly when a NEW terminal's exit should be able to fire again.
  const hasFiredExitRef = useRef(false);

  useEffect(() => {
    if (stream.exited && !hasFiredExitRef.current) {
      hasFiredExitRef.current = true;
      viewRef.current?.writeExitNotice(stream.exitCode);
      onExit(session.kind, stream.exitCode);
    }
  }, [stream.exited, stream.exitCode, onExit, session.kind]);

  useEffect(() => {
    if (stream.gapCount > 0) {
      viewRef.current?.writeGapNotice();
    }
  }, [stream.gapCount]);

  const handleInput = useCallback(
    (data: string) => {
      stream.sendInput(data);
    },
    [stream.sendInput],
  );

  const handleResize = useCallback(
    (cols: number, rows: number) => {
      stream.sendResize(cols, rows);
    },
    [stream.sendResize],
  );

  const handleBridgeError = useCallback(
    (message: string) => {
      toast.show({ tone: "error", message: `Auth terminal error: ${message}` });
    },
    [toast],
  );

  // The renderer process died — `MobileTerminalView` has already reloaded
  // its own WebView by the time this fires. Toast it (this failure mode is
  // different/more alarming than an ordinary stream disconnect, which the
  // status line already covers) and ask the parent to force a fresh stream
  // re-attach so the reloaded, now-blank buffer gets its scrollback —
  // including the device code — replayed back in. Mirrors
  // `MobileTerminalActive`'s `handleRendererGone`.
  const handleRendererGone = useCallback(() => {
    toast.show({ tone: "error", message: "Terminal disconnected — reloading." });
    onRendererGone();
  }, [onRendererGone, toast]);

  return (
    <View style={styles.terminalBody}>
      <MobileTerminalView
        ref={viewRef}
        onInput={handleInput}
        onResize={handleResize}
        onBridgeError={handleBridgeError}
        onRendererGone={handleRendererGone}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: spacing[3],
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.card,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
    minHeight: 40,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  headerLabel: {
    color: colors.fg,
    fontSize: 12.5,
    fontWeight: "600",
  },
  headerStatus: {
    color: colors.faint,
    fontSize: 12,
  },
  headerAction: {
    color: colors.info,
    fontSize: 12,
    fontWeight: "600",
  },
  headerActionDisabled: {
    opacity: 0.5,
  },
  commandLine: {
    paddingHorizontal: spacing[3],
    paddingTop: spacing[1],
    color: colors.faint,
    fontSize: 11,
    fontFamily: "Menlo",
  },
  message: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    color: colors.mutedForeground,
    fontSize: 12.5,
    lineHeight: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  error: {
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    color: colors.destructive,
    fontSize: 12.5,
    lineHeight: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  body: {
    minHeight: 220,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing[3],
  },
  bodyMuted: {
    color: colors.faint,
    fontSize: 12.5,
  },
  terminalBody: {
    height: 320,
  },
});
