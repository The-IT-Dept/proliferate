import { describe, expect, it } from "vitest";
import { glassTokens, isDarkTheme } from "./tokens";

describe("glassTokens", () => {
  it("resolves the dark-theme base surface, tint, and body colors from design-system.md", () => {
    const dark = glassTokens("dark");
    expect(dark.surface.base).toBe("#181818");
    expect(dark.tint).toBe("#339CFF");
    expect(dark.surface.body).toBe("#0C0C0D");
  });

  it("resolves the light-theme base surface and tint from design-system.md", () => {
    const light = glassTokens("light");
    expect(light.surface.base).toBe("#F5F5F7");
    expect(light.tint).toBe("#0A7AFF");
    // terminalBg / diff field is always dark, in both themes.
    expect(light.surface.body).toBe("#0C0C0D");
  });

  it("differs between light and dark for theme-dependent tokens", () => {
    const dark = glassTokens("dark");
    const light = glassTokens("light");
    expect(light.surface.base).not.toBe(dark.surface.base);
    expect(light.surface.raised).not.toBe(dark.surface.raised);
    expect(light.tint).not.toBe(dark.tint);
    expect(light.border.hairline).not.toBe(dark.border.hairline);
    expect(light.text.primary).not.toBe(dark.text.primary);
    expect(light.text.secondary).not.toBe(dark.text.secondary);
  });

  it("keeps the terminal/diff body field the same dark value in both themes", () => {
    expect(glassTokens("light").surface.body).toBe(glassTokens("dark").surface.body);
  });

  it("resolves the tier-3 fallback (opaque) surface and hairline border per theme", () => {
    const dark = glassTokens("dark");
    const light = glassTokens("light");
    // §3.1 tier 3: opaque surfaceElevated (dark #202020; light #FBFBFD).
    expect(dark.surface.raised).toBe("#202020");
    expect(light.surface.raised).toBe("#FBFBFD");
    // §2.1 separator.
    expect(dark.border.hairline).toBe("rgba(255,255,255,0.084)");
    expect(light.border.hairline).toBe("rgba(0,0,0,0.09)");
  });

  it("resolves the §2.1 separatorHeavy border used by the tier-4 (Increase Contrast) full-perimeter border", () => {
    const dark = glassTokens("dark");
    const light = glassTokens("light");
    expect(dark.border.separatorHeavy).toBe("rgba(255,255,255,0.14)");
    expect(light.border.separatorHeavy).toBe("rgba(0,0,0,0.16)");
  });

  it("resolves primary/secondary text (ink/inkSecondary) per theme, and a shared mono font stack", () => {
    const dark = glassTokens("dark");
    const light = glassTokens("light");
    expect(dark.text.primary).toBe("#FFFFFF");
    expect(dark.text.secondary).toBe("rgba(255,255,255,0.71)");
    expect(light.text.primary).toBe("#1A1A1A");
    expect(light.text.secondary).toBe("rgba(26,26,26,0.72)");
    // SF Mono is mandatory for git/shell-addressable text in both themes (§5).
    expect(dark.text.mono).toContain("SF Mono");
    expect(dark.text.mono).toBe(light.text.mono);
  });

  it("provides a light/dark rgba tint-overlay pair for tinted glass, independent of the resolved theme", () => {
    const dark = glassTokens("dark");
    const light = glassTokens("light");
    expect(dark.glassTint).toEqual(light.glassTint);
    expect(dark.glassTint.dark).toMatch(/^rgba\(51,\s?156,\s?255,/);
    expect(dark.glassTint.light).toMatch(/^rgba\(10,\s?122,\s?255,/);
  });

  it("exposes the elevation stacking order for nav/tab/sheet/fab glass roles", () => {
    const tokens = glassTokens("dark");
    expect(tokens.elevation.nav).toBeLessThan(tokens.elevation.tab);
    expect(tokens.elevation.tab).toBeLessThan(tokens.elevation.fab);
    expect(tokens.elevation.fab).toBeLessThan(tokens.elevation.sheet);
  });

  it("exposes the §6 concentric radius scale, with capsule resolving to a full pill", () => {
    const tokens = glassTokens("dark");
    expect(tokens.radius.sm).toBe(10);
    expect(tokens.radius.md).toBe(16);
    expect(tokens.radius.lg).toBe(22);
    // RN/CSS clip borderRadius to min(width,height)/2 — an oversized constant
    // always yields the "height / 2" capsule shape from §6 regardless of the
    // element's actual height.
    expect(tokens.radius.capsule).toBe(999);
  });

  it("isDarkTheme recovers which theme a resolved GlassTokens came from", () => {
    expect(isDarkTheme(glassTokens("dark"))).toBe(true);
    expect(isDarkTheme(glassTokens("light"))).toBe(false);
  });

  it("exposes the §4 elevation SHADOW scale (flat/raised/floating) as RN shadow + Android elevation values", () => {
    const dark = glassTokens("dark");
    const light = glassTokens("light");

    // flat: no shadow, in either theme.
    expect(dark.shadow.flat.shadowOpacity).toBe(0);
    expect(dark.shadow.flat.elevation).toBe(0);

    // raised (dark): 0 1px 2px rgba(0,0,0,0.24).
    expect(dark.shadow.raised).toMatchObject({
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.24,
      shadowRadius: 2,
    });
    // raised (light): 0 1px 3px rgba(0,0,0,0.10).
    expect(light.shadow.raised).toMatchObject({
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 3,
    });

    // floating (dark): 0 10px 30px rgba(0,0,0,0.42) — glass docks/FABs/sheets.
    expect(dark.shadow.floating).toMatchObject({
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.42,
      shadowRadius: 30,
    });
    // floating (light): 0 10px 30px rgba(0,0,0,0.16).
    expect(light.shadow.floating).toMatchObject({
      shadowColor: "#000000",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.16,
      shadowRadius: 30,
    });

    // Android elevation grows monotonically with the shadow's visual depth.
    expect(dark.shadow.flat.elevation).toBeLessThan(dark.shadow.raised.elevation);
    expect(dark.shadow.raised.elevation).toBeLessThan(dark.shadow.floating.elevation);
  });

  it("spaces on the 4pt grid (§6)", () => {
    const tokens = glassTokens("dark");
    expect([1, 2, 3, 4, 5, 6, 8, 10, 12].map(tokens.spacing)).toEqual([
      4, 8, 12, 16, 20, 24, 32, 40, 48,
    ]);
  });
});
