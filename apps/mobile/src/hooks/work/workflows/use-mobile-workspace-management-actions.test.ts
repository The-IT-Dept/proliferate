import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M5 regression coverage for the two previously-untested integration seams
 * in this hook: (1) delete/rename call the underlying `@proliferate/
 * cloud-sdk` client functions with the right args, and (2) a successful
 * mutation invokes `invalidateWorkspaceLists` — the contract the Workspaces
 * list relies on to make a deleted/renamed row disappear/update. A
 * regression on either would silently reintroduce ghost rows (M5) or send
 * the wrong workspace id/payload to the API.
 *
 * Every hook this file depends on (`useMutation`, the cloud-sdk client
 * functions, the cloud-sdk-react mutation hooks, and the local workspace
 * cache hook) is mocked to a plain function, so
 * `useMobileWorkspaceManagementActions()` can be called directly as a plain
 * function here rather than through a React render tree - there's no RN/DOM
 * test harness set up for this app (vitest.config.ts runs plain "node" for
 * pure logic modules), and this keeps the test focused on this hook's own
 * wiring rather than react-query's internals.
 */

const {
  deleteCloudWorkspaceMock,
  updateCloudWorkspaceDisplayNameMock,
  fakeClient,
  archiveMutateAsync,
  restoreMutateAsync,
  invalidateWorkspaceListsMock,
} = vi.hoisted(() => ({
  deleteCloudWorkspaceMock: vi.fn(),
  updateCloudWorkspaceDisplayNameMock: vi.fn(),
  fakeClient: { id: "fake-cloud-client" },
  archiveMutateAsync: vi.fn(),
  restoreMutateAsync: vi.fn(),
  invalidateWorkspaceListsMock: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  // A minimal stand-in for react-query's useMutation: runs mutationFn, and
  // on success runs onSuccess before resolving - the two behaviors this
  // hook's wiring depends on (mutationFn args, and invalidation-on-success).
  useMutation: (options: {
    mutationFn: (variables: unknown) => Promise<unknown>;
    onSuccess?: (data: unknown, variables: unknown) => void;
  }) => ({
    mutateAsync: (variables: unknown) =>
      Promise.resolve(options.mutationFn(variables)).then((data: unknown) => {
        options.onSuccess?.(data, variables);
        return data;
      }),
    isPending: false,
  }),
}));

vi.mock("@proliferate/cloud-sdk", () => ({
  deleteCloudWorkspace: (...args: unknown[]) => deleteCloudWorkspaceMock(...args),
  updateCloudWorkspaceDisplayName: (...args: unknown[]) => updateCloudWorkspaceDisplayNameMock(...args),
}));

vi.mock("@proliferate/cloud-sdk-react", () => ({
  useCloudClient: () => fakeClient,
  useArchiveCloudWorkspace: () => ({ mutateAsync: archiveMutateAsync, isPending: false }),
  useRestoreCloudWorkspace: () => ({ mutateAsync: restoreMutateAsync, isPending: false }),
}));

vi.mock("../../access/cloud/workspaces/use-mobile-cloud-workspace-cache", () => ({
  useMobileCloudWorkspaceCache: () => ({ invalidateWorkspaceLists: invalidateWorkspaceListsMock }),
}));

import { useMobileWorkspaceManagementActions } from "./use-mobile-workspace-management-actions";

beforeEach(() => {
  deleteCloudWorkspaceMock.mockReset();
  updateCloudWorkspaceDisplayNameMock.mockReset();
  archiveMutateAsync.mockReset();
  restoreMutateAsync.mockReset();
  invalidateWorkspaceListsMock.mockReset();
});

describe("useMobileWorkspaceManagementActions", () => {
  it("delete calls deleteCloudWorkspace(workspaceId, client) and invalidates workspace lists on success", async () => {
    deleteCloudWorkspaceMock.mockResolvedValue(undefined);
    const actions = useMobileWorkspaceManagementActions();

    await actions.deleteWorkspace("workspace-1");

    expect(deleteCloudWorkspaceMock).toHaveBeenCalledWith("workspace-1", fakeClient);
    expect(invalidateWorkspaceListsMock).toHaveBeenCalledTimes(1);
  });

  it("rename calls updateCloudWorkspaceDisplayName(workspaceId, name, options, client) and invalidates workspace lists on success", async () => {
    updateCloudWorkspaceDisplayNameMock.mockResolvedValue(undefined);
    const actions = useMobileWorkspaceManagementActions();

    await actions.renameWorkspace("workspace-2", "New name");

    expect(updateCloudWorkspaceDisplayNameMock).toHaveBeenCalledWith(
      "workspace-2",
      "New name",
      undefined,
      fakeClient,
    );
    expect(invalidateWorkspaceListsMock).toHaveBeenCalledTimes(1);
  });

  it("rename passes null through verbatim to clear the display name (M3)", async () => {
    updateCloudWorkspaceDisplayNameMock.mockResolvedValue(undefined);
    const actions = useMobileWorkspaceManagementActions();

    await actions.renameWorkspace("workspace-3", null);

    expect(updateCloudWorkspaceDisplayNameMock).toHaveBeenCalledWith("workspace-3", null, undefined, fakeClient);
  });

  it("does not invalidate workspace lists when delete fails (a regression here reintroduces ghost rows)", async () => {
    deleteCloudWorkspaceMock.mockRejectedValue(new Error("boom"));
    const actions = useMobileWorkspaceManagementActions();

    await expect(actions.deleteWorkspace("workspace-4")).rejects.toThrow("boom");

    expect(invalidateWorkspaceListsMock).not.toHaveBeenCalled();
  });

  it("does not invalidate workspace lists when rename fails", async () => {
    updateCloudWorkspaceDisplayNameMock.mockRejectedValue(new Error("nope"));
    const actions = useMobileWorkspaceManagementActions();

    await expect(actions.renameWorkspace("workspace-5", "X")).rejects.toThrow("nope");

    expect(invalidateWorkspaceListsMock).not.toHaveBeenCalled();
  });
});
