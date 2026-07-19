import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { WebView, type WebViewMessageEvent, type WebViewProps } from "react-native-webview";

import {
  encodeHostToGuestMessage,
  encodeTerminalDataMessage,
  parseGuestToHostMessage,
} from "../../../lib/domain/terminal/terminal-bridge-protocol";
import { TERMINAL_HOST_HTML } from "./terminal-host-html.generated";

/**
 * Group F spike — the renderer half of the terminal bridge: xterm.js hosted
 * in a `react-native-webview` `WebView` (see the module doc on
 * `terminal-host-html.generated.ts` / `scripts/generate-terminal-host-html.mjs`
 * for why: inlined UMD `@xterm/xterm` + `@xterm/addon-fit`, no network
 * fetch). This component owns *rendering* only — it knows nothing about
 * `connectTerminal` or any workspace/session; the caller (the Term segment,
 * via `useTerminalStream`) pushes PTY bytes in through the imperative ref
 * and receives user input / resize / lifecycle events back through props.
 * The wire contract for both directions lives in
 * `lib/domain/terminal/terminal-bridge-protocol.ts` (TDD'd, plain vitest).
 */

// Derived from the officially-exported `WebViewProps` intersection rather
// than reaching into `react-native-webview/lib/WebViewTypes` (not a public
// import path) — `onRenderProcessGone` (Android-only) and
// `onContentProcessDidTerminate` (iOS-only) both live on platform-specific
// slices of that intersection, but are present on the merged type either way.
type WebViewRenderProcessGoneEvent = Parameters<NonNullable<WebViewProps["onRenderProcessGone"]>>[0];
type WebViewContentProcessDidTerminateEvent = Parameters<
  NonNullable<WebViewProps["onContentProcessDidTerminate"]>
>[0];
type WebViewErrorEvent = Parameters<NonNullable<WebViewProps["onError"]>>[0];
type WebViewHttpErrorEvent = Parameters<NonNullable<WebViewProps["onHttpError"]>>[0];

export interface MobileTerminalViewHandle {
  /** Push PTY output bytes into the terminal (already decoded by the SDK's
   * `connectTerminal onData` — this base64-encodes for the postMessage
   * bridge and nothing else). */
  write: (bytes: Uint8Array) => void;
  /** Print the "output was skipped" notice inline (mirrors
   * product-client's `TERMINAL_OUTPUT_GAP_MESSAGE` banner) — call on
   * `TerminalStreamController`'s `onReplayGap`. */
  writeGapNotice: () => void;
  /** Print the "process exited" notice inline — call on `onExit`. */
  writeExitNotice: (code: number | null) => void;
}

