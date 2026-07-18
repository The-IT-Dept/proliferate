import React from "react";
import { View, useColorScheme, type ViewStyle } from "react-native";
import { GlassView } from "expo-glass-effect";
import { BlurView } from "expo-blur";
import { useGlassCapability } from "./use-glass-capability";
import { glassTokens } from "./tokens";
import { backingForTier, type GlassSurfaceVariant } from "./backing-for-tier";

export type { GlassSurfaceVariant };

export interface GlassSurfaceProps {
  variant: GlassSurfaceVariant;
  glassStyle?: "regular" | "clear";
  interactive?: boolean;
  style?: ViewStyle;
  children?: React.ReactNode;
}

/**
 * The one Liquid Glass primitive (design-system.md §3). Resolves the active
 * fallback tier via useGlassCapability(), picks the concrete backing via
 * backingForTier(), and renders it — GlassView (native, iOS 26+), BlurView
 * (blur fallback), or a plain View (opaque / bordered accessibility tiers).
 * Never renders with opacity: 0 to hide glass (§ Global Constraints).
 */
export function GlassSurface({
  variant,
  glassStyle = "regular",
  interactive = false,
  style,
  children,
}: GlassSurfaceProps): React.JSX.Element {
  const tier = useGlassCapability();
  // Dark is the brand-primary theme (design-system.md §2); fall back to it
  // when the OS reports no preference.
  const theme = useColorScheme() === "light" ? "light" : "dark";
  const tokens = glassTokens(theme);
  // backingForTier is the single source of truth for glassEffectStyle — it
  // resolves the `glassStyle` prop into the native backing itself, so it's
  // consumed from the backing result below rather than passed to GlassView
  // a second time from the raw prop.
  const backing = backingForTier(tier, variant, tokens, glassStyle);

  switch (backing.kind) {
    case "GlassView":
      return (
        <GlassView
          glassEffectStyle={backing.props.glassEffectStyle}
          isInteractive={interactive}
          style={[backing.props.style, style]}
        >
          {children}
        </GlassView>
      );
    case "BlurView":
      return (
        <BlurView
          tint={backing.props.tint}
          intensity={backing.props.intensity}
          style={[backing.props.style, style]}
        >
          {children}
        </BlurView>
      );
    case "View":
      return <View style={[backing.props.style, style]}>{children}</View>;
  }
}
