import { AnyHarnessClient, type TerminalWebSocketAuthTransport } from "@anyharness/sdk";
import {
  ProliferateClientError,
  type CloudWorkspaceDetail,
  type ProliferateCloudClient,
} from "@proliferate/cloud-sdk";

export interface MobileCloudSandboxRuntimeConnection {
  runtimeUrl: string;
  authToken: string;
  anyharnessWorkspaceId: string;
  runtimeAccessKind: "proliferate-gateway";
  /**
   * The cloud gateway authenticates terminal/feed WebSockets via the
   * Sec-WebSocket-Protocol header rather than a query string (matches the
   * desktop/web resolver's `cloud-sandbox-gateway.ts`), so this is always
   * "protocol" for the mobile cloud-sandbox connection.
   */
  webSocketAuthTransport: TerminalWebSocketAuthTransport;
}

export function isMobileCloudSandboxWorkspace(
  workspace: Pick<CloudWorkspaceDetail, "sandboxType"> | null | undefined,
): boolean {
  return workspace?.sandboxType === "managed_personal" || workspace?.sandboxType === "managed_shared";
}

/**
 * Fix C (E3 borderline-Important, reviewer finding): the pre-flight guard
 * the now-deleted `resolvePermissionInteraction`
 * (`use-mobile-chat-actions.ts`, removed in the E3/I2 collapse commit) used
 * to run before its hand-rolled `anyharness.sessions.resolveInteraction`
 * call — restored in `useMobileChatInteractionActions`'s `resolve()`/
 * `revealMcpElicitationUrl()`, which had started firing the real
 * `useResolveSessionInteractionMutation`/`useRevealMcpElicitationUrlMutation`
 * unconditionally. Mirrors web's `getWorkspaceRuntimeBlockReason` check
 * (`use-session-interaction-resolution-actions.ts`): an unclaimed workspace
 * or one whose cloud sandbox runtime isn't ready must not reach the
 * mutation. Messages are verbatim from the deleted hook — the same copy
 * `use-mobile-chat-prompt-actions.ts`'s `submitPrompt` pre-flight already
 * reuses for the composer's send path, so approving/declining/answering an
 * interaction and sending a prompt fail the same way for the same reasons.
 *
 * Lives here (not in a `lib/domain` module alongside the interaction
 * request builders) so it can reuse `isMobileCloudSandboxWorkspace` above
 * without introducing a domain -> access import; it's kept dependency-free
 * (no React/React Native imports) precisely so it stays unit-testable
 * without pulling those in transitively — see this file's `.test.ts`.
 */
export function resolveMobileInteractionBlockReason(input: {
  workspace: Pick<CloudWorkspaceDetail, "sandboxType"> | null;
  isUnclaimed: boolean;
}): string | null {
  if (input.isUnclaimed) {
    return "Claim this workspace before approving commands from mobile.";
  }
  if (!isMobileCloudSandboxWorkspace(input.workspace)) {
    return "Cloud workspace runtime is unavailable.";
  }
  return null;
}

export async function resolveMobileCloudSandboxWorkspaceConnection(input: {
  workspace: CloudWorkspaceDetail;
  productToken: string | null;
  client: ProliferateCloudClient;
}): Promise<MobileCloudSandboxRuntimeConnection> {
  if (!input.productToken) {
    throw new Error("Cloud runtime unavailable. Sign in again and retry.");
  }
  const anyharnessWorkspaceId = input.workspace.anyharnessWorkspaceId;
  if (!anyharnessWorkspaceId) {
    throw new ProliferateClientError(
      "Cloud workspace runtime is not ready yet.",
      409,
      "workspace_not_ready",
    );
  }
  return {
    runtimeUrl: input.client.buildUrl("/v1/gateway/cloud-sandbox/anyharness"),
    authToken: input.productToken,
    anyharnessWorkspaceId,
    runtimeAccessKind: "proliferate-gateway",
    webSocketAuthTransport: "protocol",
  };
}

export async function getMobileCloudSandboxAnyHarnessClient(input: {
  workspace: CloudWorkspaceDetail;
  productToken: string | null;
  client: ProliferateCloudClient;
}): Promise<{
  connection: MobileCloudSandboxRuntimeConnection;
  anyharness: AnyHarnessClient;
}> {
  const connection = await resolveMobileCloudSandboxWorkspaceConnection(input);
  return {
    connection,
    anyharness: new AnyHarnessClient({
      baseUrl: connection.runtimeUrl,
      authToken: connection.authToken,
    }),
  };
}
