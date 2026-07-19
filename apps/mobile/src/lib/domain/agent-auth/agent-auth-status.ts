import type { AgentReadinessState, AgentSummary } from "@anyharness/sdk";

/**
 * Group H — agent auth/readiness status derivation, ported (not
 * reimplemented) from two distinct web `product-client` sources so both
 * layers of the web harness pane read the same on mobile:
 *
 * - `deriveAgentReadinessStatus` mirrors `AGENT_READINESS_LABELS`
 *   (`lib/domain/agents/readiness-presentation.ts`) + the readiness branch of
 *   `getAgentStatusDisplay` (`lib/domain/agents/status-presentation.ts`,
 *   dropping the `reconcileResult`/`isReconciling` params — Group H has no
 *   install/reconcile progress source) + the status-dot visibility/color
 *   rules from `components/settings/sidebar/HarnessStatusDot.tsx`. This is
 *   the label used for the agent list row and the detail screen's header.
 * - `deriveAgentCliAuthStatus` mirrors the `cliAuthState`-preferring label +
 *   `canRunLogin`/`isAuthenticated` logic inlined in `CliDetails`
 *   (`components/settings/panes/agents/harness/HarnessAuthCliDetails.tsx`)
 *   — this is what actually decides whether the "Authenticate" button (the
 *   device-code login terminal entry point) shows on the detail screen.
 */

export type AgentAuthStatusTone = "muted" | "success" | "warning" | "destructive";

const AGENT_READINESS_LABELS: Record<AgentReadinessState, string> = {
  ready: "Configured",
  install_required: "Install required",
  credentials_required: "Credentials required",
  login_required: "Login required",
  unsupported: "Unsupported",
  error: "Unavailable",
};

export interface AgentReadinessStatusView {
  label: string;
  tone: AgentAuthStatusTone;
  /** `HarnessStatusDot`: hidden while install is still required, and hidden
   * again once credentials are ready and install hasn't failed (a clean
   * "ready" state renders no dot at all — "green dot = clutter"). */
  dotVisible: boolean;
  dotTone: "warning" | "destructive" | null;
}

export function deriveAgentReadinessStatus(agent: AgentSummary): AgentReadinessStatusView {
  const label = AGENT_READINESS_LABELS[agent.readiness];
  const tone: AgentAuthStatusTone =
    agent.readiness === "ready"
      ? "success"
      : agent.readiness === "install_required"
        || agent.readiness === "credentials_required"
        || agent.readiness === "login_required"
        ? "warning"
        : agent.readiness === "error"
          ? "destructive"
          : "muted";

  if (agent.installState === "install_required") {
    return { label, tone, dotVisible: false, dotTone: null };
  }
  if (agent.credentialState === "ready" && agent.installState !== "failed") {
    return { label, tone, dotVisible: false, dotTone: null };
  }
  if (agent.installState === "failed") {
    return { label, tone, dotVisible: true, dotTone: "destructive" };
  }
  if (agent.credentialState === "login_required" || agent.credentialState === "missing_env") {
    return { label, tone, dotVisible: true, dotTone: "warning" };
  }
  return { label, tone, dotVisible: true, dotTone: "destructive" };
}

export interface AgentCliAuthStatusView {
  label: string;
  tone: AgentAuthStatusTone;
  /** Whether the "Authenticate" action (device-code login terminal) should
   * be offered. */
  canRunLogin: boolean;
  isAuthenticated: boolean;
}

const CLI_NOT_AUTHENTICATED = "CLI not authenticated";
const CLI_AUTHENTICATED = "Authenticated";
const CLI_EXPIRED = "CLI credentials expired";
const CLI_NATIVE = "No auth configured — the CLI's own login is used.";

export function deriveAgentCliAuthStatus(agent: AgentSummary): AgentCliAuthStatusView {
  const cliAuthState = agent.cliAuthState ?? null;
  const cliIsAuthenticated = cliAuthState === "authenticated";
  const cliIsExpired = cliAuthState === "expired";
  const cliIsAbsent = cliAuthState === "absent";

  // Fallback: when cliAuthState is missing/unsupported, derive from readiness
  // (mirrors CliDetails' fallbackCanRunLogin/fallbackIsAuthenticated exactly,
  // including the redundant `readiness !== "ready"` guard from the source).
  const fallbackCanRunLogin =
    agent.readiness !== "ready" && agent.readiness === "login_required" && agent.supportsLogin;
  const fallbackIsAuthenticated = agent.readiness === "ready";

  const canRunLogin = cliAuthState
    ? (cliIsExpired || cliIsAbsent) && agent.supportsLogin
    : fallbackCanRunLogin;
  const isAuthenticated = cliAuthState ? cliIsAuthenticated : fallbackIsAuthenticated;

  if (cliIsExpired) {
    return { label: CLI_EXPIRED, tone: "destructive", canRunLogin, isAuthenticated };
  }
  if (cliIsAbsent || (canRunLogin && !cliAuthState)) {
    return { label: CLI_NOT_AUTHENTICATED, tone: "destructive", canRunLogin, isAuthenticated };
  }
  if (isAuthenticated) {
    return { label: CLI_AUTHENTICATED, tone: "muted", canRunLogin, isAuthenticated };
  }
  return { label: CLI_NATIVE, tone: "muted", canRunLogin, isAuthenticated };
}
