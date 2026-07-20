/**
 * Cloud workspace start/status surface — mobile parity plan Row 11 ("cloud
 * status screen") + Row 42 ("cloud start-block reasons"). Both are the same
 * underlying question — why/whether a cloud workspace can start, and how far
 * along it is — so they share one pure model here, mirroring web's
 * `cloud-workspace-status.ts` + `cloud-workspace-status-presentation.ts`
 * (product-client), verbatim copy included.
 *
 * Mobile has no `product-client` dependency (desktop/web only — see
 * `mobile-home-launch-enablement.ts`'s header comment for the same note), so
 * this is a from-scratch port narrowed to what the workspace shell actually
 * needs to show: "Preparing cloud workspace" while pending/materializing,
 * "Provisioning failed" with a Retry affordance, "Workspace archived", and
 * the seven billing/quota/hold reasons a workspace can't start.
 *
 * Not ported: web's post-ready "applying tracked files" sub-state
 * (`postReadyPhase`/`postReadyFilesApplied`/`postReadyFilesTotal`). Verified
 * against `cloud/sdk/src/generated/openapi.ts`'s `WorkspaceSummary` schema —
 * on this server branch `postReadyPhase` is a wire-serialized *constant*
 * (`"idle"`, typed as the literal `"idle"`, not the `"applying_files" |
 * "starting_setup" | "idle"` union web's `isCloudWorkspacePostReadyPending`
 * checks against). That substate can never occur over this wire contract, so
 * there is nothing to drive real UI from — adding it would be unverifiable
 * against the real data source, which the task explicitly rules out.
 */

const PENDING_STATUSES = new Set(["pending", "materializing", "needs_rematerialization"]);

const START_BLOCK_REASONS = [
  "concurrency_limit",
  "credits_exhausted",
  "overage_disabled",
  "cap_exhausted",
  "payment_failed",
  "admin_hold",
  "external_billing_hold",
] as const;

/** Verbatim from the server's `constants/billing.py` `WORKSPACE_ACTION_BLOCK_KIND_*`
 * constants and web's `cloud-workspace-status.ts` `CloudStartBlockReason` — the
 * complete set of reasons a cloud workspace/session can't start. */
export type CloudStartBlockReason = (typeof START_BLOCK_REASONS)[number];

const START_BLOCK_REASON_SET: ReadonlySet<string> = new Set(START_BLOCK_REASONS);

export function isCloudStartBlockReason(
  reason: string | null | undefined,
): reason is CloudStartBlockReason {
  return typeof reason === "string" && START_BLOCK_REASON_SET.has(reason);
}

/** Verbatim from web's `titleForStartBlockReason`
 * (`cloud-workspace-status-presentation.ts`). */
export function titleForStartBlockReason(
  reason: CloudStartBlockReason | string | null | undefined,
): string {
  if (isCloudStartBlockReason(reason) && reason === "concurrency_limit") {
    return "Sandbox limit reached";
  }
  return "Cloud usage is paused";
}

const CONCURRENCY_BLOCK_DESCRIPTION =
  "Archive or delete another cloud workspace before starting this one.";
const CREDITS_EXHAUSTED_DESCRIPTION =
  "Cloud usage is paused because your included sandbox hours are exhausted.";
const OVERAGE_DISABLED_DESCRIPTION =
  "Cloud usage is paused because managed cloud overage is disabled.";
const CAP_EXHAUSTED_DESCRIPTION =
  "Cloud usage is paused because the managed cloud overage cap is exhausted.";
const PAYMENT_HOLD_DESCRIPTION = "Cloud usage is paused because billing needs attention.";
const ADMIN_HOLD_DESCRIPTION = "Cloud usage is paused for this account.";
const GENERIC_BLOCKED_DESCRIPTION = "Cloud usage is unavailable for this workspace right now.";

/** Verbatim from web's `descriptionForStartBlockReason`
 * (`cloud-workspace-status-presentation.ts`). */
export function descriptionForStartBlockReason(
  reason: CloudStartBlockReason | string | null | undefined,
): string {
  const blockReason = isCloudStartBlockReason(reason) ? reason : null;
  switch (blockReason) {
    case "concurrency_limit":
      return CONCURRENCY_BLOCK_DESCRIPTION;
    case "credits_exhausted":
      return CREDITS_EXHAUSTED_DESCRIPTION;
    case "overage_disabled":
      return OVERAGE_DISABLED_DESCRIPTION;
    case "cap_exhausted":
      return CAP_EXHAUSTED_DESCRIPTION;
    case "payment_failed":
    case "external_billing_hold":
      return PAYMENT_HOLD_DESCRIPTION;
    case "admin_hold":
      return ADMIN_HOLD_DESCRIPTION;
    default:
      return GENERIC_BLOCKED_DESCRIPTION;
  }
}

/** The subset of `CloudWorkspaceDetail` this module reads. Kept as a
 * structural interface (not imported from `@proliferate/cloud-sdk`) so the
 * pure logic stays trivially testable with plain fixtures — real workspace
 * objects satisfy this shape structurally. */
