import { describe, expect, it } from "vitest";

import { mobileToastQueueReducer, type MobileToastItem } from "./mobile-toast-queue";

function toast(overrides: Partial<MobileToastItem> = {}): MobileToastItem {
  return { id: "toast-1", message: "Something happened", tone: "info", ...overrides };
}

describe("mobileToastQueueReducer", () => {
  it("enqueues onto an empty queue", () => {
    const next = mobileToastQueueReducer([], { type: "enqueue", toast: toast() });
    expect(next).toEqual([toast()]);
  });

  it("appends behind an already-showing toast (FIFO) rather than replacing it", () => {
    const first = toast({ id: "a" });
    const second = toast({ id: "b" });
    const afterFirst = mobileToastQueueReducer([], { type: "enqueue", toast: first });
    const afterSecond = mobileToastQueueReducer(afterFirst, { type: "enqueue", toast: second });
    expect(afterSecond.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("dismisses the head, advancing the next queued toast to the front", () => {
    const first = toast({ id: "a" });
    const second = toast({ id: "b" });
    const state = [first, second];
    const next = mobileToastQueueReducer(state, { type: "dismiss", id: "a" });
    expect(next.map((item) => item.id)).toEqual(["b"]);
  });

  it("dismisses a queued (non-head) toast by id without disturbing the head", () => {
    const first = toast({ id: "a" });
    const second = toast({ id: "b" });
    const third = toast({ id: "c" });
    const state = [first, second, third];
    const next = mobileToastQueueReducer(state, { type: "dismiss", id: "b" });
    expect(next.map((item) => item.id)).toEqual(["a", "c"]);
  });

  it("is a no-op when dismissing an id that isn't in the queue", () => {
    const state = [toast({ id: "a" })];
    const next = mobileToastQueueReducer(state, { type: "dismiss", id: "does-not-exist" });
    expect(next).toEqual(state);
  });

  it("dismissing the only toast empties the queue", () => {
    const next = mobileToastQueueReducer([toast({ id: "a" })], { type: "dismiss", id: "a" });
    expect(next).toEqual([]);
  });

  it("dismiss on an empty queue stays empty", () => {
    expect(mobileToastQueueReducer([], { type: "dismiss", id: "a" })).toEqual([]);
  });

  it("preserves each toast's tone and message through enqueue", () => {
    const errorToast = toast({ id: "err", message: "Failed to delete workspace", tone: "error" });
    const next = mobileToastQueueReducer([], { type: "enqueue", toast: errorToast });
    expect(next[0]).toEqual(errorToast);
  });
});