export interface MobileTerminalViewProps {
  /** User keystrokes/paste from xterm — forward verbatim to
   * `TerminalStreamController.sendInput` (already UTF-8 safe; the SDK's
   * `send()` TextEncoder-encodes a string). */
  onInput: (data: string) => void;
  /** xterm's fitted size, emitted on open and on every container resize
   * (the host page runs a `ResizeObserver` + `FitAddon.fit()` internally —
   * this component does not need RN-side layout measurement). Forward to
   * `TerminalStreamController.sendResize`. */
  onResize: (cols: number, rows: number) => void;
  /** Fires once the page's xterm instance has opened and fitted for the
   * first time, with that initial size. */
  onReady?: (size: { cols: number; rows: number }) => void;
  /** Non-fatal bridge/webview-page errors (e.g. a caught `window.onerror`
   * inside the host page, or the `WebView` itself failing to load/an HTTP
   * error) — the terminal keeps running (or, for a renderer death, is
   * already being reloaded — see `onRendererGone` below); the caller
   * decides whether/how to surface this (e.g. a toast). */
  onBridgeError?: (message: string) => void;
  /** Fires when the WebView's underlying renderer process died — Android's
   * `onRenderProcessGone` or iOS's `onContentProcessDidTerminate` — which
   * otherwise leaves the terminal a permanently blank/dead surface (and on
   * Android, can crash the app if unhandled). This component immediately
   * reloads its own `WebView` in response (xterm re-inits against a fresh,
   * empty buffer), so by the time this fires the *display* is already
   * being recovered; this component doesn't own the PTY connection though
   * (see the module doc), so the caller still needs to force its
   * `TerminalStreamController` to re-attach with a fresh connect (no
   * `afterSeq`) so the newly-blank buffer gets the scrollback replayed back
   * into it, rather than only resuming from wherever the old connection
   * left off. */
  onRendererGone?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const MobileTerminalView = forwardRef<MobileTerminalViewHandle, MobileTerminalViewProps>(
  function MobileTerminalView(
    { onInput, onResize, onReady, onBridgeError, onRendererGone, style },
    ref,
  ) {
    const webviewRef = useRef<WebView>(null);
    // Bumped to force-remount the `<WebView>` below (a fresh native view +
    // a fresh load of `TERMINAL_HOST_HTML`, re-initializing xterm against a
    // clean buffer) after the renderer process dies — see
    // `onRenderProcessGone`/`onContentProcessDidTerminate` below.
    const [webviewGeneration, setWebviewGeneration] = useState(0);
    // Guest-ready gate for outbound (RN -> WebView) postMessages: `write()`
    // can be called the instant a PTY byte arrives, which on a cold mount —
    // or right after a renderer-death reload — can race ahead of the guest
    // page's own bootstrap (loading xterm, wiring its `message` listeners,
    // *then* posting `ready`). A postMessage sent before those listeners
    // exist is simply lost. `postToGuest` below queues everything until the
    // guest's `ready` message flips this, then flushes in order.
    const readyRef = useRef(false);
    const pendingMessagesRef = useRef<string[]>([]);

    const postToGuest = useCallback((message: string) => {
      if (readyRef.current) {
        webviewRef.current?.postMessage(message);
      } else {
        pendingMessagesRef.current.push(message);
      }
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        write: (bytes: Uint8Array) => {
          postToGuest(encodeTerminalDataMessage(bytes));
        },
        writeGapNotice: () => {
          postToGuest(encodeHostToGuestMessage({ type: "gap" }));
        },
        writeExitNotice: (code: number | null) => {
          postToGuest(encodeHostToGuestMessage({ type: "exit", code }));
        },
      }),
      [postToGuest],
    );

    const handleMessage = useCallback(
      (event: WebViewMessageEvent) => {
        const message = parseGuestToHostMessage(event.nativeEvent.data);
        if (!message) {
          return;
        }
        switch (message.type) {
          case "ready": {
            readyRef.current = true;
            const queued = pendingMessagesRef.current;
            pendingMessagesRef.current = [];
            for (const queuedMessage of queued) {
              webviewRef.current?.postMessage(queuedMessage);
            }
            onReady?.({ cols: message.cols, rows: message.rows });
            return;
          }
          case "input":
            onInput(message.data);
            return;
          case "resize":
            onResize(message.cols, message.rows);
            return;
          case "error":
            onBridgeError?.(message.message);
            return;
        }
      },
      [onBridgeError, onInput, onReady, onResize],
    );

    // Renderer-death recovery: reset the ready/queue state (the reloaded
    // page starts its handshake over from scratch) and remount the
    // `WebView`. Self-contained — this recovers the WebView's own display
    // even if the caller doesn't wire `onRendererGone` at all; a caller
    // that does still needs to force its upstream connection to re-attach
    // (see that prop's doc comment) to get the scrollback back.
    const reloadWebView = useCallback(() => {
      readyRef.current = false;
      pendingMessagesRef.current = [];
      setWebviewGeneration((generation) => generation + 1);
    }, []);

    const handleRenderProcessGone = useCallback(
      (event: WebViewRenderProcessGoneEvent) => {
        onBridgeError?.(
          event.nativeEvent.didCrash
            ? "Terminal renderer process crashed — reloading."
            : "Terminal renderer process was reclaimed — reloading.",
        );
        onRendererGone?.();
        reloadWebView();
      },
      [onBridgeError, onRendererGone, reloadWebView],
    );

    const handleContentProcessDidTerminate = useCallback(
      (_event: WebViewContentProcessDidTerminateEvent) => {
        onBridgeError?.("Terminal renderer process terminated — reloading.");
        onRendererGone?.();
        reloadWebView();
      },
      [onBridgeError, onRendererGone, reloadWebView],
    );

    const handleError = useCallback(
      (event: WebViewErrorEvent) => {
        onBridgeError?.(`Terminal failed to load: ${event.nativeEvent.description}`);
      },
      [onBridgeError],
    );

    const handleHttpError = useCallback(
      (event: WebViewHttpErrorEvent) => {
        onBridgeError?.(`Terminal HTTP error (${event.nativeEvent.statusCode}).`);
      },
      [onBridgeError],
    );

    return (
      <View style={[styles.root, style]}>
        <WebView
          key={webviewGeneration}
          ref={webviewRef}
          originWhitelist={["*"]}
          source={{ html: TERMINAL_HOST_HTML }}
          onMessage={handleMessage}
          onRenderProcessGone={handleRenderProcessGone}
          onContentProcessDidTerminate={handleContentProcessDidTerminate}
          onError={handleError}
          onHttpError={handleHttpError}
          javaScriptEnabled
          domStorageEnabled={false}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          hideKeyboardAccessoryView
          style={styles.webview}
        />
      </View>
    );
  },
);

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: "#0b0d10",
  },
});
