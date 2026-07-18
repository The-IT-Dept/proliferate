/**
 * Pure tier resolution for the Liquid Glass fallback ladder
 * (design-system.md §3.1). Deliberately free of any `react-native` /
 * `expo-*` imports so it can be unit-tested directly under Node — the RN
 * package's own source uses Flow syntax that Vite/vitest cannot parse, so
 * anything imported by a test file must not pull it in, even transitively.
 * `use-glass-capability.ts` re-exports this for the public glass API.
 */

/** The four-tier ladder. Precedence (highest first): reduceTransparency >
 * increaseContrast > glassApiAvailable > blur. */
export type GlassTier = "native" | "blur" | "opaque" | "bordered";

export interface GlassCaps {
  glassApiAvailable: boolean;
  reduceTransparency: boolean;
  increaseContrast: boolean;
}

/** Pure resolver: capability + accessibility state -> the active glass tier. */
export function resolveGlassTier(caps: GlassCaps): GlassTier {
  if (caps.reduceTransparency) return "opaque";
  if (caps.increaseContrast) return "bordered";
  if (caps.glassApiAvailable) return "native";
  return "blur";
}
