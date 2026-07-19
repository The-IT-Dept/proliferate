import { useMemo } from "react";
import type { CloudWorkspaceSummary } from "@proliferate/cloud-sdk";
import { useVisibleCloudWorkspaces } from "@proliferate/cloud-sdk-react";
import {
  buildCloudWorkRecencyInventory,
  type CloudWorkFilters,
  type CloudWorkItemView,
} from "@proliferate/product-domain/workspaces/cloud-work-inventory";

import { deriveMobileWorkAttentionCount } from "../../../lib/domain/work/mobile-work-attention";
import {
  groupByMobileWorkRecency,
  type MobileWorkRecencyBucketId,
} from "../../../lib/domain/work/mobile-work-recency";
import type { MobileCloudChat } from "../../../lib/domain/workspace/mobile-workspace-chat";

export interface MobileWorkItem {
  view: CloudWorkItemView;
  workspace: CloudWorkspaceSummary;
  chat: MobileCloudChat;
}

export interface MobileWorkGroupView {
  id: MobileWorkRecencyBucketId;
  label: string;
}

export interface MobileWorkGroup {
  view: MobileWorkGroupView;
  items: MobileWorkItem[];
}

export interface MobileWorkInventory {
  groups: MobileWorkGroup[];
  items: MobileWorkItem[];
  recentItems: MobileWorkItem[];
  /** Count of workspaces needing attention (blocked, unclaimed-shared, or
   * waiting on input) — see mobile-work-attention.ts. The pending-interaction
   * count the Workspaces tab badge is meant to show (IA); computed here so
   * whichever surface renders that badge doesn't re-derive it. */
  attentionCount: number;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useMobileWorkInventory(filters?: CloudWorkFilters): MobileWorkInventory {
  const visibleWorkspaces = useVisibleCloudWorkspaces();
  const data = visibleWorkspaces.data;

  const inventory = useMemo(() => {
    const workspaceById = new Map(data.map((workspace) => [workspace.id, workspace]));
    // buildCloudWorkRecencyInventory dedupes, filters, sorts, and shapes each
    // workspace into a CloudWorkItemView; its own recency buckets
    // (today/this_week/last_week/earlier) don't match the web workspaces-list
    // this screen is parity-mapped to, so only the flattened, already-sorted
    // item list is kept from it — grouping is redone by
    // groupByMobileWorkRecency (mobile-work-recency.ts), whose buckets do
    // match.
    const items = buildCloudWorkRecencyInventory(data, { filters })
      .flatMap((group) => group.items)
      .flatMap((view) => {
        const workspace = workspaceById.get(view.id);
        if (!workspace) {
          return [];
        }
        return [{
          view,
          workspace,
          chat: mobileCloudChatForWorkspace(workspace, view),
        }];
      });
    const groups = groupByMobileWorkRecency(items, (item) => item.view.lastActivityMs).map(
      (group) => ({ view: { id: group.id, label: group.label }, items: group.items }),
    );
    const recentItems = [...items]
      .sort((left, right) => right.view.lastActivityMs - left.view.lastActivityMs)
      .slice(0, 5);
    const attentionCount = deriveMobileWorkAttentionCount(items.map((item) => item.view));
    return { groups, items, recentItems, attentionCount };
  }, [data, filters]);

  return {
    ...inventory,
    error: visibleWorkspaces.error instanceof Error ? visibleWorkspaces.error : null,
    isFetching: visibleWorkspaces.isFetching,
    isLoading: visibleWorkspaces.isLoading,
    refetch: visibleWorkspaces.refetch,
  };
}

export function mobileCloudChatForWorkspace(
  workspace: CloudWorkspaceSummary,
  item?: CloudWorkItemView,
): MobileCloudChat {
  const session = workspace.lastSessionSummary;
  return {
    workspaceId: workspace.id,
    workspaceName: workspace.displayName ?? session?.title ?? workspace.repo?.name ?? "Workspace",
    repoLabel: workspace.repo ? `${workspace.repo.owner}/${workspace.repo.name}` : "",
    branchLabel: workspace.repo?.branch ?? workspace.repo?.baseBranch ?? "main",
    targetId: session?.targetId ?? workspace.targetId ?? null,
    workspaceRuntimeId: session?.workspaceId ?? cloudWorkspaceRuntimeId(workspace),
    sessionId: item?.defaultSessionId ?? session?.sessionId ?? null,
    title: session?.title ?? item?.title ?? workspace.displayName ?? workspace.repo?.name ?? "Workspace",
    status: session?.status ?? workspace.workspaceStatus ?? workspace.status,
    visibility: workspace.visibility,
  };
}

function cloudWorkspaceRuntimeId(workspace: CloudWorkspaceSummary): string | null {
  const detail = workspace as CloudWorkspaceSummary & { anyharnessWorkspaceId?: string | null };
  return detail.anyharnessWorkspaceId ?? null;
}
