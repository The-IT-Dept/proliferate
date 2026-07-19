import type { ViewStyle } from "react-native";
import type { GlassStyle } from "expo-glass-effect";
import type { BlurTint } from "expo-blur";
import type { GlassTier } from "./resolve-glass-tier";
import { isDarkTheme, type GlassTokens } from "./tokens";

/**
 * Pure per-tier backing selection for GlassSurface (design-system.md §3,
 * §3.1, §6). Kept free of any `react-native` / `expo-*` *value* imports (only
 * `import type`, which erases before runtime) so it can be unit-tested
 * directly — see resolve-glass-tier.ts for why that matters here.
 */

/** The allowlisted glass call-sites (§3.2), reused by GlassSurface's props. */
export type GlassSurfaceVariant =
  | "nav"
  | "tab"
  | "toolbar"
  | "sheet"
  | "fab"
  | "dock"
  | "segmented";

export type BackingResult =
  | { kind: "GlassView"; props: { glassEffectStyle: GlassStyle; style: ViewStyle } }
  | { kind: "BlurView"; props: { tint: BlurTint; intensity: number; style: ViewStyle } }
  | { kind: "View"; props: { style: ViewStyle } };

// §6 concentric radius rule, resolved per variant. Nav bars/toolbars are
// edge-to-edge (no rounding, mockups.html: `.navbar.glass{border-radius:0}`).
// Tab bar / FAB / composer dock are explicitly capsules. Sheet chrome rounds
// only its top corners at the device-concentric 38pt value from §6 — that
// value is specific to sheets and isn't part of the generic sm/md/lg scale,
// so it's applied directly here rather than added to GlassTokens.radius.
function shapeStyle(variant: GlassSurfaceVariant, tokens: GlassTokens): ViewStyle {
  switch (variant) {
    case "nav":
    case "toolbar":
      return { borderRadius: 0 };
    case "tab":
    case "fab":
    case "dock":
    // §3.2 workspace-shell segmented control: one glass capsule holding the
    // four segments (Sessions/Chat/Term/Diff), radius = height/2 (§6).
    case "segmented":
      return { borderRadius: tokens.radius.capsule };
    case "sheet":
      return { borderTopLeftRadius: 38, borderTopRightRadius: 38 };
    default:
      return { borderRadius: tokens.radius.lg };
  }
}

export function backingForTier(
  tier: GlassTier,
  variant: GlassSurfaceVariant,
  tokens: GlassTokens,
  glassStyle: GlassStyle = "regular",
): BackingResult {
  const shape = shapeStyle(variant, tokens);

  switch (tier) {
    case "native":
      // §3.1 tier 1: native UIGlassEffect/.glassEffect. This is the single
      // source of truth for glassEffectStyle — it resolves the call-site's
      // `glassStyle` prop ("regular" | "clear") directly, so GlassSurface
      // doesn't need (and must not keep) its own separate copy of this
      // decision.
      return { kind: "GlassView", props: { glassEffectStyle: glassStyle, style: shape } };

    case "blur":
      // §3.1 tier 2: expo-blur BlurView, systemChromeMaterial(Dark),
      // intensity 100, plus a 1px top hairline separator. No specular edge.
      return {
        kind: "BlurView",
        props: {
          tint: isDarkTheme(tokens) ? "systemChromeMaterialDark" : "systemChromeMaterial",
          intensity: 100,
          style: { ...shape, borderTopWidth: 1, borderTopColor: tokens.border.hairline },
        },
      };

    case "opaque":
      // §3.1 tier 3 (Reduce Transparency): opaque surfaceElevated + hairline
      // border, zero blur — the border keeps the raised surface visibly
      // bounded now that there's no blur/specular edge to imply its extent.
      return {
        kind: "View",
        props: {
          style: {
            ...shape,
            backgroundColor: tokens.surface.raised,
            borderWidth: 1,
            borderColor: tokens.border.hairline,
          },
        },
      };

    case "bordered":
      // §3.1 tier 4 (Increase Contrast): full-perimeter separatorHeavy
      // border — heavier than the tier-3 hairline.
      return {
        kind: "View",
        props: {
          style: {
            ...shape,
            backgroundColor: tokens.surface.raised,
            borderWidth: 1,
            borderColor: tokens.border.separatorHeavy,
          },
        },
      };
  }
}
