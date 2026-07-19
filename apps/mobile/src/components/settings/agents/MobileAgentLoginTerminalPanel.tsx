import { useCallback, useEffect, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useMobileToast } from "../../../providers/MobileToastProvider";
import { useAgentLoginTerminalStream } from "../../../hooks/agent-auth/derived/use-agent-login-terminal-stream";
import { deriveLoginTerminalStatusText } from "../../../lib/domain/agent-auth/agent-login-terminal";
import type { AgentLoginTerminalSessionState } from "../../../lib/domain/agent-auth/agent-login-terminal";
import { MobileTerminalView, type MobileTerminalViewHandle } from "../../workspace/terminal/MobileTerminalView";
import { colors, radius, spacing } from "../../../styles/tokens";

interface MobileAgentLoginTerminalPanelProps {
  session: AgentLoginTerminalSessionState;
  onExit: (kind: string, code: number | null) => void;
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
}: MobileAgentLoginTerminalPanelProps) {
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

  useEffect(() => {
    if (stream.exited) {
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

  const statusText = deriveLoginTerminalStatusText(session);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.headerLabel}>Auth terminal</Text>
        <Text style={styles.headerStatus}>{statusText}</Text>
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
        <View style={styles.terminalBody}>
          <MobileTerminalView
            ref={viewRef}
            onInput={handleInput}
            onResize={handleResize}
            onBridgeError={handleBridgeError}
          />
        </View>
      ) : session.errorMessage ? null : (
        <View style={styles.body}>
          <Text style={styles.bodyMuted}>Terminal unavailable</Text>
        </View>
      )}
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
  headerLabel: {
    color: colors.fg,
    fontSize: 12.5,
    fontWeight: "600",
  },
  headerStatus: {
    color: colors.faint,
    fontSize: 12,
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
