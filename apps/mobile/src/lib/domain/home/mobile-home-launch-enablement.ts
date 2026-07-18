/**
 * Home composer launch-enablement — mirrors the web home composer's
 * `targetDisabledReason` / `canSubmit` derivation (product-client
 * `use-home-next-state.ts` + `use-home-next-composer-state.ts`), narrowed to
 * mobile's cloud-only launch target: "repo selected + base branch resolved
 * → can create" (mobile parity plan, Group B).
 *
 * Kept as plain data in / data out so it's testable without React or any
 * SDK types — the caller (`useMobileHomeLaunchModel` /
 * `MobileHomeScreen`) adapts live query state into this shape.
 */

export interface MobileHomeTargetReadinessInput {
  /** A repository is selected in the repo pill/picker. */
  hasSelectedRepo: boolean;
  /** `useCloudRepoBranches(...).isLoading` for the selected repo. */
  branchesLoading: boolean;
  /** `useCloudRepoBranches(...).isError` for the selected repo. */
  branchesError: boolean;
  /** `launchModel.branchOptions.length`. */
  branchOptionsCount: number;
  /** `resolveMobileSelectedBaseBranch(...)` — null until resolved. */
  selectedBaseBranch: string | null;
}

/**
 * The repo/branch "target" half of launch-enablement — verbatim copy matches
 * the web composer's `targetDisabledReason` (product-client
 * `use-home-next-state.ts`) for the cloud repository path.
 */
export function resolveMobileHomeTargetDisabledReason(
  input: MobileHomeTargetReadinessInput,
): string | null {
  if (!input.hasSelectedRepo) {
    return "Choose a repository";
  }
  if (input.branchesLoading) {
    return "Loading branches";
  }
  if (input.branchesError) {
    return "Couldn't load branches";
  }
  if (input.branchOptionsCount === 0) {
    return "No branches found";
  }
  if (!input.selectedBaseBranch) {
    return "Choose a base branch";
  }
  return null;
}

export interface MobileHomeLaunchEnablementInput extends MobileHomeTargetReadinessInput {
  /** The composer's current draft text. */
  draft: string;
  /**
   * Resolved cloud-repo readiness blocker description (managed-Cloud /
   * GitHub App prerequisites — `useMobileCloudRepoReadiness`), or null when
   * ready. Checked once the repo/branch target itself is resolved.
   */
  readinessBlockedReason: string | null;
  /**
   * Resolved harness-availability message (`resolveCloudHarnessAvailability`),
   * or null when at least one agent kind is launchable. Gates `canSubmit`
   * like everything else here, but — matching the web composer, where this
   * is `modelAvailabilityNotice`, a persistent banner wholly separate from
   * `submitDisabledReason` — it is deliberately never surfaced through
   * `disabledReason`. Callers show it unconditionally alongside this
   * derivation's output, not gated on draft text.
   */
  harnessUnavailableReason: string | null;
  /** A create-cloud-workspace mutation is already in flight. */
  submitting: boolean;
}

export interface MobileHomeLaunchEnablement {
  canSubmit: boolean;
  /**
   * The repo/branch/readiness reason submit is disabled, for display next to
   * the composer — null whenever the draft itself is empty (an empty draft
   * needs no explanation, matching the web composer's `submitDisabledReason`),
   * when submit is actually enabled, or when the only blocker is harness
   * availability (see `harnessUnavailableReason` — shown separately).
   */
  disabledReason: string | null;
}

/**
 * Combines the repo/branch target, the readiness gate, and harness
 * availability into the composer's `canSubmit` — the mobile parity plan's
 * "repo selected + base branch resolved → can create", extended with the two
 * gates the existing mobile screen already enforces elsewhere.
 */
export function deriveMobileHomeLaunchEnablement(
  input: MobileHomeLaunchEnablementInput,
): MobileHomeLaunchEnablement {
  const hasDraft = input.draft.trim().length > 0;
  const targetOrReadinessReason = resolveMobileHomeTargetDisabledReason(input)
    ?? input.readinessBlockedReason;

  return {
    canSubmit: hasDraft
      && targetOrReadinessReason === null
      && input.harnessUnavailableReason === null
      && !input.submitting,
    disabledReason: hasDraft ? targetOrReadinessReason : null,
  };
}
