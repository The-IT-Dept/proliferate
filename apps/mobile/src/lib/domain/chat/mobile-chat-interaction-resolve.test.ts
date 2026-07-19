import { describe, expect, it } from "vitest";

import {
  buildInteractionDismissedRequest,
  buildMcpElicitationAcceptedRequest,
  buildMcpElicitationCancelledRequest,
  buildMcpElicitationDeclinedRequest,
  buildPermissionDecisionRequest,
  buildPermissionSelectedRequest,
  buildUserInputCancelledRequest,
  buildUserInputSubmittedRequest,
} from "./mobile-chat-interaction-resolve";

/**
 * Group E3 — pure builders for every `ResolveInteractionRequest` variant
 * (`anyharness/sdk/src/types/sessions.ts`, generated from the
 * `ResolveInteractionRequest` OpenAPI union). One builder per outcome the
 * mobile interaction cards actually send, plus `dismissed` for full-union
 * coverage (see the module doc for why no card currently wires it).
 * Verified against the real generated union — not invented:
 *   | { outcome: "selected"; optionId: string }
 *   | { outcome: "decision"; decision: InteractionDecision }
 *   | { outcome: "submitted"; answers: UserInputSubmittedAnswer[] }
 *   | { outcome: "accepted"; fields: McpElicitationSubmittedField[] }
 *   | { outcome: "declined" }
 *   | { outcome: "cancelled" }
 *   | { outcome: "dismissed" }
 */
describe("buildPermissionSelectedRequest", () => {
  it("builds a selected outcome carrying the chosen harness option id", () => {
    expect(buildPermissionSelectedRequest("allow_once")).toEqual({
      outcome: "selected",
      optionId: "allow_once",
    });
  });
});

describe("buildPermissionDecisionRequest", () => {
  it("builds a decision outcome for the fallback allow path", () => {
    expect(buildPermissionDecisionRequest("allow")).toEqual({
      outcome: "decision",
      decision: "allow",
    });
  });

  it("builds a decision outcome for the fallback deny path", () => {
    expect(buildPermissionDecisionRequest("deny")).toEqual({
      outcome: "decision",
      decision: "deny",
    });
  });
});

describe("buildUserInputSubmittedRequest", () => {
  it("builds a submitted outcome carrying every question's answer", () => {
    const answers = [
      { questionId: "q1", selectedOptionLabel: "Baseline the migration", text: undefined },
      { questionId: "q2", selectedOptionLabel: undefined, text: "custom answer" },
    ];
    expect(buildUserInputSubmittedRequest(answers)).toEqual({
      outcome: "submitted",
      answers,
    });
  });

  it("builds a submitted outcome for an empty answer list (no questions)", () => {
    expect(buildUserInputSubmittedRequest([])).toEqual({
      outcome: "submitted",
      answers: [],
    });
  });
});

describe("buildUserInputCancelledRequest", () => {
  it("builds a bare cancelled outcome", () => {
    expect(buildUserInputCancelledRequest()).toEqual({ outcome: "cancelled" });
  });
});

describe("buildMcpElicitationAcceptedRequest", () => {
  it("builds an accepted outcome carrying the submitted fields", () => {
    const fields = [
      { fieldId: "confirm", value: { type: "boolean" as const, value: true } },
    ];
    expect(buildMcpElicitationAcceptedRequest(fields)).toEqual({
      outcome: "accepted",
      fields,
    });
  });

  it("builds an accepted outcome for a URL-mode elicitation (no fields)", () => {
    expect(buildMcpElicitationAcceptedRequest([])).toEqual({
      outcome: "accepted",
      fields: [],
    });
  });
});

describe("buildMcpElicitationDeclinedRequest", () => {
  it("builds a bare declined outcome", () => {
    expect(buildMcpElicitationDeclinedRequest()).toEqual({ outcome: "declined" });
  });
});

describe("buildMcpElicitationCancelledRequest", () => {
  it("builds a bare cancelled outcome", () => {
    expect(buildMcpElicitationCancelledRequest()).toEqual({ outcome: "cancelled" });
  });
});

describe("buildInteractionDismissedRequest", () => {
  it("builds a bare dismissed outcome — full-union coverage, no current caller", () => {
    expect(buildInteractionDismissedRequest()).toEqual({ outcome: "dismissed" });
  });
});
