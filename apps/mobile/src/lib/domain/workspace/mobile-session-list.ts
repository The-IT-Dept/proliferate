import type { InteractionKind, Session } from "@anyharness/sdk";
import type {
  SessionActivitySnapshot,
  SidebarSessionActivityState,
} from "@proliferate/product-domain/sessions/activity-types";
import { resolveSessionSidebarActivityState } from "@proliferate/product-domain/sessions/activity";

/**
 * Group D — the pure session-list logic behind the workspace shell's Sessions
 * segment (mockups C/D, IA §2.3). Kept DOM-free (vitest node env) and built on
 * the shared session-activity resolver so the status vocabulary matches the web
 * client exactly rather than being reinvented here.
 *
 * Status labels are VERBATIM from the web:
 * - "Waiting for input" / "Waiting for plan approval" / "Iterating" / "Error"
 *   come from `sidebar-indicators.ts`'s tooltips (product-client), keyed off the
 *   same `SidebarSessionActivityState` this module resolves.
 * - "Closed" mirrors the `SessionStatus` "closed" state (mockup E "Closed · …").
 * - "Hidden" is the web `ChatTabsMenu` label for a dismissed (`!isVisible`) row.
 * - "Idle" title-cases the `SessionStatus` "idle" (commandable) state.
 */

/** The six status tones from design-system.md §2.3 (single source of truth). */
export type MobileSessionTone =
  | "live"
  | "ready"
  | "attention"
  | "busy"
  | "stopped"
  | "failed";

export interface MobileSessionStatusLabel {
  label: string;
  tone: MobileSessionTone;
}

export type MobileSessionGroupId = "active" | "earlier";

/**
 * Adapt an `@anyharness/sdk` `Session` (from `sessions.list`) into the
 * `SessionActivitySnapshot` the shared resolver consumes. The list has no live
 * transcript stream, so `isStreaming` is false and pending interactions are
 * read from the session's `executionSummary` (which is exactly what
 * `pendingInteractionsForActivity` prefers when present).
 */
export function sessionActivitySnapshotFromSession(session: Session): SessionActivitySnapshot {
  return {
    status: session.status,
    executionSummary: session.executionSummary ?? null,
    streamConnectionState: "disconnected",
    hasPromptActivity: Boolean(session.lastPromptAt),
    transcript: {
      isStreaming: false,
      pendingInteractions: [],
    },
  };
}

const ACTIVITY_LABEL: Record<SidebarSessionActivityState, MobileSessionStatusLabel> = {
  iterating: { label: "Iterating", tone: "live" },
  waiting_input: { label: "Waiting for input", tone: "attention" },
  waiting_plan: { label: "Waiting for plan approval", tone: "attention" },
  error: { label: "Error", tone: "failed" },
  closed: { label: "Closed", tone: "stopped" },
  idle: { label: "Idle", tone: "ready" },
};

export function mobileSessionStatusLabel(session: Session): MobileSessionStatusLabel {
  if (isSessionHidden(session)) {
    return { label: "Hidden", tone: "stopped" };
  }
  const activity = resolveSessionSidebarActivityState(sessionActivitySnapshotFromSession(session));
  return ACTIVITY_LABEL[activity];
}

const INTERACTION_KIND_LABEL: Record<InteractionKind, string> = {
  permission: "Permission request",
  user_input: "Question",
  mcp_elicitation: "MCP elicitation",
};

export function pendingInteractionKindLabel(kind: InteractionKind): string {
  return INTERACTION_KIND_LABEL[kind];
}

/**
 * The secondary detail for an attention row — the first pending interaction's
 * kind label ("Permission request" etc., mockup E "Waiting for input ·
 * Permission request"), or null when nothing is pending.
 */
export function mobileSessionAttentionDetail(session: Session): string | null {
  const pending = session.executionSummary?.pendingInteractions ?? [];
  const first = pending[0];
  return first ? pendingInteractionKindLabel(first.kind) : null;
}

export function isSessionHidden(session: Session): boolean {
  return Boolean(session.dismissedAt);
}

export function isSessionClosed(session: Session): boolean {
  return session.status === "closed"
    || session.status === "completed"
    || Boolean(session.closedAt);
}

export function mobileSessionGroup(session: Session): MobileSessionGroupId {
  return isSessionHidden(session) || isSessionClosed(session) ? "earlier" : "active";
}

function sessionRecencyMs(session: Session): number {
  return Date.parse(session.lastPromptAt ?? session.updatedAt ?? session.createdAt ?? "") || 0;
}

export function compareMobileSessions(left: Session, right: Session): number {
  return sessionRecencyMs(right) - sessionRecencyMs(left);
}

export interface GroupedWorkspaceSessions {
  active: Session[];
  earlier: Session[];
}

export function groupWorkspaceSessions(sessions: readonly Session[]): GroupedWorkspaceSessions {
  const active: Session[] = [];
  const earlier: Session[] = [];
  for (const session of sessions) {
    (mobileSessionGroup(session) === "earlier" ? earlier : active).push(session);
  }
  active.sort(compareMobileSessions);
  earlier.sort(compareMobileSessions);
  return { active, earlier };
}

/**
 * Chat-segment attention badge (IA §2.3, "per-segment attention badges"):
 * how many sessions need the user — waiting for input/plan, or errored.
 */
export function chatSegmentAttentionCount(sessions: readonly Session[]): number {
  return sessions.reduce((count, session) => {
    if (isSessionHidden(session)) {
      return count;
    }
    const activity = resolveSessionSidebarActivityState(sessionActivitySnapshotFromSession(session));
    const needsAttention =
      activity === "waiting_input" || activity === "waiting_plan" || activity === "error";
    return needsAttention ? count + 1 : count;
  }, 0);
}
