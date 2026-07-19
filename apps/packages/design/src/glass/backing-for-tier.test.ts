import { describe, expect, it } from "vitest";
import { backingForTier } from "./backing-for-tier";
import { glassTokens } from "./tokens";

const dark = glassTokens("dark");
const light = glassTokens("light");

describe("backingForTier", () => {
  it("renders native tier as a GlassView with the regular glassEffectStyle default", () => {
    const backing = backingForTier("native", "nav", dark);
    expect(backing.kind).toBe("GlassView");
    expect(backing.props).toMatchObject({ glassEffectStyle: "regular" });
  });

  it("is the single source of truth for glassEffectStyle: it passes the call-site's glassStyle through to the native GlassView backing", () => {
    const backing = backingForTier("native", "nav", dark, "clear");
    expect(backing.kind).toBe("GlassView");
    expect(backing.props).toMatchObject({ glassEffectStyle: "clear" });
  });

  it("renders blur tier as a BlurView with a dark system chrome material tint at full intensity", () => {
    const backing = backingForTier("blur", "nav", dark);
    expect(backing.kind).toBe("BlurView");
    expect(backing.props).toMatchObject({ tint: "systemChromeMaterialDark", intensity: 100 });
  });

  it("renders blur tier with the light system chrome material tint against light tokens", () => {
    const backing = backingForTier("blur", "nav", light);
    expect(backing.kind).toBe("BlurView");
    expect(backing.props).toMatchObject({ tint: "systemChromeMaterial", intensity: 100 });
  });

  it("adds a top hairline separator to the blur fallback (§3.1 tier 2)", () => {
    const backing = backingForTier("blur", "nav", dark);
    expect(backing.props.style).toMatchObject({
      borderTopWidth: 1,
      borderTopColor: dark.border.hairline,
    });
  });

  it("renders opaque tier as a flat surface View with zero blur props", () => {
    const backing = backingForTier("opaque", "nav", dark);
    expect(backing.kind).toBe("View");
    expect(backing.props.style).toMatchObject({ backgroundColor: dark.surface.raised });
    expect(backing.props).not.toHaveProperty("tint");
    expect(backing.props).not.toHaveProperty("glassEffectStyle");
  });

  it("adds a hairline border to the opaque fallback so the raised surface is visibly bounded (§3.1 tier 3)", () => {
    const backing = backingForTier("opaque", "nav", dark);
    expect(backing.props.style).toMatchObject({
      borderWidth: 1,
      borderColor: dark.border.hairline,
    });
  });

  it("renders bordered tier as a View with a full-perimeter separatorHeavy border, heavier than the hairline (§3.1 tier 4)", () => {
    const backing = backingForTier("bordered", "nav", dark);
    expect(backing.kind).toBe("View");
    expect(backing.props.style).toMatchObject({
      borderWidth: 1,
      borderColor: dark.border.separatorHeavy,
    });
    expect(backing.props.style?.borderColor).not.toBe(dark.border.hairline);
  });

  it("never sets opacity to 0 to hide glass, on any tier", () => {
    for (const tier of ["native", "blur", "opaque", "bordered"] as const) {
      const backing = backingForTier(tier, "dock", dark);
      expect(backing.props.style?.opacity).not.toBe(0);
    }
  });

  it("shapes the tab bar, FAB, composer dock, and shell segmented control as full capsules (§6)", () => {
    for (const variant of ["tab", "fab", "dock", "segmented"] as const) {
      const backing = backingForTier("native", variant, dark);
      expect(backing.props.style?.borderRadius).toBe(dark.radius.capsule);
    }
  });

  it("keeps nav bars and toolbars square (edge-to-edge, no rounding)", () => {
    for (const variant of ["nav", "toolbar"] as const) {
      const backing = backingForTier("native", variant, dark);
      expect(backing.props.style?.borderRadius).toBe(0);
    }
  });

  it("rounds only the sheet's top corners at the device-concentric 38pt radius (§6)", () => {
    const backing = backingForTier("native", "sheet", dark);
    expect(backing.props.style).toMatchObject({
      borderTopLeftRadius: 38,
      borderTopRightRadius: 38,
    });
  });
});
