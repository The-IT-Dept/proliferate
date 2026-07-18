/**
 * Relocated from `src/navigation/navigation-model.ts` (deleted with the
 * custom nav model it also held - `RouteId`, `tabRoutes`, `routeTitle`,
 * `allWorkRoute` - now superseded by Expo Router file routes and the native
 * tab bar's own labels). These two types are domain data shapes describing
 * a chat/workspace and a pending prompt, not navigation state, so they
 * outlive that deletion unchanged.
 */
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
   * deep link (push notification tap). Routes to the workspace; a later
   * group consumes this to scroll the chat transcript to the card and focus
   * it (IA §"Deep links & push").
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
