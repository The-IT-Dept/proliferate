import type { MobileAuthState } from "../../../providers/MobileAuthProvider";
import type { MobileOnboardingStatus } from "../../../hooks/shell/lifecycle/use-mobile-onboarding-status";

/**
 * The top-level surface MobileShell renders. Mirrors the auth-flow → tabs
 * ordering in the IA (`AUTH FLOW (pre-tab): Sign in → Connect GitHub →
 * Onboarding`), plus the "chat" stage — a workspace shell pushed full-screen
 * over the 4-tab glass shell, hiding the tab bar (IA §1 "Workspace Shell —
 * pushed full-screen from any tab (hides tab bar)").
 */
export type MobileShellStage =
  | "bootstrapping"
  | "signed_out"
  | "needs_github"
  | "onboarding"
  | "tabs"
  | "chat";

export interface MobileShellStageInput {
  authState: MobileAuthState;
  onboardingStatus: MobileOnboardingStatus;
  hasSelectedChat: boolean;
}

/**
 * Pure derivation of MobileShell's top-level render branch. Auth stages
 * always take priority — a stale `hasSelectedChat` (e.g. from a deep link
 * that arrived before sign-in resolved) never skips ahead of sign-in /
 * GitHub linking / onboarding.
 */
export function resolveMobileShellStage(input: MobileShellStageInput): MobileShellStage {
  if (input.authState === "bootstrapping") {
    return "bootstrapping";
  }
  if (input.authState === "signed_out") {
    return "signed_out";
  }
  if (input.authState === "needs_github") {
    return "needs_github";
  }
  if (input.onboardingStatus === "checking") {
    // The onboarding flag read from AsyncStorage hasn't resolved yet. Hold
    // the splash rather than assuming "needs onboarding" — otherwise an
    // already-onboarded user sees a visible onboarding flash on every cold
    // start, before the read resolves to "done".
    return "bootstrapping";
  }
  if (input.onboardingStatus !== "done") {
    return "onboarding";
  }
  return input.hasSelectedChat ? "chat" : "tabs";
}
