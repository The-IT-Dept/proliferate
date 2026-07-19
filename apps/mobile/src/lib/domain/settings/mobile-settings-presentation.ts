import type {
  AuthLinkedProvider,
  AuthProviderAvailability,
  CloudSecretsResponse,
} from "@proliferate/cloud-sdk";
import { mobileCloudSettingsSections } from "@proliferate/product-domain/settings/cloud-settings";

export interface MobileSettingsAccountSummary {
  initials: string;
  name: string;
  handle: string;
}

export interface MobileBillingPlanSummary {
  plan: string;
  isPaidCloud: boolean;
  proBillingEnabled: boolean;
  hasUnlimitedCloudHours?: boolean | null;
  remainingManagedCloudHours?: number | null;
  remainingSandboxHours?: number | null;
  startBlocked?: boolean | null;
  paymentHealthy?: boolean | null;
}

export function mobileSectionLabels(): Record<
  "account" | "personalSecrets" | "environments" | "organization" | "organizationSecrets" | "billing",
  string
> {
  const labels = new Map(
    mobileCloudSettingsSections().map((section) => [section.id, section.label]),
  );
  return {
    account: labels.get("account") ?? "Account",
    personalSecrets: labels.get("personal-secrets") ?? "Personal secrets",
    environments: labels.get("environments") ?? "Environments",
    organization: labels.get("organization") ?? "Organization",
    organizationSecrets: labels.get("organization-secrets") ?? "Organization secrets",
    billing: labels.get("billing") ?? "Billing",
  };
}

export function billingPlanTitle(
  plan: MobileBillingPlanSummary | null | undefined,
  loading: boolean,
  failed: boolean,
): string {
  if (failed) {
    return "Plan";
  }
  if (loading && !plan) {
    return "Plan";
  }
  if (!plan) {
    return "Plan";
  }
  return planLabel(plan.plan);
}

export function billingUsageLine(
  plan: MobileBillingPlanSummary | null | undefined,
  loading: boolean,
  failed: boolean,
): string {
  if (failed) {
    return "Could not load billing";
  }
  if (loading && !plan) {
    return "Loading";
  }
  if (!plan) {
    return "Unavailable";
  }
  const hours = (
    plan.proBillingEnabled && plan.isPaidCloud
      ? plan.remainingManagedCloudHours
      : plan.remainingSandboxHours
  ) ?? null;
  if (hours === null || hours === undefined) {
    return "Unlimited runtime";
  }
  return `${Math.max(0, Math.round(hours * 10) / 10)}h remaining`;
}

export function billingHealthValue(
  plan: MobileBillingPlanSummary | null | undefined,
): string | undefined {
  if (!plan) {
    return undefined;
  }
  if (plan.startBlocked) {
    return "Blocked";
  }
  if (!plan.paymentHealthy) {
    return "Attention";
  }
  return undefined;
}

export function billingHealthTone(
  plan: MobileBillingPlanSummary | null | undefined,
): "muted" | "success" | "warning" {
  if (!plan) {
    return "muted";
  }
  if (plan.startBlocked) {
    return "warning";
  }
  if (!plan.paymentHealthy) {
    return "warning";
  }
  return "muted";
}

export function initialsForMobileSettingsName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return initials || "P";
}

/**
 * View-only Google-link status for the Settings > Account section — reuses
 * `useAuthViewer()`'s already-fetched `linkedProviders`/`providerAvailability`
 * (no extra network call). Mirrors web's `buildAccountProviderViews`
 * (apps/packages/product-client/src/lib/domain/auth/account-profile-presentation.ts)
 * verbatim for the Google case; unlike web, mobile doesn't render an
 * "Add Google" action, so only the label side is ported.
 */
export function mobileGoogleAccountLabel(
  linkedProviders: readonly AuthLinkedProvider[],
  providerAvailability: readonly AuthProviderAvailability[],
): string {
  const account = linkedProviders.find(
    (provider) => provider.provider === "google" && provider.connected,
  );
  if (account) {
    return account.accountEmail ?? account.accountId ?? "Connected";
  }
  const availability = providerAvailability.find((provider) => provider.provider === "google");
  return availability?.enabled === false ? "Not configured in this environment" : "Not connected";
}

/**
 * View-only summary for a Settings secrets row (Personal or Organization) —
 * counts only, no names/values (this is a view surface, not the secrets
 * editor). Scope-agnostic: `CloudSecretsResponse`'s shape (envVars/files
 * counts) is identical for `{kind:"personal"}` and
 * `{kind:"organization",...}` (see `useCloudSecrets` in
 * `@proliferate/cloud-sdk-react`), so both the Personal secrets and
 * Organization secrets rows share this one formatter.
 */
export function mobileCloudSecretsSummary(
  secrets: CloudSecretsResponse | null | undefined,
  loading: boolean,
  failed: boolean,
): string {
  if (failed) {
    return "Could not load secrets";
  }
  if (loading && !secrets) {
    return "Loading";
  }
  if (!secrets) {
    return "Unavailable";
  }
  const parts: string[] = [];
  if (secrets.envVars.length > 0) {
    parts.push(`${secrets.envVars.length} ${secrets.envVars.length === 1 ? "env var" : "env vars"}`);
  }
  if (secrets.files.length > 0) {
    parts.push(`${secrets.files.length} ${secrets.files.length === 1 ? "file" : "files"}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "No secrets configured";
}

function planLabel(plan: string): string {
  const trimmed = plan?.trim();
  if (!trimmed) {
    return "Plan";
  }
  return trimmed
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
