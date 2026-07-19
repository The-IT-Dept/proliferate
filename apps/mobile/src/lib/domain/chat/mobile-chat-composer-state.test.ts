import { describe, expect, it } from "vitest";

import {
  deriveComposerAction,
  deriveComposerPlaceholder,
  isMobileSessionRunning,
  mapStreamConnectionStateForActivity,
} from "./mobile-chat-composer-state";

describe("deriveComposerAction", () => {
  it("sends when idle with text and nothing blocking it", () => {
    expect(deriveComposerAction({
      isRunning: false,
      isEmpty: false,
      isDisabled: false,
      isEditingQueuedPrompt: false,
    })).toEqual({ mode: "send", enabled: true, label: "Send message" });
  });

  it("disables send when idle and empty", () => {
    expect(deriveComposerAction({
      isRunning: false,
      isEmpty: true,
      isDisabled: false,
      isEditingQueuedPrompt: false,
    })).toEqual({ mode: "send", enabled: false, label: "Send message" });
  });

  it("disables send when idle and something else blocks it", () => {
    expect(deriveComposerAction({
      isRunning: false,
      isEmpty: false,
      isDisabled: true,
      isEditingQueuedPrompt: false,
    })).toEqual({ mode: "send", enabled: false, label: "Send message" });
  });

  it("queues (still a send action) when running with text and nothing blocking it", () => {
    expect(deriveComposerAction({
      isRunning: true,
      isEmpty: false,
      isDisabled: false,
      isEditingQueuedPrompt: false,
    })).toEqual({ mode: "queue", enabled: true, label: "Send message to queue" });
  });

  it("offers stop (not a disabled send) when running and the draft is empty", () => {
    expect(deriveComposerAction({
      isRunning: true,
      isEmpty: true,
      isDisabled: false,
      isEditingQueuedPrompt: false,
    })).toEqual({ mode: "stop", enabled: true, label: "Stop run" });
  });

  it("still offers stop when running, empty, and otherwise disabled — cancel is never blocked by send gating", () => {
    expect(deriveComposerAction({
      isRunning: true,
      isEmpty: true,
      isDisabled: true,
      isEditingQueuedPrompt: false,
    })).toEqual({ mode: "stop", enabled: true, label: "Stop run" });
  });

  it("falls back to stop when running, non-empty, but blocked by disabled state", () => {
    expect(deriveComposerAction({
      isRunning: true,
      isEmpty: false,
      isDisabled: true,
      isEditingQueuedPrompt: false,
    })).toEqual({ mode: "stop", enabled: true, label: "Stop run" });
  });

  it("takes over as save-edit regardless of running state", () => {
    expect(deriveComposerAction({
      isRunning: true,
      isEmpty: false,
      isDisabled: false,
      isEditingQueuedPrompt: true,
    })).toEqual({ mode: "save", enabled: true, label: "Save edit" });

    expect(deriveComposerAction({
      isRunning: false,
      isEmpty: false,
      isDisabled: false,
      isEditingQueuedPrompt: true,
    })).toEqual({ mode: "save", enabled: true, label: "Save edit" });
  });

  it("disables save-edit when the edit draft is empty", () => {
    expect(deriveComposerAction({
      isRunning: false,
      isEmpty: true,
      isDisabled: false,
      isEditingQueuedPrompt: true,
    })).toEqual({ mode: "save", enabled: false, label: "Save edit" });
  });
});

describe("deriveComposerPlaceholder", () => {
  it("uses the mockup/web default placeholder before the session has any turns", () => {
    expect(deriveComposerPlaceholder({ hasSessionTurns: false }))
      .toBe("Describe a task, @mention files, run /commands");
  });

  it("switches to the follow-up placeholder once the session has turns", () => {
    expect(deriveComposerPlaceholder({ hasSessionTurns: true }))
      .toBe("Ask for a follow-up");
  });
});

describe("mapStreamConnectionStateForActivity", () => {
  it("maps open to open", () => {
    expect(mapStreamConnectionStateForActivity("open")).toBe("open");
  });

  it("maps connecting and reconnecting to connecting", () => {
    expect(mapStreamConnectionStateForActivity("connecting")).toBe("connecting");
    expect(mapStreamConnectionStateForActivity("reconnecting")).toBe("connecting");
  });

  it("maps closed to ended", () => {
    expect(mapStreamConnectionStateForActivity("closed")).toBe("ended");
  });

  it("maps error and idle to disconnected", () => {
    expect(mapStreamConnectionStateForActivity("error")).toBe("disconnected");
    expect(mapStreamConnectionStateForActivity("idle")).toBe("disconnected");
  });
});

describe("isMobileSessionRunning", () => {
  const base = {
    status: "idle" as const,
    executionSummary: null,
    isStreaming: false,
    pendingInteractions: [],
    connectionState: "open" as const,
  };

  it("is not running for an idle session with nothing pending", () => {
    expect(isMobileSessionRunning(base)).toBe(false);
  });

  it("is running while the execution summary reports the running phase", () => {
    expect(isMobileSessionRunning({
      ...base,
      executionSummary: { phase: "running" } as never,
    })).toBe(true);
  });

  it("is running while an interaction is awaiting a response", () => {
    expect(isMobileSessionRunning({
      ...base,
      executionSummary: { phase: "awaiting_interaction" } as never,
      pendingInteractions: [{ requestId: "req-1" }],
    })).toBe(true);
  });

  it("is not running once the session has errored", () => {
    expect(isMobileSessionRunning({
      ...base,
      status: "errored" as never,
    })).toBe(false);
  });

  it("is running while the transcript is actively streaming, even without an execution summary", () => {
    expect(isMobileSessionRunning({
      ...base,
      isStreaming: true,
    })).toBe(true);
  });

  it("ignores a stale isStreaming flag once the stream has fully closed on an idle session", () => {
    expect(isMobileSessionRunning({
      ...base,
      isStreaming: true,
      connectionState: "closed",
    })).toBe(false);
  });
});
