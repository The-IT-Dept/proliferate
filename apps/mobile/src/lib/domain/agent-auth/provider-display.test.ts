import { describe, expect, it } from "vitest";

import { getProviderDisplayName } from "./provider-display";

/** Ported verbatim from product-client web's `lib/domain/agents/provider-display.ts`. */
describe("getProviderDisplayName", () => {
  it("maps known provider kinds to their display names", () => {
    expect(getProviderDisplayName("claude")).toBe("Claude");
    expect(getProviderDisplayName("codex")).toBe("Codex");
    expect(getProviderDisplayName("cursor")).toBe("Cursor");
    expect(getProviderDisplayName("opencode")).toBe("OpenCode");
  });

  it("falls back to the raw kind for an unknown provider", () => {
    expect(getProviderDisplayName("some-new-harness")).toBe("some-new-harness");
  });
});
