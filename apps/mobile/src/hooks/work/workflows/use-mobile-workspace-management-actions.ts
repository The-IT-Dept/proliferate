import { useMutation } from "@tanstack/react-query";
import { deleteCloudWorkspace, updateCloudWorkspaceDisplayName } from "@proliferate/cloud-sdk";
import {
  useArchiveCloudWorkspace,
  useCloudClient,
  useRestoreCloudWorkspace,
} from "@proliferate/cloud-sdk-react";

import { useMobileCloudWorkspaceCache } from "../../access/cloud/workspaces/use-mobile-cloud-workspace-cache";

/**
 * Per-workspace management actions (archive/restore/delete/rename) for the
 * Workspaces list (mockup B). Mirrors the *behavior* of web's
 * `useCloudWorkspaceActions` (archive/restore/delete/refresh) and
 * `useWorkspaceDisplayNameActions` (rename) — those hooks live in
 * `@proliferate/product-client` and are wired into desktop-only caches
 * (harness connection store, deferred-launch store, telemetry, etc.) that
 * don't exist on mobile, so importing them directly isn't an option. Archive
 * and restore reuse the shared `@proliferate/cloud-sdk-react` mutation hooks
 * verbatim; delete and rename call the same underlying
 * `@proliferate/cloud-sdk` client functions those web hooks call
 * (`deleteCloudWorkspace`, `updateCloudWorkspaceDisplayName`) through a thin
 * local `useMutation`, so no API call is hand-rolled — only the
 * product-client-specific cache plumbing around it is intentionally
 * dropped.
 */
export function useMobileWorkspaceManagementActions() {
  const cloudClient = useCloudClient();
  const { invalidateWorkspaceLists } = useMobileCloudWorkspaceCache();

  const archiveMutation = useArchiveCloudWorkspace();
  const restoreMutation = useRestoreCloudWorkspace();

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: (workspaceId) => deleteCloudWorkspace(workspaceId, cloudClient),
    onSuccess: () => {
      invalidateWorkspaceLists();
    },
  });

  const renameMutation = useMutation<
    void,
    Error,
    { workspaceId: string; displayName: string | null }
  >({
    mutationFn: async ({ workspaceId, displayName }) => {
      await updateCloudWorkspaceDisplayName(workspaceId, displayName, undefined, cloudClient);
    },
    onSuccess: () => {
      invalidateWorkspaceLists();
    },
  });

  return {
    archiveWorkspace: (workspaceId: string) => archiveMutation.mutateAsync(workspaceId),
    isArchivingWorkspace: archiveMutation.isPending,

    restoreWorkspace: (workspaceId: string) => restoreMutation.mutateAsync(workspaceId),
    isRestoringWorkspace: restoreMutation.isPending,

    deleteWorkspace: (workspaceId: string) => deleteMutation.mutateAsync(workspaceId),
    isDeletingWorkspace: deleteMutation.isPending,

    renameWorkspace: (workspaceId: string, displayName: string | null) =>
      renameMutation.mutateAsync({ workspaceId, displayName }),
    isRenamingWorkspace: renameMutation.isPending,
  };
}
