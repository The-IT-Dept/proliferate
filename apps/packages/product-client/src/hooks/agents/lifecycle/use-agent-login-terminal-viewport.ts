import type { AgentLoginTerminalRecord, TerminalWebSocketAuthTransport } from "@anyharness/sdk";
import { connectAgentLoginTerminal, type TerminalStreamHandle } from "@anyharness/sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { useXtermSurface } from "#product/hooks/terminals/lifecycle/use-xterm-surface";

interface UseAgentLoginTerminalViewportInput {
  terminal: AgentLoginTerminalRecord | null;
  baseUrl: string;
  authToken?: string;
  // Cloud sandbox connections authenticate the WS handshake via the
  // Sec-WebSocket-Protocol header instead of a query-string token (the
  // gateway's contract — see cloud-sandbox-gateway.ts). Undefined for local.
  webSocketAuthTransport?: TerminalWebSocketAuthTransport;
  // Cloud only: when provided, called immediately before every (re)connect
  // to mint a live gateway token instead of using the (possibly stale)
  // `authToken` above. A device-code login can sit open for minutes and the
  // gateway token is short-lived, so any (re)connect that trusted a token
  // resolved at an earlier render risked a WS 1008 close mid-login.
  // Undefined for local — that path has no token-TTL concern (query-param
  // auth against the desktop's own runtime) and connects synchronously with
  // the static `authToken`, matching pre-existing behavior exactly.
  getAuthToken?: () => Promise<string | undefined>;
  visible: boolean;
  focusRequestToken: number;
  onExit: (code: number | null) => void;
}

export function useAgentLoginTerminalViewport({
  terminal,
  baseUrl,
  authToken,
  webSocketAuthTransport,
  getAuthToken,
  visible,
  focusRequestToken,
  onExit,
}: UseAgentLoginTerminalViewportInput) {
  const streamHandleRef = useRef<TerminalStreamHandle | null>(null);
  const lastSeqRef = useRef(0);
  const lastTerminalIdRef = useRef<string | null>(null);
  const onExitRef = useRef(onExit);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  const handleTerminalData = useCallback((data: string) => {
    streamHandleRef.current?.send(data);
  }, []);

  const handleTerminalResize = useCallback(({ cols, rows }: { cols: number; rows: number }) => {
    streamHandleRef.current?.sendResize(cols, rows);
  }, []);

  const { containerRef, isReady, terminalRef, write } = useXtermSurface({
    visible,
    focusRequestToken,
    onData: handleTerminalData,
    onResize: handleTerminalResize,
    logPrefix: "AgentLoginTerminal",
    scrollback: 2000,
    fontSize: 9,
    lineHeight: 1,
  });

  useEffect(() => {
    const terminalId = terminal?.id ?? null;
    const terminalStatus = terminal?.status ?? null;
    if (
      !visible
      || !isReady
      || !terminalId
      || terminalStatus === "exited"
      || terminalStatus === "failed"
      || baseUrl.trim().length === 0
    ) {
      return;
    }

    setConnectionError(null);
    if (lastTerminalIdRef.current !== terminalId) {
      lastSeqRef.current = 0;
      lastTerminalIdRef.current = terminalId;
    }

    // `cancelled`/`localHandle` guard the async gap below: getAuthToken (when
    // provided) is awaited before the WS opens, so cleanup can run before a
    // handle even exists (nothing to close then) or after (close it, and
    // only clear the shared ref if it's still ours). Local has no `await` on
    // its path (no `getAuthToken`), so this resolves synchronously in the
    // same tick exactly like before — local behavior/timing is unchanged.
    let cancelled = false;
    let localHandle: TerminalStreamHandle | null = null;

    void (async () => {
      let token = authToken;
      if (getAuthToken) {
        try {
          token = await getAuthToken();
        } catch {
          if (!cancelled) {
            setConnectionError("Couldn't refresh the connection token.");
          }
          return;
        }
      }
      if (cancelled) {
        return;
      }

      const handle = connectAgentLoginTerminal({
        baseUrl,
        authToken: token,
        webSocketAuthTransport,
        terminalId,
        afterSeq: lastSeqRef.current > 0 ? lastSeqRef.current : undefined,
        onData: (data, frame) => {
          lastSeqRef.current = frame.seq;
          write(data);
        },
        onReplayGap: () => {
          write("\r\n[terminal output gap: earlier output was discarded]\r\n");
        },
        onExit: (code) => {
          write("\r\n");
          onExitRef.current(code);
        },
        onError: () => {
          setConnectionError("Terminal connection interrupted.");
        },
      });
      localHandle = handle;
      streamHandleRef.current = handle;
      if (terminalRef.current) {
        handle.sendResize(terminalRef.current.cols, terminalRef.current.rows);
      }
    })();

    return () => {
      cancelled = true;
      if (localHandle) {
        if (streamHandleRef.current === localHandle) {
          streamHandleRef.current = null;
        }
        localHandle.close();
      }
    };
  }, [authToken, baseUrl, getAuthToken, isReady, terminal, terminalRef, visible, webSocketAuthTransport, write]);

  return {
    connectionError,
    containerRef,
  };
}
