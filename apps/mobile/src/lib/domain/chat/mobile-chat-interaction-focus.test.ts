import { describe, expect, it } from "vitest";

import { focusedInteractionRowIndex } from "./mobile-chat-interaction-focus";
import type { TranscriptRowViewModel } from "./mobile-live-transcript-view";

const userMessageRow: TranscriptRowViewModel = {
  id: "item-1",
  turnId: "turn-1",
  kind: "user_message",
  text: "Fix the failing test",
  isStreaming: false,
};

const assistantRow: TranscriptRowViewModel = {
  id: "item-2",
  turnId: "turn-1",
  kind: "assistant_prose",
  text: "Sure, let me look.",
  isStreaming: false,
};

const permissionRow: TranscriptRowViewModel = {
  id: "pending-interaction:req-42",
  turnId: null,
  kind: "permission_interaction",
  requestId: "req-42",
  title: "Run `rm -rf build`?",
  options: [],
};

const userInputRow: TranscriptRowViewModel = {
  id: "pending-interaction:req-7",
  turnId: null,
  kind: "user_input_interaction",
  requestId: "req-7",
  title: "Which package manager?",
  questions: [],
};

const rows: TranscriptRowViewModel[] = [userMessageRow, assistantRow, permissionRow];

describe("focusedInteractionRowIndex", () => {
  it("returns null when requestId is null", () => {
    expect(focusedInteractionRowIndex(rows, null)).toBeNull();
  });

  it("returns null when requestId is undefined", () => {
    expect(focusedInteractionRowIndex(rows, undefined)).toBeNull();
  });

  it("returns null when no row's requestId matches (interaction not present yet — may still be streaming in)", () => {
    expect(focusedInteractionRowIndex(rows, "not-in-the-list")).toBeNull();
  });

  it("returns the index of the permission interaction row matching requestId", () => {
    expect(focusedInteractionRowIndex(rows, "req-42")).toBe(2);
  });

  it("returns the index of a user_input interaction row matching requestId", () => {
    expect(focusedInteractionRowIndex([userMessageRow, userInputRow, permissionRow], "req-7")).toBe(1);
  });

  it("never matches a non-interaction row even if its id happens to collide", () => {
    const collidingUserMessage: TranscriptRowViewModel = {
      id: "req-42",
      turnId: "turn-1",
      kind: "user_message",
      text: "coincidence",
      isStreaming: false,
    };
    expect(focusedInteractionRowIndex([collidingUserMessage], "req-42")).toBeNull();
  });

  it("returns null for an empty row list", () => {
    expect(focusedInteractionRowIndex([], "req-42")).toBeNull();
  });
});
