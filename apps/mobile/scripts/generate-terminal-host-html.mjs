#!/usr/bin/env node
// Group F spike — regenerates the self-contained xterm "host page" loaded
// into MobileTerminalView's WebView (see that component + this script's
// sibling `terminal-host-html.generated.ts`). The page must not fetch
// anything over the network (the app is offline-capable, and a WebView
// `source={{ html }}` string has no bundler-served asset path anyway), so
// `@xterm/xterm` and `@xterm/addon-fit`'s built UMD bundles + xterm's CSS are
// read straight out of node_modules and inlined verbatim. Re-run this
// whenever those two package versions change (kept in lockstep with
// apps/packages/product-client's web/desktop terminal, currently
// @xterm/xterm ^6.0.0 / @xterm/addon-fit ^0.11.0) — the generated output is
// committed, not built on every install, so a stale run is a visible diff,
// not a silent drift.
//
// Usage: node scripts/generate-terminal-host-html.mjs

import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const outFile = resolve(
  scriptDir,
  "../src/components/workspace/terminal/terminal-host-html.generated.ts",
);

const xtermPkgDir = dirname(require.resolve("@xterm/xterm/package.json"));
const fitPkgDir = dirname(require.resolve("@xterm/addon-fit/package.json"));
const xtermPkg = JSON.parse(readFileSync(resolve(xtermPkgDir, "package.json"), "utf8"));
const fitPkg = JSON.parse(readFileSync(resolve(fitPkgDir, "package.json"), "utf8"));

const xtermJs = readFileSync(resolve(xtermPkgDir, "lib/xterm.js"), "utf8");
const xtermCss = readFileSync(resolve(xtermPkgDir, "css/xterm.css"), "utf8");
const fitAddonJs = readFileSync(resolve(fitPkgDir, "lib/addon-fit.js"), "utf8");

// The bridge glue: instantiates xterm + FitAddon against the UMD globals the
// two inlined bundles attach (`window.Terminal`, `window.FitAddon.FitAddon`),
// and implements both halves of the postMessage contract in
// `src/lib/domain/terminal/terminal-bridge-protocol.ts` (kept hand-in-sync —
// this glue runs only inside the WebView's JS context, so it can't literally
// import that module; message shapes must match by inspection).
const bridgeJs = `
(function () {
  "use strict";

  function post(message) {
    if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
      window.ReactNativeWebView.postMessage(JSON.stringify(message));
    }
  }

  function base64ToBytes(base64) {
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  var container = document.getElementById("terminal");
  var term = new window.Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: "Menlo, \\"SF Mono\\", Consolas, monospace",
    theme: { background: "#0b0d10", foreground: "#e8e8e8", cursor: "#e8e8e8" },
    allowTransparency: false,
    scrollback: 5000,
    convertEol: false,
  });
  var fitAddon = new window.FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  term.open(container);
  try {
    fitAddon.fit();
  } catch (err) {
    // Container not laid out yet on first paint — the ResizeObserver below
    // will fit() again once it is.
  }

  term.onData(function (data) {
    post({ type: "input", data: data });
  });

  term.onResize(function (size) {
    post({ type: "resize", cols: size.cols, rows: size.rows });
  });

  function handleHostMessage(raw) {
    var message;
    try {
      message = JSON.parse(raw);
    } catch (err) {
      return;
    }
    if (!message || typeof message !== "object") {
      return;
    }
    if (message.type === "data" && typeof message.dataBase64 === "string") {
      term.write(base64ToBytes(message.dataBase64));
    } else if (message.type === "gap") {
      term.write("\\r\\n\\x1b[2m[terminal output gap: earlier output was discarded]\\x1b[0m\\r\\n");
    } else if (message.type === "exit") {
      var code = message.code === null || message.code === undefined ? "unknown" : message.code;
      term.write("\\r\\n\\x1b[2m[process exited (" + code + ")]\\x1b[0m\\r\\n");
    }
  }

  // RN's WebView.postMessage() dispatches a "message" event inside the page
  // — historically on \`document\` on Android and \`window\` on iOS (this has
  // shifted across react-native-webview versions). Registering both is the
  // documented defensive pattern; dispatchEvent on \`document\` does not
  // bubble to \`window\`, so a given postMessage() call is only ever handled
  // once here, whichever target actually receives it.
  document.addEventListener("message", function (event) {
    handleHostMessage(event.data);
  });
  window.addEventListener("message", function (event) {
    handleHostMessage(event.data);
  });

  var resizeObserver = new ResizeObserver(function () {
    try {
      fitAddon.fit();
    } catch (err) {
      // ignore — transient during teardown
    }
  });
  resizeObserver.observe(container);

  window.addEventListener("error", function (event) {
    post({ type: "error", message: String(event && event.message) });
  });

  post({ type: "ready", cols: term.cols, rows: term.rows });
})();
`.trim();

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
<style>
html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #0b0d10; overflow: hidden; }
#terminal { width: 100%; height: 100%; }
${xtermCss}
</style>
</head>
<body>
<div id="terminal"></div>
<script>${xtermJs}</script>
<script>${fitAddonJs}</script>
<script>${bridgeJs}</script>
</body>
</html>
`;

const banner = `/**
 * GENERATED FILE — do not hand-edit.
 * Produced by \`scripts/generate-terminal-host-html.mjs\` from:
 *   @xterm/xterm@${xtermPkg.version} (lib/xterm.js UMD build + css/xterm.css)
 *   @xterm/addon-fit@${fitPkg.version} (lib/addon-fit.js UMD build)
 * Re-run that script after bumping either package. Loaded as
 * \`source={{ html: TERMINAL_HOST_HTML }}\` by MobileTerminalView — fully
 * self-contained, no network fetch (offline-capable app; a WebView html
 * string has no bundler asset path to fetch from anyway).
 */

export const TERMINAL_HOST_HTML = ${JSON.stringify(html)};
`;

writeFileSync(outFile, banner);
console.log(`Wrote ${outFile} (${(banner.length / 1024).toFixed(0)} KB)`);
