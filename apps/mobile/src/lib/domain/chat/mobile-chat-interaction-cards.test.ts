import { describe, expect, it } from "vitest";
import type {
  McpElicitationField,
  PermissionInteractionOption,
  UserInputQuestion,
} from "@anyharness/sdk";

import {
  buildMcpElicitationSubmittedFields,
  buildUserInputAnswer,
  initialMcpElicitationDrafts,
  isDestructivePermissionOptionKind,
  OTHER_OPTION_DESCRIPTION,
  OTHER_OPTION_LABEL,
  permissionCardOptions,
  userInputAllowsDraftText,
  userInputQuestionOptions,
} from "./mobile-chat-interaction-cards";

describe("permissionCardOptions", () => {
  it("maps the harness-provided options verbatim, resolving via selected", () => {
    const harnessOptions: PermissionInteractionOption[] = [
      { optionId: "allow_once", label: "Allow", kind: "allow_once" },
      { optionId: "allow_session", label: "Allow for this session", kind: "allow_always" },
      { optionId: "reject_once", label: "Deny", kind: "reject_once" },
    ];
    const options = permissionCardOptions(harnessOptions);
    expect(options).toEqual([
      { key: "allow_once", label: "Allow", destructive: false, resolve: "selected", optionId: "allow_once", decision: undefined },
      { key: "allow_session", label: "Allow for this session", destructive: false, resolve: "selected", optionId: "allow_session", decision: undefined },
      { key: "reject_once", label: "Deny", destructive: true, resolve: "selected", optionId: "reject_once", decision: undefined },
    ]);
  });

  it("falls back to Allow/Deny via the decision outcome when the harness sends no options", () => {
    const options = permissionCardOptions([]);
    expect(options).toEqual([
      { key: "allow", label: "Allow", destructive: false, resolve: "decision", optionId: undefined, decision: "allow" },
      { key: "deny", label: "Deny", destructive: true, resolve: "decision", optionId: undefined, decision: "deny" },
    ]);
  });
});

describe("isDestructivePermissionOptionKind", () => {
  it.each([
    ["reject_once", true],
    ["reject_always", true],
    ["allow_once", false],
    ["allow_always", false],
    ["unknown", false],
    [null, false],
  ] as const)("%s -> destructive=%s", (kind, expected) => {
    expect(isDestructivePermissionOptionKind(kind)).toBe(expected);
  });
});

function question(overrides: Partial<UserInputQuestion> = {}): UserInputQuestion {
  return {
    questionId: "q1",
    header: "Naming",
    question: "Endpoint name?",
    isOther: false,
    isSecret: false,
    ...overrides,
  };
}

describe("userInputQuestionOptions", () => {
  it("returns the agent options as-is when isOther is false", () => {
    const q = question({
      options: [{ label: "Baseline the migration", description: "Mark it applied without running it" }],
      isOther: false,
    });
    expect(userInputQuestionOptions(q)).toEqual([
      { label: "Baseline the migration", description: "Mark it applied without running it" },
    ]);
  });

  it("appends the synthetic 'None of the above' row when isOther is true", () => {
    const q = question({
      options: [{ label: "Re-run the migration", description: "" }],
      isOther: true,
    });
    expect(userInputQuestionOptions(q)).toEqual([
      { label: "Re-run the migration", description: "" },
      { label: OTHER_OPTION_LABEL, description: OTHER_OPTION_DESCRIPTION },
    ]);
  });

  it("returns just the synthetic row when there are no agent options but isOther is true", () => {
    const q = question({ options: [], isOther: true });
    expect(userInputQuestionOptions(q)).toEqual([
      { label: OTHER_OPTION_LABEL, description: OTHER_OPTION_DESCRIPTION },
    ]);
  });
});

describe("userInputAllowsDraftText", () => {
  it("allows free text when the question has no options at all", () => {
    expect(userInputAllowsDraftText(question({ options: [], isOther: false }), null)).toBe(true);
  });

  it("disallows free text when options exist and 'None of the above' isn't selected", () => {
    const q = question({ options: [{ label: "A", description: "" }], isOther: true });
    expect(userInputAllowsDraftText(q, "A")).toBe(false);
  });

  it("allows free text once the synthetic 'None of the above' row is selected", () => {
    const q = question({ options: [{ label: "A", description: "" }], isOther: true });
    expect(userInputAllowsDraftText(q, OTHER_OPTION_LABEL)).toBe(true);
  });

  it("disallows free text when isOther is false even with no selection", () => {
    const q = question({ options: [{ label: "A", description: "" }], isOther: false });
    expect(userInputAllowsDraftText(q, null)).toBe(false);
  });
});

