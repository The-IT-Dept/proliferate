import { describe, expect, it } from "vitest";

import { resolveMobileShellStage } from "./mobile-shell-stage";

describe("resolveMobileShellStage", () => {
  it("shows the bootstrapping splash while the session is resolving", () => {
    expect(
      resolveMobileShellStage({
        authState: "bootstrapping",
        onboardingStatus: "checking",
        hasSelectedChat: false,
      }),
    ).toBe("bootstrapping");
  });

  it("shows the sign-in screen when signed out", () => {
    expect(
      resolveMobileShellStage({
        authState: "signed_out",
        onboardingStatus: "checking",
        hasSelectedChat: false,
      }),
    ).toBe("signed_out");
  });

  it("shows the connect-GitHub screen when GitHub linking is required", () => {
    expect(
      resolveMobileShellStage({
        authState: "needs_github",
        onboardingStatus: "checking",
        hasSelectedChat: false,
      }),
    ).toBe("needs_github");
  });

  it("shows onboarding once active but before onboarding completes", () => {
    expect(
      resolveMobileShellStage({
        authState: "active",
        onboardingStatus: "needed",
        hasSelectedChat: false,
      }),
    ).toBe("onboarding");
  });

  it("shows the 4-tab glass shell once active, onboarded, and no chat is open", () => {
    expect(
      resolveMobileShellStage({
        authState: "active",
        onboardingStatus: "done",
        hasSelectedChat: false,
      }),
    ).toBe("tabs");
  });

  it("shows the pushed workspace chat shell (hiding the tab bar) once a chat is selected", () => {
    expect(
      resolveMobileShellStage({
        authState: "active",
        onboardingStatus: "done",
        hasSelectedChat: true,
      }),
    ).toBe("chat");
  });

  it("still onboards even while the onboarding check is in flight, treating 'checking' as not done", () => {
    expect(
      resolveMobileShellStage({
        authState: "active",
        onboardingStatus: "checking",
        hasSelectedChat: true,
      }),
    ).toBe("onboarding");
  });

  it("prioritizes auth stages over a stale selected chat", () => {
    expect(
      resolveMobileShellStage({
        authState: "needs_github",
        onboardingStatus: "done",
        hasSelectedChat: true,
      }),
    ).toBe("needs_github");
  });
});
