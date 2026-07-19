import { describe, expect, it } from "vitest";
import { ProliferateClientError, type CloudWorkspaceDetail, type ProliferateCloudClient } from "@proliferate/cloud-sdk";

import {
  resolveMobileCloudSandboxWorkspaceConnection,
  resolveMobileInteractionBlockReason,
} from "./cloud-sandbox-runtime";

function fakeClient(): ProliferateCloudClient {
  return {
    buildUrl: (path: string) => `https://gateway.test${path}`,
  } as unknown as ProliferateCloudClient;
}

function fakeWorkspace(anyharnessWorkspaceId: string | null): CloudWorkspaceDetail {
  return { anyharnessWorkspaceId } as unknown as CloudWorkspaceDetail;
}

describe("resolveMobileCloudSandboxWorkspaceConnection", () => {
  it("throws when there is no product token", async () => {
    await expect(
      resolveMobileCloudSandboxWorkspaceConnection({
        workspace: fakeWorkspace("ah-1"),
        productToken: null,
        client: fakeClient(),
      }),
    ).rejects.toThrow("Cloud runtime unavailable. Sign in again and retry.");
  });

  it("throws a workspace_not_ready ProliferateClientError when the AnyHarness workspace isn't provisioned yet", async () => {
    await expect(
      resolveMobileCloudSandboxWorkspaceConnection({
        workspace: fakeWorkspace(null),
        productToken: "token-1",
        client: fakeClient(),
      }),
    ).rejects.toMatchObject({
      code: "workspace_not_ready",
      status: 409,
    });
  });

  it("resolves the cloud gateway connection with the AnyHarnessWorkspace-shaped fields", async () => {
    const connection = await resolveMobileCloudSandboxWorkspaceConnection({
      workspace: fakeWorkspace("ah-1"),
      productToken: "token-1",
      client: fakeClient(),
    });
    expect(connection).toEqual({
      runtimeUrl: "https://gateway.test/v1/gateway/cloud-sandbox/anyharness",
      authToken: "token-1",
      anyharnessWorkspaceId: "ah-1",
      runtimeAccessKind: "proliferate-gateway",
      webSocketAuthTransport: "protocol",
    });
  });

  it("propagates ProliferateClientError as its own type, not a generic Error", async () => {
    const error = await resolveMobileCloudSandboxWorkspaceConnection({
      workspace: fakeWorkspace(""),
      productToken: "token-1",
      client: fakeClient(),
    }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ProliferateClientError);
  });
});

describe("resolveMobileInteractionBlockReason", () => {
  it("blocks with the claim message when the workspace is unclaimed, even if the runtime looks ready", () => {
    expect(resolveMobileInteractionBlockReason({
      workspace: { sandboxType: "managed_personal" },
      isUnclaimed: true,
    })).toBe("Claim this workspace before approving commands from mobile.");
  });

  it("blocks with the runtime-unavailable message when claimed but the sandbox type isn't a managed cloud runtime", () => {
    expect(resolveMobileInteractionBlockReason({
      workspace: { sandboxType: "byo" as never },
      isUnclaimed: false,
    })).toBe("Cloud workspace runtime is unavailable.");
  });

  it("blocks with the runtime-unavailable message when the workspace hasn't loaded yet", () => {
    expect(resolveMobileInteractionBlockReason({
      workspace: null,
      isUnclaimed: false,
    })).toBe("Cloud workspace runtime is unavailable.");
  });

  it("checks unclaimed before runtime availability — the claim message wins when both would block", () => {
    expect(resolveMobileInteractionBlockReason({
      workspace: null,
      isUnclaimed: true,
    })).toBe("Claim this workspace before approving commands from mobile.");
  });

  it("does not block a claimed, managed-personal-sandbox workspace", () => {
    expect(resolveMobileInteractionBlockReason({
      workspace: { sandboxType: "managed_personal" },
      isUnclaimed: false,
    })).toBeNull();
  });

  it("does not block a claimed, managed-shared-sandbox workspace", () => {
    expect(resolveMobileInteractionBlockReason({
      workspace: { sandboxType: "managed_shared" },
      isUnclaimed: false,
    })).toBeNull();
  });
});
