import { describe, expect, it } from "vitest";

import {
  deriveOfflineSendDecision,
  OFFLINE_QUEUED_PROMPT_MESSAGE,
  shouldFlushQueuedOfflinePrompt,
} from "./mobile-chat-offline-send-gate";

describe("deriveOfflineSendDecision", () => {
  it("sends immediately while online", () => {
    expect(deriveOfflineSendDecision(true)).toEqual({ type: "send" });
  });

  it("queues instead of attempting the network call while offline", () => {
    expect(deriveOfflineSendDecision(false)).toEqual({
      type: "queue",
      message: OFFLINE_QUEUED_PROMPT_MESSAGE,
    });
  });
});

describe("shouldFlushQueuedOfflinePrompt", () => {
  it("flushes exactly on the offline -> online edge when a prompt is queued", () => {
    expect(
      shouldFlushQueuedOfflinePrompt({ wasOnline: false, isOnline: true, hasQueuedPrompt: true }),
    ).toBe(true);
  });

  it("does not flush if nothing is queued, even on the offline -> online edge", () => {
    expect(
      shouldFlushQueuedOfflinePrompt({ wasOnline: false, isOnline: true, hasQueuedPrompt: false }),
    ).toBe(false);
  });

  it("does not flush while already online (no edge)", () => {
    expect(
      shouldFlushQueuedOfflinePrompt({ wasOnline: true, isOnline: true, hasQueuedPrompt: true }),
    ).toBe(false);
  });

  it("does not flush while still offline (no edge)", () => {
    expect(
      shouldFlushQueuedOfflinePrompt({ wasOnline: false, isOnline: false, hasQueuedPrompt: true }),
    ).toBe(false);
  });

  it("does not flush on the online -> offline edge", () => {
    expect(
      shouldFlushQueuedOfflinePrompt({ wasOnline: true, isOnline: false, hasQueuedPrompt: true }),
    ).toBe(false);
  });
});