describe("buildUserInputAnswer", () => {
  it("carries the selected option label with no text for a concrete option answer", () => {
    const q = question({ options: [{ label: "Baseline", description: "" }], isOther: false });
    const answer = buildUserInputAnswer(q, { selectedOptionLabel: "Baseline", text: "" });
    expect(answer).toEqual({ questionId: "q1", selectedOptionLabel: "Baseline", text: undefined });
  });

  it("carries trimmed free text for a synthetic 'None of the above' answer", () => {
    const q = question({ options: [{ label: "Baseline", description: "" }], isOther: true });
    const answer = buildUserInputAnswer(q, {
      selectedOptionLabel: OTHER_OPTION_LABEL,
      text: "  a custom answer  ",
    });
    expect(answer).toEqual({
      questionId: "q1",
      selectedOptionLabel: OTHER_OPTION_LABEL,
      text: "a custom answer",
    });
  });

  it("carries free text with no selected label for a no-options question", () => {
    const q = question({ options: [], isOther: false });
    const answer = buildUserInputAnswer(q, { selectedOptionLabel: null, text: "free text" });
    expect(answer).toEqual({ questionId: "q1", selectedOptionLabel: undefined, text: "free text" });
  });

  it("drops empty text down to undefined rather than an empty string", () => {
    const q = question({ options: [], isOther: false });
    const answer = buildUserInputAnswer(q, { selectedOptionLabel: null, text: "   " });
    expect(answer.text).toBeUndefined();
  });
});

function booleanField(overrides: Partial<Extract<McpElicitationField, { fieldType: "boolean" }>> = {}) {
  return {
    fieldType: "boolean" as const,
    fieldId: "confirm",
    label: "Confirm",
    required: true,
    ...overrides,
  };
}

function textField(overrides: Partial<Extract<McpElicitationField, { fieldType: "text" }>> = {}) {
  return {
    fieldType: "text" as const,
    fieldId: "name",
    label: "Name",
    required: true,
    ...overrides,
  };
}

function numberField(overrides: Partial<Extract<McpElicitationField, { fieldType: "number" }>> = {}) {
  return {
    fieldType: "number" as const,
    fieldId: "count",
    label: "Count",
    required: true,
    integer: true,
    ...overrides,
  };
}

function multiSelectField(overrides: Partial<Extract<McpElicitationField, { fieldType: "multi_select" }>> = {}) {
  return {
    fieldType: "multi_select" as const,
    fieldId: "tags",
    label: "Tags",
    required: false,
    options: [{ optionId: "a", label: "A" }, { optionId: "b", label: "B" }],
    ...overrides,
  };
}

function singleSelectField(overrides: Partial<Extract<McpElicitationField, { fieldType: "single_select" }>> = {}) {
  return {
    fieldType: "single_select" as const,
    fieldId: "priority",
    label: "Priority",
    required: true,
    options: [{ optionId: "low", label: "Low" }, { optionId: "high", label: "High" }],
    ...overrides,
  };
}

describe("initialMcpElicitationDrafts", () => {
  it("seeds a required boolean field to false", () => {
    expect(initialMcpElicitationDrafts([booleanField({ required: true })])).toEqual({ confirm: false });
  });

  it("does not seed an optional boolean field", () => {
    expect(initialMcpElicitationDrafts([booleanField({ required: false })])).toEqual({});
  });

  it("seeds a multi_select field to an empty array", () => {
    expect(initialMcpElicitationDrafts([multiSelectField()])).toEqual({ tags: [] });
  });

  it("seeds text/number/single_select fields to an empty string", () => {
    expect(initialMcpElicitationDrafts([textField(), numberField()])).toEqual({ name: "", count: "" });
  });
});

