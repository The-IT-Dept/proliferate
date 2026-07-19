import type { SessionExecutionSummary, SessionStatus } from "@anyharness/sdk";
import { isSessionSlotBusy } from "@proliferate/product-domain/sessions/activity";

/**
 * Group E2 — composer send/interrupt/edit enablement, pure and
 * platform-free. Mirrors two pieces of the web composer:
 *
 * - `deriveComposerAction` mirrors `ChatComposerActions.tsx`'s branching
 *   (product-client): while a queued-prompt edit is active, "Save edit"
 *   always owns the primary button regardless of run state; otherwise a
 *   running session with a non-empty draft still *sends* (the runtime
 *   queues it — same action, different label/telemetry), and a running
 *   session with an empty draft offers Stop instead of a disabled Send.
 *   Labels are verbatim `CHAT_COMPOSER_LABELS`/queue-title strings from
 *   `apps/packages/product-client/src/copy/chat/chat-copy.ts` and
 *   `ChatComposerActions.tsx` (mobile has no keyboard-shortcut suffix to
 *   append, unlike web's `Send message (Enter)`).
 * - `isMobileSessionRunning`/`mapStreamConnectionStateForActivity` derive
 *   "is the agent busy" (drives `isRunning` above) by reusing
 *   `isSessionSlotBusy` from `@proliferate/product-domain/sessions/activity`
 *   unchanged — the same pure function that backs the web's
 *   `useActiveSessionRunningState`. Mobile builds the snapshot it expects
 *   from data E1 already exposes (`session.status`,
 *   `session.executionSummary`, `stream.transcript.isStreaming`,
 *   `stream.transcript.pendingInteractions`, `stream.connectionState`)
 *   instead of the web's session-directory-store shape.
 */

export type ComposerActionMode = "send" | "queue" | "stop" | "save";

export interface ComposerActionState {
  mode: ComposerActionMode;
  enabled: boolean;
  label: string;
}

export function deriveComposerAction(input: {
  isRunning: boolean;
  isEmpty: boolean;
  isDisabled: boolean;
  isEditingQueuedPrompt: boolean;
}): ComposerActionState {
  const { isRunning, isEmpty, isDisabled, isEditingQueuedPrompt } = input;

  if (isRunning && !isEditingQueuedPrompt) {
    const canQueue = !isEmpty && !isDisabled;
    if (canQueue) {
      return { mode: "queue", enabled: true, label: "Send message to queue" };
    }
    // Cancel is never gated by send-disablement — you can always stop a
    // running turn, matching `ChatComposerActions`'s unconditional Stop.
    return { mode: "stop", enabled: true, label: "Stop run" };
  }

  const canSubmit = !isEmpty && !isDisabled;
  if (isEditingQueuedPrompt) {
    return { mode: "save", enabled: canSubmit, label: "Save edit" };
  }
  return { mode: "send", enabled: canSubmit, label: "Send message" };
}

/**
 * Verbatim mockup/web copy (`CHAT_COMPOSER_LABELS.placeholder` /
 * `.followUpPlaceholder`, `chat-copy.ts`), gated on whether the session has
 * any transcript turns yet (`stream.transcript.turnOrder.length > 0` at the
 * call site) — matches `ChatInputDraftArea.tsx`'s `hasSessionTurns` switch.
 */
export function deriveComposerPlaceholder(input: { hasSessionTurns: boolean }): string {
  return input.hasSessionTurns
    ? "Ask for a follow-up"
    : "Describe a task, @mention files, run /commands";
}

/**
 * Mobile's live-stream connection states
 * (`SessionTranscriptStreamConnectionState`, E1's
 * `session-transcript-stream-controller.ts`) don't share a name with
 * product-domain's `StreamConnectionState` — this module stays
 * hooks-layer-free (domain code doesn't import from `hooks/`), so the
 * input type here is a structural duplicate of the stream controller's
 * union rather than an import.
 */
export type MobileStreamConnectionState =
  | "idle"
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed"
  | "error";

export function mapStreamConnectionStateForActivity(
  state: MobileStreamConnectionState,
): "disconnected" | "connecting" | "open" | "ended" {
  switch (state) {
    case "open":
      return "open";
    case "connecting":
    case "reconnecting":
      return "connecting";
    case "closed":
      return "ended";
    case "idle":
    case "error":
    default:
      return "disconnected";
  }
}

export interface MobilePendingInteractionLike {
  requestId?: string;
  linkedPlanId?: string | null;
  source?: { linkedPlanId?: string | null } | null;
}

export function isMobileSessionRunning(input: {
  status: SessionStatus | null | undefined;
  executionSummary?: SessionExecutionSummary | null;
  isStreaming: boolean;
  pendingInteractions: readonly MobilePendingInteractionLike[];
  connectionState: MobileStreamConnectionState;
}): boolean {
  return isSessionSlotBusy({
    status: input.status ?? null,
    executionSummary: input.executionSummary ?? null,
    streamConnectionState: mapStreamConnectionStateForActivity(input.connectionState),
    transcript: {
      isStreaming: input.isStreaming,
      pendingInteractions: [...input.pendingInteractions],
    },
  });
}
