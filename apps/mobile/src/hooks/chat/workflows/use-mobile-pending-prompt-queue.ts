import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PendingPromptEntry } from "@anyharness/sdk";
import {
  useDeletePendingPromptMutation,
  useEditPendingPromptMutation,
  useReorderPendingPromptsMutation,
  useSteerPendingPromptMutation,
} from "@anyharness/sdk-react";
import type { PendingPromptQueueRow } from "@proliferate/product-domain/chats/pending-prompts/pending-prompt-queue";

import {
  applyOptimisticQueueOrder,
  buildMobilePendingPromptQueueRows,
  computeReorderRequest,
  reduceQueueMutation,
  runtimeReorderNeighbors,
  type PendingPromptQueueMutationAction,
  type PendingPromptQueueMutationState,
} from "../../../lib/domain/chat/mobile-chat-pending-prompt-queue";
import { useMobileToast } from "../../../providers/MobileToastProvider";

export interface MobilePendingPromptQueueState {
  rows: PendingPromptQueueRow[];
  steeringSeq: number | null;
  queueMutationInFlight: boolean;
  isEditing: boolean;
  editDraft: string;
  setEditDraftText: (value: string) => void;
  beginEdit: (row: PendingPromptQueueRow) => void;
  cancelEdit: () => void;
  commitEdit: () => Promise<void>;
  onDelete: (row: PendingPromptQueueRow) => void;
  onSteer: (row: PendingPromptQueueRow) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
}

interface SessionQueueMutation extends PendingPromptQueueMutationState {
  token: symbol;
}

/**
 * Group E2 — React wiring for the runtime pending-prompt queue: the real
 * `@anyharness/sdk-react` mutations (`useEditPendingPromptMutation`,
 * `useDeletePendingPromptMutation`, `useReorderPendingPromptsMutation`,
 * `useSteerPendingPromptMutation` — all real exports, matching the plan's
 * shorthand) plus the pure logic in `mobile-chat-pending-prompt-queue.ts`.
 * Mirrors `usePendingPromptQueue`/`useQueuedPromptEdit`
 * (product-client) minus the local-outbox path mobile doesn't have
 * (cloud-only — every entry reaching this hook is already a confirmed
 * runtime row).
 *
 * `entries` is expected to be `stream.transcript.pendingPrompts` straight
 * from E1's live stream — the shared source E3's later transcript
 * read-path collapse can also read from, per the plan's steer.
 *
 * Every mutation failure surfaces via `useMobileToast()` and leaves state
 * exactly as it was before the attempt (no optimistic value is left
 * dangling): reorder/steer roll back to the live order because
 * `optimisticOrder`/`steeringSeq` clear in the mutation's `finally`; edit
 * keeps the draft and editingSeq so the user can retry or cancel; delete
 * doesn't touch local state at all (the row simply stays until the retry
 * succeeds or the user gives up).
 */
