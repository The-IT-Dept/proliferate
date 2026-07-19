import type { GitStatusSnapshot } from "@anyharness/sdk";
import type { PublishPullRequestDraft } from "./mobile-publish-workflow-model";

/**
 * Row 29 — ported VERBATIM from web's `publish-draft.ts`
 * (`product-client/src/lib/domain/workspaces/creation/publish-draft.ts`):
 * same base-branch fallback chain (`suggestedBaseBranch` -> `repoDefaultBranch`
 * -> "main"). Mobile has no PR-authoring form (see `mobile-publish-view.ts`'s
 * module doc for why), so only `baseBranch`/`body`/`draft` from this draft
 * are actually used — `title` is always overwritten by
 * `deriveMobilePullRequestTitle` — but the function itself stays a genuine
 * verbatim port rather than trimmed, for the same parity reasons as
 * `mobile-publish-workflow-model.ts`.
 */
export function defaultPublishPullRequestDraft(input: {
  gitStatus: GitStatusSnapshot | null | undefined;
  repoDefaultBranch: string | null;
}): PublishPullRequestDraft {
  const baseBranch = input.gitStatus?.suggestedBaseBranch?.trim()
    || input.repoDefaultBranch?.trim()
    || "main";
  return {
    title: "",
    body: "",
    baseBranch,
    draft: false,
  };
}
