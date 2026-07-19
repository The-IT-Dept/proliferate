import type { AutomationInventoryStatusKind } from "@proliferate/product-domain/automations/inventory";
import type { ProductChat } from "@proliferate/product-domain/chats/model";

/**
 * Maps an automation run's product-domain `statusKind` (waiting / working /
 * review / blocked / done — from `buildAutomationRunInventoryItems`, the
 * same derivation web uses) onto `MobileStatusDot`'s tone vocabulary
 * (running / idle / paused / failed / done), so the run-history list reuses
 * the same dot primitive as workspace/session rows instead of a bespoke
 * automations-only glyph.
 */
export function mobileAutomationStatusDotTone(
  kind: AutomationInventoryStatusKind,
): ProductChat["status"] {
  switch (kind) {
    case "working":
      return "running";
    case "blocked":
      return "failed";
    case "done":
      return "done";
    case "waiting":
    case "review":
    default:
      return "idle";
  }
}
