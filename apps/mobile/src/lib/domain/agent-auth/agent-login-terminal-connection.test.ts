import { describe, expect, it } from "vitest";

import { toAgentLoginTerminalConnectionInfo } from "./agent-login-terminal-connection";

/**
 * Group H — the one seam mapping `@anyharness/sdk-react`'s RUNTIME-scoped
 * context (`AnyHarnessRuntimeContextValue`: `{ runtimeUrl, authToken }`,
 * no `webSocketAuthTransport` field) onto `TerminalStreamConnectionInfo`
 * (Group F's `terminal-stream-controller.ts`), pulled out as its own tested
 * unit for the same reason `toTerminalStreamConnectionInfo` is (F's sibling
 * for the WORKSPACE-scoped connection): the one line whose omission silently
 * breaks WS auth (`webSocketAuthTransport`) deserves a real assertion, not
 * just inline object-literal plumbing inside a hook nothing here can render
 * (mobile vitest is node-env, no RTL). Unlike the workspace connection,
 * mobile's Runtime context never carries `webSocketAuthTransport` — it's
 * hardcoded "protocol" here because mobile's cloud gateway always
 * authenticates terminal WS via the Sec-WebSocket-Protocol header (see
 * `lib/access/anyharness/cloud-sandbox-runtime.ts`'s
 * `MobileCloudSandboxRuntimeConnection.webSocketAuthTransport`, always
 * "protocol" for mobile).
 */

describe("toAgentLoginTerminalConnectionInfo", () => {
  it("maps runtimeUrl -> baseUrl, authToken passthrough, webSocketAuthTransport hardcoded protocol", () => {
    expect(
      toAgentLoginTerminalConnectionInfo({ runtimeUrl: "https://gateway.test", authToken: "tok_abc" }),
    ).toEqual({
      baseUrl: "https://gateway.test",
      authToken: "tok_abc",
      webSocketAuthTransport: "protocol",
    });
  });

  it("trims a padded runtimeUrl", () => {
    expect(
      toAgentLoginTerminalConnectionInfo({ runtimeUrl: "  https://gateway.test  ", authToken: "tok" }),
    ).toEqual({
      baseUrl: "https://gateway.test",
      authToken: "tok",
      webSocketAuthTransport: "protocol",
    });
  });

  it("a null runtimeUrl (not yet signed in) maps to an empty baseUrl, not 'null'", () => {
    expect(toAgentLoginTerminalConnectionInfo({ runtimeUrl: null, authToken: null })).toEqual({
      baseUrl: "",
      authToken: undefined,
      webSocketAuthTransport: "protocol",
    });
  });

  it("a null authToken maps to undefined (matches TerminalStreamConnectionInfo's optional field)", () => {
    expect(
      toAgentLoginTerminalConnectionInfo({ runtimeUrl: "https://gateway.test", authToken: null }).authToken,
    ).toBeUndefined();
  });
});