export function useMobilePendingPromptQueue({
  sessionId,
  entries,
}: {
  sessionId: string | null;
  entries: readonly PendingPromptEntry[];
}): MobilePendingPromptQueueState {
  const editPendingPromptMutation = useEditPendingPromptMutation();
  const deletePendingPromptMutation = useDeletePendingPromptMutation();
  const reorderPendingPromptsMutation = useReorderPendingPromptsMutation();
  const steerPendingPromptMutation = useSteerPendingPromptMutation();
  const toast = useMobileToast();

  const [editingSeq, setEditingSeq] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const mutationsBySessionIdRef = useRef(new Map<string, SessionQueueMutation>());
  const [, setMutationRevision] = useState(0);
  const activeMutation = sessionId ? mutationsBySessionIdRef.current.get(sessionId) ?? null : null;

  const isEditingSeqLive = editingSeq != null && entries.some((entry) => entry.seq === editingSeq);

  // Intentional exception to "derive, don't watch-then-set": the trigger is
  // the queue draining/removing this row out from under the editor (SSE
  // arrival via E1's stream), not local state that could be computed
  // inline — mirrors `useQueuedPromptEdit`'s identical cleanup effect on
  // web. Without it a stale editingSeq would keep "Save edit" wired to a
  // row that no longer exists.
  useEffect(() => {
    if (editingSeq != null && !isEditingSeqLive) {
      setEditingSeq(null);
      setEditDraft("");
    }
  }, [editingSeq, isEditingSeqLive]);

  const rows = useMemo(() => {
    const derived = buildMobilePendingPromptQueueRows(entries, editingSeq);
    return applyOptimisticQueueOrder(derived, activeMutation?.optimisticOrder ?? null);
  }, [entries, editingSeq, activeMutation]);

  /**
   * Fix B (E2 Important, reviewer finding): this used to unconditionally
   * `map.set`, relying entirely on callers pre-checking
   * `mutationsBySessionIdRef.current.has(sessionId)` before calling in —
   * correct in practice, but nothing enforced it *here*, and the pure
   * single-in-flight-lock logic (`reduceQueueMutation`) that was meant to
   * back this lived untested as dead code (nothing called it). Routing
   * through it makes `startMutation` self-enforcing — a second
   * steer/reorder for a session with one already in flight is a no-op,
   * returning `null` instead of clobbering the in-flight token — and makes
   * `reduceQueueMutation`'s existing no-op-while-in-flight tests exercise
   * real production behavior instead of a function nothing calls.
   */
  const startMutation = useCallback(
    (sessionKey: string, action: PendingPromptQueueMutationAction): symbol | null => {
      const current = mutationsBySessionIdRef.current.get(sessionKey) ?? null;
      const next = reduceQueueMutation(current, action);
      if (next === current) {
        // Reducer's `state ?? {...}` no-op branch: a mutation is already in
        // flight for this session, so this start attempt is dropped.
        return null;
      }
      if (!next) {
        // Unreachable via the "*_started" actions this function is called
        // with (only `settleMutation` sends "settled"), but stay defensive
        // rather than assume the union can't grow.
        return null;
      }
      const token = Symbol(next.kind);
      mutationsBySessionIdRef.current.set(sessionKey, { ...next, token });
      setMutationRevision((revision) => revision + 1);
      return token;
    },
    [],
  );

  const settleMutation = useCallback((sessionKey: string, token: symbol) => {
    if (mutationsBySessionIdRef.current.get(sessionKey)?.token === token) {
      mutationsBySessionIdRef.current.delete(sessionKey);
      setMutationRevision((revision) => revision + 1);
    }
  }, []);

  const beginEdit = useCallback(
    (row: PendingPromptQueueRow) => {
      if (!row.canEdit) {
        return;
      }
      const live = entries.find((entry) => entry.seq === row.seq);
      if (!live) {
        return;
      }
      setEditDraft(live.text);
      setEditingSeq(live.seq);
    },
    [entries],
  );

  const cancelEdit = useCallback(() => {
    setEditDraft("");
    setEditingSeq(null);
  }, []);

  const commitEdit = useCallback(async () => {
    if (!sessionId || editingSeq == null) {
      return;
    }
    const trimmed = editDraft.trim();
    if (!trimmed) {
      cancelEdit();
      return;
    }
    try {
      await editPendingPromptMutation.mutateAsync({ sessionId, seq: editingSeq, text: trimmed });
    } catch (error) {
      // Keep the draft + editingSeq so the edit isn't lost — the user can
      // retry Save or explicitly Cancel.
      toast.show({
        tone: "error",
        message: `Could not update the queued message: ${errorMessage(error)}`,
      });
      return;
    }
    setEditDraft("");
    setEditingSeq(null);
  }, [sessionId, editingSeq, editDraft, editPendingPromptMutation, toast, cancelEdit]);

  const onDelete = useCallback(
    (row: PendingPromptQueueRow) => {
      if (!sessionId || !row.canDelete || row.seq <= 0) {
        return;
      }
      deletePendingPromptMutation.mutate(
        { sessionId, seq: row.seq },
        {
          onError: (error: unknown) => {
            toast.show({
              tone: "error",
              message: `Could not remove the queued message: ${errorMessage(error)}`,
            });
          },
        },
      );
    },
    [sessionId, deletePendingPromptMutation, toast],
  );

  const onSteer = useCallback(
    (row: PendingPromptQueueRow) => {
      if (!sessionId || row.seq <= 0) {
        return;
      }
      const targetSessionId = sessionId;
      // `startMutation` self-enforces the single-in-flight lock now — a
      // null token means one is already in flight for this session, so
      // there is nothing left to guard against here.
      const token = startMutation(targetSessionId, { type: "steer_started", seq: row.seq });
      if (!token) {
        return;
      }
      void steerPendingPromptMutation.mutateAsync({ sessionId: targetSessionId, seq: row.seq })
        .catch((error: unknown) => {
          toast.show({
            tone: "error",
            message: `Could not send the queued message next: ${errorMessage(error)}`,
          });
        })
        .finally(() => settleMutation(targetSessionId, token));
    },
    [sessionId, startMutation, settleMutation, steerPendingPromptMutation, toast],
  );

  const requestReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (!sessionId) {
        return;
      }
      const request = computeReorderRequest(rows, fromIndex, toIndex);
      if (!request) {
        return;
      }
      const targetSessionId = sessionId;
      const optimisticRows = [...rows];
      const [moved] = optimisticRows.splice(fromIndex, 1);
      if (moved) {
        optimisticRows.splice(toIndex, 0, moved);
      }
      // Same self-enforced lock as `onSteer` above — a null token means a
      // mutation is already in flight for this session.
      const token = startMutation(targetSessionId, {
        type: "reorder_started",
        order: optimisticRows.map((optimisticRow) => optimisticRow.key),
      });
      if (!token) {
        return;
      }
      void reorderPendingPromptsMutation.mutateAsync({
        sessionId: targetSessionId,
        expectedSeqs: request.expectedSeqs,
        desiredSeqs: request.desiredSeqs,
      })
        .catch((error: unknown) => {
          toast.show({
            tone: "error",
            message: `Could not reorder queued messages: ${errorMessage(error)}`,
          });
        })
        .finally(() => settleMutation(targetSessionId, token));
    },
    [sessionId, rows, startMutation, settleMutation, reorderPendingPromptsMutation, toast],
  );

  const onMoveUp = useCallback(
    (index: number) => {
      const { previousIndex } = runtimeReorderNeighbors(rows, index);
      if (previousIndex != null) {
        requestReorder(index, previousIndex);
      }
    },
    [rows, requestReorder],
  );

  const onMoveDown = useCallback(
    (index: number) => {
      const { nextIndex } = runtimeReorderNeighbors(rows, index);
      if (nextIndex != null) {
        requestReorder(index, nextIndex);
      }
    },
    [rows, requestReorder],
  );

  return {
    rows,
    steeringSeq: activeMutation?.kind === "steer" ? activeMutation.steeringSeq : null,
    queueMutationInFlight: activeMutation !== null,
    isEditing: editingSeq != null,
    editDraft,
    setEditDraftText: setEditDraft,
    beginEdit,
    cancelEdit,
    commitEdit,
    onDelete,
    onSteer,
    onMoveUp,
    onMoveDown,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
