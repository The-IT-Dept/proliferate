import type { MobileIconName } from "../components/primitives/MobileIcon";

export type RouteId = "home" | "work" | "automations" | "settings";

export interface MobileTabRoute {
  id: RouteId;
  label: string;
  icon: MobileIconName;
}

export interface MobileCloudChat {
  workspaceId: string;
  workspaceName: string;
  repoLabel: string;
  branchLabel: string;
  targetId: string | null;
  workspaceRuntimeId: string | null;
  sessionId: string | null;
  title: string;
  status: string;
  visibility: string;
  initialPendingPrompt?: MobilePendingPrompt | null;
  /**
   * A pending-interaction id carried by a `proliferate://workspaces/{id}?interaction={requestId}`
   * deep link (push notification tap). Group A only routes to the workspace;
   * a later group consumes this to scroll the chat transcript to the card and
   * focus it (IA §"Deep links & push").
   */
  initialInteractionRequestId?: string | null;
}

export interface MobilePendingPrompt {
  id: string;
  text: string;
  agentKind?: string | null;
  modelId: string | null;
  modeId: string | null;
  sessionConfigUpdates?: { configId: string; value: string }[];
  selectedRepo?: string | null;
  selectedRuntimeTargetId?: string | null;
  createdAt: number;
  dispatchedSessionId?: string | null;
  sendCommandId?: string | null;
  failedAt?: number | null;
  failureMessage?: string | null;
}

/**
 * The 4 glass tabs (IA §1 "Why four tabs"), in the tab-bar's left-to-right
 * order: Home / Workspaces / Automations / Settings.
 */
export const tabRoutes: MobileTabRoute[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "work", label: "Workspaces", icon: "workspaces" },
  { id: "automations", label: "Automations", icon: "calendar-clock" },
  { id: "settings", label: "Settings", icon: "settings" },
];

export const allWorkRoute: MobileTabRoute = { id: "work", label: "Workspaces", icon: "workspaces" };

export function routeTitle(route: RouteId): string {
  if (route === allWorkRoute.id) {
    return allWorkRoute.label;
  }
  return tabRoutes.find((item) => item.id === route)?.label ?? "Home";
}
