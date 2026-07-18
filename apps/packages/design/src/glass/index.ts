/**
 * Public API for the Liquid Glass layer (docs/design/mobile/design-system.md).
 * Import from "@proliferate/design/glass".
 */

export { glassTokens, isDarkTheme } from "./tokens";
export type { GlassTheme, GlassTokens } from "./tokens";

export { resolveGlassTier } from "./resolve-glass-tier";
export type { GlassTier, GlassCaps } from "./resolve-glass-tier";

export { useGlassCapability } from "./use-glass-capability";

export { backingForTier } from "./backing-for-tier";
export type { GlassSurfaceVariant, BackingResult } from "./backing-for-tier";

export { GlassSurface } from "./GlassSurface";
export type { GlassSurfaceProps } from "./GlassSurface";

export { ContextCapsule, formatContextCapsule, statusDotColor } from "./ContextCapsule";
export type { ContextCapsuleProps, ContextCapsuleStatus } from "./ContextCapsule";
