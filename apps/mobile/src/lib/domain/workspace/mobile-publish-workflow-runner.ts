import type {
  CommitRequest,
  CommitResponse,
  CreatePullRequestRequest,
  CreatePullRequestResponse,
  PushResponse,
} from "@anyharness/sdk";
import type { PublishRunEvent } from "./mobile-publish-run-state";
import type { PublishWorkflowStep } from "./mobile-publish-workflow-model";

/**
 * Row 29 — the ordered step executor, ported in shape from web's
 * `run-workspace-publish-workflow.ts`
 * (`product-client/src/lib/workflows/workspaces/run-workspace-publish-workflow.ts`):
 * same step-kind switch, same "skip an empty stage" guard, same
 * fire-and-collect-the-created-PR shape. Errors are NOT caught here (same as
 * web) — they propagate to the caller (`use-mobile-publish-workflow.ts`),
 * which is what decides the try/catch boundary, toasts, and dispatches the
 * `failed` run-state event.
 *
 * The one addition over web: a `dispatch` callback fired with a
 * `step_started` event before each step runs, driving
 * `mobile-publish-run-state.ts`'s idle → committing → pushing → creatingPr
 * progress (web has no per-step UI state to drive — see that reducer's
 * module doc).
 */
export interface MobilePublishWorkflowRunner {
  stagePaths: (paths: string[]) => Promise<unknown>;
  commit: (input: CommitRequest) => Promise<CommitResponse>;
  push: () => Promise<PushResponse>;
  createPullRequest: (input: CreatePullRequestRequest) => Promise<CreatePullRequestResponse>;
}

export async function runMobilePublishWorkflow(
  steps: PublishWorkflowStep[],
  runner: MobilePublishWorkflowRunner,
  dispatch: (event: PublishRunEvent) => void,
): Promise<CreatePullRequestResponse["pullRequest"] | null> {
  let createdPullRequest: CreatePullRequestResponse["pullRequest"] | null = null;
  for (const step of steps) {
    dispatch({ type: "step_started", step });
    switch (step.kind) {
      case "stage":
        if (step.paths.length > 0) {
          await runner.stagePaths(step.paths);
        }
        break;
      case "commit":
        await runner.commit({ summary: step.summary });
        break;
      case "push":
        await runner.push();
        break;
      case "create_pull_request": {
        const response = await runner.createPullRequest(step.request);
        createdPullRequest = response.pullRequest;
        break;
      }
    }
  }
  return createdPullRequest;
}
