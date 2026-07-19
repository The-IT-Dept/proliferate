import type { MobileIconName } from "../../../components/primitives/MobileIcon";

/**
 * Group D — the workspace shell's glass segmented control model (IA §2.3,
 * mockups C-F). Four segments swap the shell body; the control itself is glass
 * chrome, the bodies are opaque. Order matches the mockup: Sessions · Chat ·
 * Term · Diff. Kept as a small, DOM-free model (no reducer — switching is a
 * plain `useState`) so the segment set, ordering, and default are unit-tested.
 */
export type WorkspaceSegmentId = "sessions" | "chat" | "term" | "diff";

export interface WorkspaceSegment {
  id: WorkspaceSegmentId;
  label: string;
  icon: MobileIconName;
}

export const WORKSPACE_SEGMENTS: readonly WorkspaceSegment[] = [
  { id: "sessions", label: "Sessions", icon: "sessions" },
  { id: "chat", label: "Chat", icon: "sparkles" },
  { id: "term", label: "Term", icon: "terminal" },
  { id: "diff", label: "Diff", icon: "git-branch" },
];

const SEGMENT_IDS = new Set<string>(WORKSPACE_SEGMENTS.map((segment) => segment.id));

export function isWorkspaceSegmentId(value: unknown): value is WorkspaceSegmentId {
  return typeof value === "string" && SEGMENT_IDS.has(value);
}

/**
 * The segment a freshly-opened shell lands on. Chat in both cases: opening a
 * workspace (with or without a targeted session) should land where the work
 * is — the transcript — preserving the existing open-workspace → chat loop.
 * Sessions is always one tap away in the control.
 */
export function defaultWorkspaceSegment(_sessionId: string | null): WorkspaceSegmentId {
  return "chat";
}
