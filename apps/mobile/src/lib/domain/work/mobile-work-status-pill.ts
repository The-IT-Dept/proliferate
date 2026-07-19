import type { RecentWorkStatusIndicatorView } from "@proliferate/product-domain/workspaces/cloud-work-inventory";

import {
  mobileColorKeyForWorkStatusTone,
  type MobileWorkStatusColorKey,
} from "./mobile-work-presentation";

export interface MobileWorkStatusPillView {
  label: string;
  colorKey: MobileWorkStatusColorKey;
  live: boolean;
  hollow: boolean;
}

/**
 * Shapes a workspace's SDK-sourced `statusIndicator` into the small colored
 * pill the list card renders (mockup B / IA §2.2 "status pill"). The label
 * is passed through verbatim — never rewritten here — so the pill always
 * says exactly what `@proliferate/product-domain`'s cloud-work-status
 * computed from workspace/session state; only the color key is derived
 * (reusing the existing tone -> color mapping already used for the card's
 * status dot).
 */
export function mobileWorkspaceStatusPill(
  statusIndicator: RecentWorkStatusIndicatorView,
): MobileWorkStatusPillView {
  return {
    label: statusIndicator.label,
    colorKey: mobileColorKeyForWorkStatusTone(statusIndicator.tone),
    live: statusIndicator.live,
    hollow: statusIndicator.hollow,
  };
}