export interface MobileCloudWorkspaceStatusInput {
  status?: string | null;
  workspaceStatus?: string | null;
  actionBlockKind?: string | null;
  actionBlockReason?: string | null;
  lastError?: string | null;
  statusDetail?: string | null;
  runtime?: { generation?: number | null } | null;
}

export function resolveMobileCloudWorkspaceStatus(
  workspace: MobileCloudWorkspaceStatusInput | null | undefined,
): string | null {
  return workspace?.status ?? workspace?.workspaceStatus ?? null;
}

export function isCloudWorkspacePending(status: string | null | undefined): boolean {
  return PENDING_STATUSES.has(status ?? "");
}

/** Mirrors web's `shouldShowCloudWorkspaceStatusScreen` (minus the
 * post-ready substate — see module doc). */
export function shouldShowMobileCloudWorkspaceStatusScreen(
  workspace: MobileCloudWorkspaceStatusInput | null | undefined,
): boolean {
  if (!workspace) {
    return false;
  }
  const status = resolveMobileCloudWorkspaceStatus(workspace);
  return (
    workspace.actionBlockKind != null
    || isCloudWorkspacePending(status)
    || status === "error"
    || status === "archived"
  );
}

export type MobileCloudWorkspaceStatusMode = "pending" | "error" | "archived" | "blocked";

export interface MobileCloudWorkspaceStatusView {
  mode: MobileCloudWorkspaceStatusMode;
  title: string;
  description: string;
  /** Auxiliary explanatory copy (auto-refresh notice, first-runtime notice,
   * or the same blocked/archived description again) — null when the mode
   * carries a retry action instead (error). */
  footerMessage: string | null;
  /** Non-null only for `mode === "error"` — matches web's
   * `useCloudWorkspaceStatusScreenActions`, where pending/blocked/archived
   * never get a primary action. */
  retry: { label: string; helperText: string } | null;
}

const GENERIC_PREPARING_DESCRIPTION = "Preparing the cloud workspace.";
const GENERIC_FAILURE_DESCRIPTION =
  "Provisioning hit an error before the workspace became ready.";
const GENERIC_ARCHIVED_DESCRIPTION = "This cloud workspace has been archived.";
const AUTO_REFRESH_MESSAGE =
  "This view refreshes automatically and will switch into the workspace once the runtime is ready.";
const FIRST_RUNTIME_FOOTER_MESSAGE =
  "First cloud workspace for this repo can take longer while we start the shared runtime. Later workspaces usually reuse it.";
const RETRY_HELPER_TEXT = "The workspace record is kept and we will retry setup from there.";
const PREPARING_TITLE = "Preparing cloud workspace";

const PROVISIONING_STEP_DESCRIPTIONS: Record<string, string> = {
  pending: "Waiting to prepare the cloud workspace.",
  materializing: "Preparing the repo runtime and materializing the cloud worktree.",
  needs_rematerialization: "Preparing the repo runtime and materializing the cloud worktree.",
};

function isFirstRuntimeSetupPending(workspace: MobileCloudWorkspaceStatusInput): boolean {
  return (
    isCloudWorkspacePending(resolveMobileCloudWorkspaceStatus(workspace))
    && workspace.runtime?.generation === 0
  );
}

/** Mirrors web's `buildCloudWorkspaceStatusScreenModel`, trimmed to the
 * states mobile shows. Returns `null` once the workspace is ready and
 * unblocked — the caller renders its normal chat/session content then. */
export function buildMobileCloudWorkspaceStatusView(
  workspace: MobileCloudWorkspaceStatusInput | null | undefined,
): MobileCloudWorkspaceStatusView | null {
  if (!workspace || !shouldShowMobileCloudWorkspaceStatusScreen(workspace)) {
    return null;
  }

  // The block reason wins even over a pending/error status — a workspace can
  // be blocked before it ever starts provisioning (matches web).
  if (workspace.actionBlockKind) {
    const description =
      workspace.actionBlockReason || descriptionForStartBlockReason(workspace.actionBlockKind);
    return {
      mode: "blocked",
      title: titleForStartBlockReason(workspace.actionBlockKind),
      description,
      footerMessage: description,
      retry: null,
    };
  }

  const status = resolveMobileCloudWorkspaceStatus(workspace) ?? "error";

  if (status === "error") {
    return {
      mode: "error",
      title: "Provisioning failed",
      description: workspace.lastError || workspace.statusDetail || GENERIC_FAILURE_DESCRIPTION,
      footerMessage: null,
      retry: {
        label: "Retry provisioning",
        helperText: RETRY_HELPER_TEXT,
      },
    };
  }

  if (status === "archived") {
    return {
      mode: "archived",
      title: "Workspace archived",
      description: workspace.statusDetail || GENERIC_ARCHIVED_DESCRIPTION,
      footerMessage: GENERIC_ARCHIVED_DESCRIPTION,
      retry: null,
    };
  }

  return {
    mode: "pending",
    title: PREPARING_TITLE,
    description:
      workspace.statusDetail || PROVISIONING_STEP_DESCRIPTIONS[status] || GENERIC_PREPARING_DESCRIPTION,
    footerMessage: isFirstRuntimeSetupPending(workspace)
      ? FIRST_RUNTIME_FOOTER_MESSAGE
      : AUTO_REFRESH_MESSAGE,
    retry: null,
  };
}
