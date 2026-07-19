import type { PublishWorkflowStep } from "./mobile-publish-workflow-model";

/**
 * Row 29 — the mobile publish sheet's execution-progress state machine
 * (scope: "idle → committing → pushing → creating-PR → done/error"). Pure
 * reducer over discrete events so `mobile-publish-workflow-runner.ts`'s
 * orchestration (dispatching `step_started` per `PublishWorkflowStep`) and
 * the calling hook's success/failure boundary (`completed`/`failed`) are
 * both independently testable without mocking async SDK mutations.
 */

export type PublishRunPhase = "idle" | "committing" | "pushing" | "creatingPr" | "done" | "error";

export interface PublishRunState {
  phase: PublishRunPhase;
  error: string | null;
}

export const INITIAL_PUBLISH_RUN_STATE: PublishRunState = { phase: "idle", error: null };

export type PublishRunEvent =
  | { type: "step_started"; step: PublishWorkflowStep }
  | { type: "completed" }
  | { type: "failed"; message: string }
  | { type: "reset" };

export function publishRunReducer(state: PublishRunState, event: PublishRunEvent): PublishRunState {
  switch (event.type) {
    case "step_started":
      return { phase: phaseForStep(event.step), error: null };
    case "completed":
      return { phase: "done", error: null };
    case "failed":
      return { phase: "error", error: event.message };
    case "reset":
      return INITIAL_PUBLISH_RUN_STATE;
  }
}

function phaseForStep(step: PublishWorkflowStep): PublishRunPhase {
  switch (step.kind) {
    case "stage":
    case "commit":
      return "committing";
    case "push":
      return "pushing";
    case "create_pull_request":
      return "creatingPr";
  }
}
