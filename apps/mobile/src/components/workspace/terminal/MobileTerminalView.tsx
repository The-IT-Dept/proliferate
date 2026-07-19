import { forwardRef, useCallback, useImperativeHandle, useRef } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

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
   * inside the host page) — the terminal keeps running; the caller decides
   * whether/how to surface this. */
  onBridgeError?: (message: string) => void;
  style?: StyleProp<ViewStyle>;
}

export const MobileTerminalView = forwardRef<MobileTerminalViewHandle, MobileTerminalViewProps>(
  function MobileTerminalView({ onInput, onResize, onReady, onBridgeError, style }, ref) {
    const webviewRef = useRef<WebView>(null);

    useImperativeHandle(
      ref,
      () => ({
        write: (bytes: Uint8Array) => {
          webviewRef.current?.postMessage(encodeTerminalDataMessage(bytes));
        },
        writeGapNotice: () => {
          webviewRef.current?.postMessage(encodeHostToGuestMessage({ type: "gap" }));
        },
        writeExitNotice: (code: number | null) => {
          webviewRef.current?.postMessage(encodeHostToGuestMessage({ type: "exit", code }));
        },
      }),
      [],
    );

    const handleMessage = useCallback(
      (event: WebViewMessageEvent) => {
        const message = parseGuestToHostMessage(event.nativeEvent.data);
        if (!message) {
          return;
        }
        switch (message.type) {
          case "ready":
            onReady?.({ cols: message.cols, rows: message.rows });
            return;
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

    return (
      <View style={[styles.root, style]}>
        <WebView
          ref={webviewRef}
          originWhitelist={["*"]}
          source={{ html: TERMINAL_HOST_HTML }}
          onMessage={handleMessage}
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
