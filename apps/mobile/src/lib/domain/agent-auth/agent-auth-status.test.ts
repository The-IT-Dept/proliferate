import { describe, expect, it } from "vitest";
import type { AgentSummary } from "@anyharness/sdk";

import { deriveAgentCliAuthStatus, deriveAgentReadinessStatus } from "./agent-auth-status";

/**
 * Group H — pure status derivation ported from product-client's web
 * `HarnessStatusDot.tsx` + `status.ts`/`status-presentation.ts`
 * (readiness-driven, used for the agent list row + detail header) and
 * `HarnessAuthCliDetails.tsx`'s `CliDetails` (cliAuthState-driven, used for
 * the detail screen's login/CLI block, where the "Authenticate" button
 * visibility is decided). See the module doc comments in
 * `agent-auth-status.ts` for the exact source each branch mirrors.
 */

function baseAgent(overrides: Partial<AgentSummary> = {}): AgentSummary {
  return {
    agentProcess: { installed: true, role: "agent_process" },
    cliAuthState: null,
    credentialState: "ready",
    displayName: "Claude",
    docsUrl: null,
    expectedEnvVars: [],
    installState: "installed",
    kind: "claude",
    message: null,
    native: null,
    nativeRequired: false,
    readiness: "ready",
    supportsLogin: true,
    ...overrides,
  };
}

describe("deriveAgentReadinessStatus", () => {
  it("labels a ready agent Configured, success tone, no dot (HarnessStatusDot hides the clean state)", () => {
    const status = deriveAgentReadinessStatus(baseAgent({ readiness: "ready" }));
    expect(status).toEqual({
      label: "Configured",
      tone: "success",
      dotVisible: false,
      dotTone: null,
    });
  });

  it("hides the dot entirely while install is required, regardless of credential state", () => {
    const status = deriveAgentReadinessStatus(
      baseAgent({ readiness: "install_required", installState: "install_required", credentialState: "unknown" }),
    );
    expect(status.label).toBe("Install required");
    expect(status.tone).toBe("warning");
    expect(status.dotVisible).toBe(false);
    expect(status.dotTone).toBeNull();
  });

  it("shows an amber dot for login_required credential state", () => {
    const status = deriveAgentReadinessStatus(
      baseAgent({
        readiness: "login_required",
        installState: "installed",
        credentialState: "login_required",
      }),
    );
    expect(status.label).toBe("Login required");
    expect(status.tone).toBe("warning");
    expect(status.dotVisible).toBe(true);
    expect(status.dotTone).toBe("warning");
  });

  it("shows an amber dot for missing_env credential state", () => {
    const status = deriveAgentReadinessStatus(
      baseAgent({
        readiness: "credentials_required",
        installState: "installed",
        credentialState: "missing_env",
      }),
    );
    expect(status.label).toBe("Credentials required");
    expect(status.dotVisible).toBe(true);
    expect(status.dotTone).toBe("warning");
  });

  it("shows a red dot when installState is failed, even if credentials are ready", () => {
    const status = deriveAgentReadinessStatus(
      baseAgent({ readiness: "error", installState: "failed", credentialState: "ready" }),
    );
    expect(status.label).toBe("Unavailable");
    expect(status.tone).toBe("destructive");
    expect(status.dotVisible).toBe(true);
    expect(status.dotTone).toBe("destructive");
  });

  it("falls back to a red dot for an unknown credential state that isn't ready/login_required/missing_env", () => {
    const status = deriveAgentReadinessStatus(
      baseAgent({ readiness: "error", installState: "installed", credentialState: "unknown" }),
    );
    expect(status.dotVisible).toBe(true);
    expect(status.dotTone).toBe("destructive");
  });

  it("labels unsupported agents distinctly, muted tone", () => {
    const status = deriveAgentReadinessStatus(baseAgent({ readiness: "unsupported" }));
    expect(status.label).toBe("Unsupported");
    expect(status.tone).toBe("muted");
  });
});

describe("deriveAgentCliAuthStatus", () => {
  it("prefers cliAuthState when present: authenticated -> Authenticated, muted, no login action", () => {
    const status = deriveAgentCliAuthStatus(baseAgent({ cliAuthState: "authenticated" }));
    expect(status).toEqual({
      label: "Authenticated",
      tone: "muted",
      canRunLogin: false,
      isAuthenticated: true,
    });
  });

  it("expired cliAuthState -> destructive 'CLI credentials expired', login offered when supportsLogin", () => {
    const status = deriveAgentCliAuthStatus(baseAgent({ cliAuthState: "expired", supportsLogin: true }));
    expect(status.label).toBe("CLI credentials expired");
    expect(status.tone).toBe("destructive");
    expect(status.canRunLogin).toBe(true);
    expect(status.isAuthenticated).toBe(false);
  });

  it("absent cliAuthState -> destructive 'CLI not authenticated', login offered when supportsLogin", () => {
    const status = deriveAgentCliAuthStatus(baseAgent({ cliAuthState: "absent", supportsLogin: true }));
    expect(status.label).toBe("CLI not authenticated");
    expect(status.canRunLogin).toBe(true);
  });

  it("expired/absent cliAuthState never offers login when the agent doesn't supportsLogin", () => {
    const expired = deriveAgentCliAuthStatus(baseAgent({ cliAuthState: "expired", supportsLogin: false }));
    const absent = deriveAgentCliAuthStatus(baseAgent({ cliAuthState: "absent", supportsLogin: false }));
    expect(expired.canRunLogin).toBe(false);
    expect(absent.canRunLogin).toBe(false);
  });

  it("unsupported cliAuthState is a real (non-null) value: read literally, NOT the null-only fallback branch", () => {
    // cliAuthState is truthy ("unsupported" !== null), so this takes the
    // cliAuthState-literal branch, not the readiness fallback — even though
    // readiness says "ready", "unsupported" != "authenticated" so this
    // reads as not-authenticated (mirrors the web source's plain truthiness
    // check on `cliAuthState`, which doesn't special-case "unsupported").
    const status = deriveAgentCliAuthStatus(
      baseAgent({ cliAuthState: "unsupported", readiness: "ready" }),
    );
    expect(status.isAuthenticated).toBe(false);
    expect(status.canRunLogin).toBe(false);
    expect(status.label).toBe("No auth configured — the CLI's own login is used.");
  });

  it("no cliAuthState + readiness login_required + supportsLogin -> fallback canRunLogin true", () => {
    const status = deriveAgentCliAuthStatus(
      baseAgent({ cliAuthState: null, readiness: "login_required", supportsLogin: true }),
    );
    expect(status.canRunLogin).toBe(true);
    expect(status.isAuthenticated).toBe(false);
    expect(status.label).toBe("CLI not authenticated");
  });

  it("no cliAuthState + readiness ready -> fallback isAuthenticated true", () => {
    const status = deriveAgentCliAuthStatus(baseAgent({ cliAuthState: null, readiness: "ready" }));
    expect(status.isAuthenticated).toBe(true);
    expect(status.label).toBe("Authenticated");
  });

  it("no cliAuthState + readiness install_required -> neither authenticated nor a login action (native copy)", () => {
    const status = deriveAgentCliAuthStatus(
      baseAgent({ cliAuthState: null, readiness: "install_required", supportsLogin: true }),
    );
    expect(status.isAuthenticated).toBe(false);
    expect(status.canRunLogin).toBe(false);
    expect(status.label).toBe("No auth configured — the CLI's own login is used.");
  });
});
