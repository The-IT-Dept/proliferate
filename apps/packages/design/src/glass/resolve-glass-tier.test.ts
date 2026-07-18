import { describe, expect, it } from "vitest";
import { resolveGlassTier, type GlassCaps } from "./resolve-glass-tier";

function caps(overrides: Partial<GlassCaps>): GlassCaps {
  return {
    glassApiAvailable: false,
    reduceTransparency: false,
    increaseContrast: false,
    ...overrides,
  };
}

describe("resolveGlassTier", () => {
  it("resolves to opaque when Reduce Transparency is on, even if native glass is available", () => {
    expect(
      resolveGlassTier(
        caps({ reduceTransparency: true, glassApiAvailable: true, increaseContrast: true }),
      ),
    ).toBe("opaque");
  });

  it("resolves to bordered when Increase Contrast is on and Reduce Transparency is off", () => {
    expect(resolveGlassTier(caps({ increaseContrast: true }))).toBe("bordered");
  });

  it("resolves to native when the glass API is available and no accessibility overrides are set", () => {
    expect(resolveGlassTier(caps({ glassApiAvailable: true }))).toBe("native");
  });

  it("resolves to blur when the glass API is unavailable and no accessibility overrides are set", () => {
    expect(resolveGlassTier(caps({}))).toBe("blur");
  });

  it("gives reduceTransparency precedence over increaseContrast", () => {
    expect(
      resolveGlassTier(caps({ reduceTransparency: true, increaseContrast: true })),
    ).toBe("opaque");
  });

  it("gives increaseContrast precedence over glassApiAvailable", () => {
    expect(
      resolveGlassTier(caps({ increaseContrast: true, glassApiAvailable: true })),
    ).toBe("bordered");
  });
});
