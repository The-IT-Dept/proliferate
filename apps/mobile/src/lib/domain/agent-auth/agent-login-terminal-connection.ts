import type { TerminalWebSocketAuthTransport } from "@anyharness/sdk";

import type { TerminalStreamConnectionInfo } from "../../../hooks/terminal/derived/terminal-stream-controller";

/**
 * Mobile is cloud-only; the login-terminal WS always authenticates via the
 * Sec-WebSocket-Protocol header, matching
 * `MobileCloudSandboxRuntimeConnection.webSocketAuthTransport`
 * (`lib/access/anyharness/cloud-sandbox-runtime.ts`) — never query-string
 * auth. See this file's test for why this is hardcoded rather than read off
 * context: `AnyHarnessRuntimeContextValue` (`@anyharness/sdk-react`) has no
 * `webSocketAuthTransport` field at all.
 */
export const AGENT_LOGIN_TERMINAL_WS_AUTH_TRANSPORT: TerminalWebSocketAuthTransport = "protocol";

/**
 * The seam mapping the RUNTIME-scoped AnyHarness context (`{ runtimeUrl,
 * authToken }`) onto `TerminalStreamConnectionInfo`, the shape
 * `TerminalStreamController` (Group F, reused as-is for the login terminal —
 * see `use-agent-login-terminal-stream.ts`) needs to connect. Takes a
 * structural/duck-typed param rather than importing
 * `AnyHarnessRuntimeContextValue` from `@anyharness/sdk-react`, mirroring
 * `toTerminalStreamConnectionInfo`'s (Group F) same choice for the workspace
 * connection.
 */
export function toAgentLoginTerminalConnectionInfo(runtime: {
  runtimeUrl: string | null;
  authToken?: string | null;
}): TerminalStreamConnectionInfo {
  return {
    baseUrl: runtime.runtimeUrl?.trim() ?? "",
    authToken: runtime.authToken ?? undefined,
    webSocketAuthTransport: AGENT_LOGIN_TERMINAL_WS_AUTH_TRANSPORT,
  };
}
