import type { ReactNode } from "react";
import { AnyHarnessRuntime, AnyHarnessWorkspace } from "@anyharness/sdk-react";
import { useCloudClient } from "@proliferate/cloud-sdk-react";

import { useMobileWorkspaceConnectionResolver } from "../hooks/access/cloud/workspaces/use-mobile-workspace-connection-resolver";
import { useMobileAuth } from "./MobileAuthProvider";

interface MobileWorkspaceRuntimeProviderProps {
  /** The workspace currently open in the pushed workspace shell, or null on
   * the 4-tab root (no workspace scope needed yet). */
  workspaceId: string | null;
  children: ReactNode;
}

/**
 * Composes the AnyHarness root providers from `@anyharness/sdk-react`:
 * `AnyHarnessRuntime` (the runtime-level scope — the single cloud gateway,
 * used for non-workspace-scoped queries like the agent catalog) wrapping
 * `AnyHarnessWorkspace` (the active workspace's resolved connection). Mobile
 * is cloud-only, so `runtimeUrl` is always the same
 * `/v1/gateway/cloud-sandbox/anyharness` gateway path the existing chat hooks
 * already call through `resolveMobileCloudSandboxWorkspaceConnection`
 * (`lib/access/anyharness/cloud-sandbox-runtime.ts`) — this just exposes that
 * same connection via the shared sdk-react context so later groups can adopt
 * its `use*Query`/`use*Mutation` hooks instead of hand-rolling AnyHarnessClient
 * calls.
 */
export function MobileWorkspaceRuntimeProvider({
  workspaceId,
  children,
}: MobileWorkspaceRuntimeProviderProps) {
  const { accessToken } = useMobileAuth();
  const cloudClient = useCloudClient();
  const resolveConnection = useMobileWorkspaceConnectionResolver();
  const runtimeUrl = accessToken
    ? cloudClient.buildUrl("/v1/gateway/cloud-sandbox/anyharness")
    : null;

  return (
    <AnyHarnessRuntime runtimeUrl={runtimeUrl} authToken={accessToken}>
      <AnyHarnessWorkspace workspaceId={workspaceId} resolveConnection={resolveConnection}>
        {children}
      </AnyHarnessWorkspace>
    </AnyHarnessRuntime>
  );
}
