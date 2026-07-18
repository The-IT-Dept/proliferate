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
