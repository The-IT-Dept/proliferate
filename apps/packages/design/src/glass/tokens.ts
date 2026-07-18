/**
 * Liquid Glass design tokens for the Proliferate mobile app.
 *
 * Source of truth: docs/design/mobile/design-system.md. Every literal value
 * below is copied verbatim from that document's tables — do not "round" or
 * re-derive them. Where the design doc leaves an implementation detail
 * unspecified (elevation stacking order, the sm/md/lg radius scale, the
 * light-theme tint-overlay opacity), the choice is called out in a comment
 * next to the value, grounded in the nearest documented convention.
 */

export type GlassTheme = "light" | "dark";

/** One §4 elevation level, expressed as RN's shadow* props plus the
 * Android-only `elevation` fallback (RN's shadow* props are iOS-only). */
export interface ShadowToken {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

export interface GlassTokens {
  surface: { base: string; raised: string; body: string };
  tint: string;
  glassTint: { light: string; dark: string };
  border: { hairline: string; separatorHeavy: string };
  text: { primary: string; secondary: string; mono: string };
  elevation: Record<"nav" | "tab" | "sheet" | "fab", number>;
  radius: Record<"sm" | "md" | "lg" | "capsule", number>;
  spacing: (n: number) => number;
  shadow: Record<"flat" | "raised" | "floating", ShadowToken>;
}

// §5 — SF Mono is mandatory for any git/shell-addressable text, in both
// themes. Matches @proliferate/design's existing typography.fontMono stack.
const monoFontStack =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

// §2.2 — tint (Proliferate Blue): dark #339CFF / light #0A7AFF. glassTint is
// a fixed light/dark rgba-overlay pair (not resolved per-call) so a tinted
// glass element can pick the overlay matching the platform's own appearance
// independent of which theme's base tokens are in use. The dark overlay is
// the existing `info`/`infoSubtle` pair from tokens.ts; the light overlay
// follows the same ~0.12 opacity convention as the other *Subtle light
// tokens in §2.2 (successSubtle/warningSubtle/dangerSubtle all light @0.10–0.12).
const glassTint = {
  dark: "rgba(51,156,255,0.14)",
  light: "rgba(10,122,255,0.12)",
} as const;

// tokens.surface.base is one of exactly two literal hex values from
// glassTokens (§2.1 `bg`: dark #181818 / light #F5F5F7); comparing against
// the dark value is a simple, deterministic way to recover which theme a
// resolved GlassTokens came from without adding a redundant `theme` field
// to the GlassTokens interface itself. Shared by backing-for-tier.ts and
// ContextCapsule's statusDotColor, which both need to key theme-only
// semantic colors (blur tint, status tones) off an already-resolved token set.
export function isDarkTheme(tokens: GlassTokens): boolean {
  return tokens.surface.base === "#181818";
}

export function glassTokens(theme: GlassTheme): GlassTokens {
  const dark = theme === "dark";

  return {
    surface: {
      // §2.1 bg.
      base: dark ? "#181818" : "#F5F5F7",
      // §3.1 tier 3 fallback: opaque surfaceElevated.
      raised: dark ? "#202020" : "#FBFBFD",
      // §2.1 terminalBg — always dark in both themes.
      body: "#0C0C0D",
    },
    tint: dark ? "#339CFF" : "#0A7AFF",
    glassTint,
    border: {
      // §2.1 separator.
      hairline: dark ? "rgba(255,255,255,0.084)" : "rgba(0,0,0,0.09)",
      // §2.1 separatorHeavy — heavier than the hairline; used for the tier-4
      // (Increase Contrast) full-perimeter border (§3.1 tier 4).
      separatorHeavy: dark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.16)",
    },
    text: {
      // §2.1 ink/fg.
      primary: dark ? "#FFFFFF" : "#1A1A1A",
      // §2.1 inkSecondary.
      secondary: dark ? "rgba(255,255,255,0.71)" : "rgba(26,26,26,0.72)",
      mono: monoFontStack,
    },
    // Stacking order for simultaneously-visible glass surfaces (not shadow
    // depth — depth comes from the two-layer content/glass split, §4). A
    // presented sheet's chrome sits over everything; floating controls
    // (dock/FAB) float above the tab bar; nav bars are the base glass layer.
    // Mirrors the ordering implied by §3.2's allowlist and mockups.html.
    elevation: { nav: 10, tab: 20, fab: 30, sheet: 40 },
    radius: {
      // §6 concentric radius rule: inner block at 12pt inset = 22 − 12.
      sm: 10,
      // §6 terminal/diff code field.
      md: 16,
      // §6 card default radius.
      lg: 22,
      // §6: capsule = height / 2. RN/CSS clip borderRadius to
      // min(width,height)/2, so a large constant always yields a true
      // capsule regardless of the element's actual height.
      capsule: 999,
    },
    // §6 base 4pt grid.
    spacing: (n: number) => n * 4,
    // §4 elevation: a SHADOW scale (not the glass z-order stacking above),
    // expressed as RN's iOS shadow* props (a CSS `0 {y}px {blur}px
    // rgba(0,0,0,{opacity})` box-shadow decomposes directly into
    // shadowOffset.height/shadowRadius/shadowOpacity) plus the Android-only
    // `elevation` fallback. The design doc doesn't specify Android dp values,
    // so `elevation` is chosen to grow with each level's visual depth,
    // following Material Design's own elevation convention (resting
    // cards/menus ~2dp, floating action buttons/sheets ~8dp+) as the nearest
    // documented reference.
    shadow: {
      flat: {
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0,
        shadowRadius: 0,
        elevation: 0,
      },
      raised: {
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: dark ? 0.24 : 0.1,
        shadowRadius: dark ? 2 : 3,
        elevation: 2,
      },
      floating: {
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: dark ? 0.42 : 0.16,
        shadowRadius: 30,
        elevation: 8,
      },
    },
  };
}
