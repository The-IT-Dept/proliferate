import { describe, expect, it } from "vitest";
import {
  INITIAL_PUBLISH_RUN_STATE,
  publishRunReducer,
} from "./mobile-publish-run-state";
import type { PublishWorkflowStep } from "./mobile-publish-workflow-model";

// The mobile-only execution-progress state machine requested by scope
// ("idle → committing → pushing → creating-PR → done/error") — web has no
// equivalent (its `useWorkspacePublishWorkflow` only tracks a single
// `isSubmitting` boolean across all steps via TanStack Query's pending
// flags). A pure reducer over discrete events so the sequence is testable
// without mocking async mutations.
describe("publishRunReducer", () => {
  it("starts idle with no error", () => {
    expect(INITIAL_PUBLISH_RUN_STATE).toEqual({ phase: "idle", error: null });
  });

  it("maps a stage step to the committing phase", () => {
    const step: PublishWorkflowStep = { kind: "stage", paths: ["a.ts"] };
    expect(publishRunReducer(INITIAL_PUBLISH_RUN_STATE, { type: "step_started", step }))
      .toEqual({ phase: "committing", error: null });
  });

  it("maps a commit step to the committing phase", () => {
    const step: PublishWorkflowStep = { kind: "commit", summary: "x" };
    expect(publishRunReducer(INITIAL_PUBLISH_RUN_STATE, { type: "step_started", step }))
      .toEqual({ phase: "committing", error: null });
  });

  it("maps a push step to the pushing phase", () => {
    const step: PublishWorkflowStep = { kind: "push" };
    expect(publishRunReducer(INITIAL_PUBLISH_RUN_STATE, { type: "step_started", step }))
      .toEqual({ phase: "pushing", error: null });
  });

  it("maps a create_pull_request step to the creatingPr phase", () => {
    const step: PublishWorkflowStep = {
      kind: "create_pull_request",
      request: { title: "x", baseBranch: "main", draft: false },
    };
    expect(publishRunReducer(INITIAL_PUBLISH_RUN_STATE, { type: "step_started", step }))
      .toEqual({ phase: "creatingPr", error: null });
  });

  it("moves to done on completion, clearing any prior error", () => {
    const errored = { phase: "error" as const, error: "boom" };
    expect(publishRunReducer(errored, { type: "completed" }))
      .toEqual({ phase: "done", error: null });
  });

  it("moves to error with the failure message on failure", () => {
    const pushing = { phase: "pushing" as const, error: null };
    expect(publishRunReducer(pushing, { type: "failed", message: "Network error." }))
      .toEqual({ phase: "error", error: "Network error." });
  });

  it("resets back to the initial idle state", () => {
    const done = { phase: "done" as const, error: null };
    expect(publishRunReducer(done, { type: "reset" })).toEqual(INITIAL_PUBLISH_RUN_STATE);
  });
});
