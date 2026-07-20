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

  it("is a pure state predicate, not an edge check, across an offline -> online -> offline flap", () => {
    // offline, queued: parked, no flush yet.
    expect(shouldFlushQueuedOfflinePrompt({ isOnline: false, hasQueuedPrompt: true })).toBe(false);
    // reconnect while still queued: flush.
    expect(shouldFlushQueuedOfflinePrompt({ isOnline: true, hasQueuedPrompt: true })).toBe(true);
    // the flush cleared the queue synchronously — evaluated again in the same
    // online state, it must not re-fire.
    expect(shouldFlushQueuedOfflinePrompt({ isOnline: true, hasQueuedPrompt: false })).toBe(false);
    // dropping offline again with nothing queued stays quiet.
    expect(shouldFlushQueuedOfflinePrompt({ isOnline: false, hasQueuedPrompt: false })).toBe(false);
  });
});
