export type MobileToastTone = "info" | "success" | "error";

export interface MobileToastItem {
  id: string;
  message: string;
  tone: MobileToastTone;
}

export type MobileToastQueueAction =
  | { type: "enqueue"; toast: MobileToastItem }
  | { type: "dismiss"; id: string };

/**
 * Pure FIFO queue reducer backing `MobileToastProvider`. Only one toast is
 * ever shown at a time (callers render `queue[0]`) — `enqueue` appends
 * behind whatever is already showing so a second `show()` while one is
 * active doesn't clobber it, and `dismiss` removes by id so dismissing a
 * toast that's no longer at the head (already dismissed, or still queued
 * behind another) is a no-op rather than an error. Kept dependency-free so
 * it's unit-testable without rendering the provider.
 */
export function mobileToastQueueReducer(
  state: readonly MobileToastItem[],
  action: MobileToastQueueAction,
): MobileToastItem[] {
  switch (action.type) {
    case "enqueue":
      return [...state, action.toast];
    case "dismiss":
      return state.filter((toast) => toast.id !== action.id);
    default:
      return state as MobileToastItem[];
  }
}
