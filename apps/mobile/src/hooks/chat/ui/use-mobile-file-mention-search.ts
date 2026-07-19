import { useEffect, useState } from "react";
import { useSearchWorkspaceFilesQuery } from "@anyharness/sdk-react";

export interface MobileFileMentionSearchResult {
  path: string;
  name: string;
}

const EMPTY_RESULTS: MobileFileMentionSearchResult[] = [];

interface UseMobileFileMentionSearchArgs {
  /** Whether the @mention picker is currently open (a mention trigger is
   * active in the draft). Mirrors product-client's `open` gate. */
  open: boolean;
  workspaceId: string | null;
  /** Same gate `MobileChatScreen` already computes for the composer itself
   * (`workspaceCommandReady`) — the AnyHarness workspace runtime has to be
   * up before `client.files.search` can resolve anything. */
  runtimeReady: boolean;
  query: string;
  limit?: number;
}

/**
 * Row 23's @mention file search. This is a thin mobile port of
 * product-client's still-live `useWorkspaceFileSearch`
 * (`hooks/workspaces/ui/files/use-workspace-file-search.ts`, which backs the
 * Cmd+K command palette's file results today) — same real SDK hook
 * underneath (`useSearchWorkspaceFilesQuery` from `@anyharness/sdk-react`,
 * `anyharness/sdk-react/src/hooks/files.ts`, which itself calls
 * `client.files.search(anyharnessWorkspaceId, query, limit)`), same 120ms
 * debounce. `useSearchWorkspaceFilesQuery` is a REAL, already-exported
 * sdk-react hook — this is a debounce/gating wrapper around it, not a
 * hand-rolled `useQuery` (there was no need to wrap the raw client method:
 * the sdk-react hook already exists and is exactly what product-client's own
 * wrapper uses).
 */
export function useMobileFileMentionSearch({
  open,
  workspaceId,
  runtimeReady,
  query,
  limit = 20,
}: UseMobileFileMentionSearchArgs) {
  const trimmedQuery = query.trim();
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    if (!open || trimmedQuery.length === 0 || !runtimeReady) {
      setDebouncedQuery("");
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      setDebouncedQuery(trimmedQuery);
    }, 120);

    return () => clearTimeout(timeoutId);
  }, [open, runtimeReady, trimmedQuery]);

  const searchEnabled =
    open
    && runtimeReady
    && workspaceId !== null
    && debouncedQuery.length > 0;

  const queryResult = useSearchWorkspaceFilesQuery({
    workspaceId,
    query: debouncedQuery,
    limit,
    enabled: searchEnabled,
  });

  const results: MobileFileMentionSearchResult[] = searchEnabled
    ? queryResult.data?.results ?? EMPTY_RESULTS
    : EMPTY_RESULTS;

  return {
    query: trimmedQuery,
    debouncedQuery,
    searchEnabled,
    isLoading: searchEnabled && queryResult.isLoading,
    isError: searchEnabled && queryResult.isError,
    results,
  };
}
