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

export type MobileModelAvailabilityState =
  | "loading"
  | "load_error"
  | "no_launchable_model"
  | "launchable";

/**
 * Mirrors web's `resolveHomeModelAvailabilityState` (product-client
 * `home-next-launch.ts`) verbatim — the state machine that decides whether
 * the agent/model catalog is launchable, still loading, failed to load, or
 * loaded with nothing launchable. A launchable model always wins even while
 * a refetch is in flight; otherwise loading takes priority over a stale
 * error so a background refetch doesn't flash the error copy.
 */
export function resolveMobileModelAvailabilityState(input: {
  isLoading: boolean;
  hasLoadError: boolean;
  hasLaunchableModel: boolean;
}): MobileModelAvailabilityState {
  if (input.hasLaunchableModel) {
    return "launchable";
  }
  if (input.isLoading) {
    return "loading";
  }
  if (input.hasLoadError) {
    return "load_error";
  }
  return "no_launchable_model";
}

export interface MobileModelAvailabilityNotice {
  text: string;
  actionLabel: "Agents" | null;
}

/**
 * Maps a `MobileModelAvailabilityState` to the web-verbatim notice copy
 * (product-client `HomeNextScreen.tsx`'s `modelAvailabilityNotice`) — the
 * exact strings, copied verbatim, never invented locally:
 *   - `no_launchable_model` → "Finish agent setup to start a chat." + an
 *     "Agents" navigation affordance.
 *   - `load_error` → "Models are unavailable right now. Try again in a
 *     moment.", no affordance.
 *   - `loading` / `launchable` → no notice.
 */
export function resolveMobileModelAvailabilityNotice(
  state: MobileModelAvailabilityState,
): MobileModelAvailabilityNotice | null {
  if (state === "no_launchable_model") {
    return { text: "Finish agent setup to start a chat.", actionLabel: "Agents" };
  }
  if (state === "load_error") {
    return { text: "Models are unavailable right now. Try again in a moment.", actionLabel: null };
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
   * The agent/model catalog's availability state
   * (`resolveMobileModelAvailabilityState`). Gates `canSubmit` exactly like
   * web's composer (`modelAvailabilityState === "launchable"`) — `loading`
   * blocks submit just as much as `no_launchable_model` or `load_error`
   * does. Deliberately never surfaced through `disabledReason`: matching the
   * web composer, where this drives `modelAvailabilityNotice`, a persistent
   * banner wholly separate from `submitDisabledReason`. Callers show the
   * mapped notice (`resolveMobileModelAvailabilityNotice`) unconditionally
   * alongside this derivation's output, not gated on draft text.
   */
  modelAvailabilityState: MobileModelAvailabilityState;
  /** A create-cloud-workspace mutation is already in flight. */
  submitting: boolean;
}

export interface MobileHomeLaunchEnablement {
  canSubmit: boolean;
  /**
   * The repo/branch/readiness reason submit is disabled, for display next to
   * the composer — null whenever the draft itself is empty (an empty draft
   * needs no explanation, matching the web composer's `submitDisabledReason`),
   * when submit is actually enabled, or when the only blocker is model
   * availability (see `modelAvailabilityState` — shown separately via
   * `resolveMobileModelAvailabilityNotice`).
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
      && input.modelAvailabilityState === "launchable"
      && !input.submitting,
    disabledReason: hasDraft ? targetOrReadinessReason : null,
  };
}