describe("buildMcpElicitationSubmittedFields", () => {
  it("submits a boolean field", () => {
    const result = buildMcpElicitationSubmittedFields([booleanField()], { confirm: true });
    expect(result).toEqual([{ fieldId: "confirm", value: { type: "boolean", value: true } }]);
  });

  it("rejects a missing required boolean field", () => {
    const result = buildMcpElicitationSubmittedFields([booleanField({ required: true })], {});
    expect(result).toBe("Confirm is required.");
  });

  it("submits a required text field", () => {
    const result = buildMcpElicitationSubmittedFields([textField()], { name: "hello" });
    expect(result).toEqual([{ fieldId: "name", value: { type: "string", value: "hello" } }]);
  });

  it("rejects a missing required text field", () => {
    const result = buildMcpElicitationSubmittedFields([textField()], { name: "" });
    expect(result).toBe("Name is required.");
  });

  it("skips an optional, empty text field", () => {
    const result = buildMcpElicitationSubmittedFields([textField({ required: false })], { name: "" });
    expect(result).toEqual([]);
  });

  it("submits a number field as a number", () => {
    const result = buildMcpElicitationSubmittedFields(
      [numberField({ integer: false })],
      { count: "3.5" },
    );
    expect(result).toEqual([{ fieldId: "count", value: { type: "number", value: 3.5 } }]);
  });

  it("submits an integer field as an integer", () => {
    const result = buildMcpElicitationSubmittedFields([numberField({ integer: true })], { count: "3" });
    expect(result).toEqual([{ fieldId: "count", value: { type: "integer", value: 3 } }]);
  });

  it("rejects a non-numeric number field", () => {
    const result = buildMcpElicitationSubmittedFields([numberField()], { count: "abc" });
    expect(result).toBe("Count must be a valid number.");
  });

  it("rejects a non-integer value for an integer field", () => {
    const result = buildMcpElicitationSubmittedFields([numberField({ integer: true })], { count: "3.5" });
    expect(result).toBe("Count must be a safe integer.");
  });

  it("submits a multi_select field as an option_array", () => {
    const result = buildMcpElicitationSubmittedFields([multiSelectField()], { tags: ["a", "b"] });
    expect(result).toEqual([{ fieldId: "tags", value: { type: "option_array", option_ids: ["a", "b"] } }]);
  });

  it("skips an optional multi_select field with no selection", () => {
    const result = buildMcpElicitationSubmittedFields([multiSelectField({ required: false })], { tags: [] });
    expect(result).toEqual([]);
  });

  it("rejects a required multi_select field with no selection", () => {
    const result = buildMcpElicitationSubmittedFields([multiSelectField({ required: true })], { tags: [] });
    expect(result).toBe("Tags is required.");
  });

  it("enforces minItems on a multi_select field", () => {
    const result = buildMcpElicitationSubmittedFields(
      [multiSelectField({ minItems: 2 })],
      { tags: ["a"] },
    );
    expect(result).toBe("Tags needs at least 2 options.");
  });

  it("enforces maxItems on a multi_select field", () => {
    const result = buildMcpElicitationSubmittedFields(
      [multiSelectField({ maxItems: 1 })],
      { tags: ["a", "b"] },
    );
    expect(result).toBe("Tags allows at most 1 option.");
  });

  it("submits multiple fields together, in order", () => {
    const result = buildMcpElicitationSubmittedFields(
      [textField(), booleanField({ fieldId: "confirm2", label: "Confirm 2" })],
      { name: "hi", confirm2: true },
    );
    expect(result).toEqual([
      { fieldId: "name", value: { type: "string", value: "hi" } },
      { fieldId: "confirm2", value: { type: "boolean", value: true } },
    ]);
  });

  // Fix D (E3 Minor, reviewer finding): single_select was the one field
  // type with no coverage — every other branch of this function (boolean,
  // text, number/integer, multi_select) had a submit + a reject test.
  it("submits a single_select field as an { type: 'option', option_id }", () => {
    const result = buildMcpElicitationSubmittedFields([singleSelectField()], { priority: "high" });
    expect(result).toEqual([{ fieldId: "priority", value: { type: "option", option_id: "high" } }]);
  });

  it("rejects a missing required single_select field", () => {
    const result = buildMcpElicitationSubmittedFields([singleSelectField()], { priority: "" });
    expect(result).toBe("Priority is required.");
  });

  it("skips an optional, unselected single_select field", () => {
    const result = buildMcpElicitationSubmittedFields(
      [singleSelectField({ required: false })],
      { priority: "" },
    );
    expect(result).toEqual([]);
  });
});
