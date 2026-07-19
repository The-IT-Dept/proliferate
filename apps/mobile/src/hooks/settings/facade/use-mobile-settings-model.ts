import { useMemo } from "react";
import {
  useAuthViewer,
  useCloudBilling,
  useCloudSecrets,
  useRepositories,
  useOrganizations,
} from "@proliferate/cloud-sdk-react";

import type { MobileSettingsAccountSummary } from "../../../lib/domain/settings/mobile-settings-presentation";

export function useMobileSettingsModel(account: MobileSettingsAccountSummary) {
  const viewer = useAuthViewer();
  const organizations = useOrganizations();
  const billing = useCloudBilling({ ownerScope: "personal" });
  const repoConfigs = useRepositories();
  const personalSecrets = useCloudSecrets({ kind: "personal" });
  // Mobile has no org-switcher/active-organization store the way web's
  // settings does (`useActiveOrganization`); it defaults to the same first
  // organization the Organization section below already lists, sourced from
  // the `organizations` query already fetched above — no separate org-id
  // lookup. Any member (not just admins) can read organization secrets
  // (server: `_require_organization_member`, not `_require_organization_admin`
  // — only the write endpoints require admin), so this view-only counts row
  // needs no admin check.
  const activeOrganizationId = organizations.data?.organizations[0]?.id ?? null;
  const organizationSecrets = useCloudSecrets(
    activeOrganizationId ? { kind: "organization", organizationId: activeOrganizationId } : null,
  );

  const displayName =
    viewer.data?.user.display_name?.trim()
    || viewer.data?.user.email?.split("@")[0]
    || account.name;
  const email = viewer.data?.user.email ?? account.handle;
  const githubConnected = Boolean(viewer.data?.githubConnected);
  const githubChecking = viewer.isLoading && !viewer.data;
  const githubStateLabel = githubChecking
    ? "Checking"
    : viewer.isError
      ? "Unknown"
      : githubConnected
        ? "Linked"
        : "Required";
  const githubNeedsAttention = !githubChecking && (viewer.isError || !githubConnected);
  const passwordEnabled = Boolean(viewer.data?.passwordCredential.enabled);
  const passwordStateLabel = viewer.isLoading && !viewer.data
    ? "Checking"
    : passwordEnabled
      ? "Enabled"
      : "Not set";
  const authStateLabel = viewer.isError
    ? "Unknown"
    : viewer.isLoading
      ? "Checking"
      : viewer.data?.onboardingState === "active"
        ? "Active"
        : "Setup";
  const configuredRepos = useMemo(
    () => (repoConfigs.data?.repositories ?? []).flatMap((repo) => {
      const cloudEnvironment = repo.environments.find((environment) =>
        environment.kind === "cloud"
      );
      if (!cloudEnvironment) {
        return [];
      }
      return [{
        gitOwner: repo.gitOwner,
        gitRepoName: repo.gitRepoName,
      }];
    }),
    [repoConfigs.data?.repositories],
  );
  const organizationRows = organizations.data?.organizations ?? [];

  return {
    authStateLabel,
    billing,
    configuredRepos,
    displayName,
    email,
    githubConnected,
    githubNeedsAttention,
    githubStateLabel,
    linkedProviders: viewer.data?.linkedProviders ?? [],
    providerAvailability: viewer.data?.providerAvailability ?? [],
    organizations,
    organizationRows,
    passwordEnabled,
    passwordStateLabel,
    personalSecrets,
    organizationSecrets,
    repoConfigs,
    viewer,
  };
}
