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
  it("does not flush while offline with something queued", () => {
    expect(shouldFlushQueuedOfflinePrompt({ isOnline: false, hasQueuedPrompt: true })).toBe(false);
  });

  it("flushes while online with something queued", () => {
    expect(shouldFlushQueuedOfflinePrompt({ isOnline: true, hasQueuedPrompt: true })).toBe(true);
  });

  it("does not flush while online with nothing queued", () => {
    expect(shouldFlushQueuedOfflinePrompt({ isOnline: true, hasQueuedPrompt: false })).toBe(false);
  });

  it("does not flush while offline with nothing queued", () => {
    expect(shouldFlushQueuedOfflinePrompt({ isOnline: false, hasQueuedPrompt: false })).toBe(false);
  });
});
