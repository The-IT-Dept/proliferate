import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { isGlassEffectAPIAvailable } from "expo-glass-effect";
import { resolveGlassTier, type GlassCaps, type GlassTier } from "./resolve-glass-tier";

export { resolveGlassTier, type GlassCaps, type GlassTier };

/**
 * Resolves the active glass tier for the current device, re-evaluating on
 * the relevant AccessibilityInfo change events (§3.1: "re-evaluated on the
 * corresponding change events"). `isGlassEffectAPIAvailable()` is a
 * synchronous, device-capability check that does not change at runtime, so
 * it's read once. "Increase Contrast" on iOS maps to
 * `isDarkerSystemColorsEnabled()` / `darkerSystemColorsChanged`
 * (Settings > Accessibility > Display & Text Size > Increase Contrast).
 */
export function useGlassCapability(): GlassTier {
  const [glassApiAvailable] = useState(() => isGlassEffectAPIAvailable());
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const [increaseContrast, setIncreaseContrast] = useState(false);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceTransparencyEnabled().then((enabled) => {
      if (mounted) setReduceTransparency(enabled);
    });
    AccessibilityInfo.isDarkerSystemColorsEnabled().then((enabled) => {
      if (mounted) setIncreaseContrast(enabled);
    });

    const reduceTransparencySub = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      setReduceTransparency,
    );
    const increaseContrastSub = AccessibilityInfo.addEventListener(
      "darkerSystemColorsChanged",
      setIncreaseContrast,
    );

    return () => {
      mounted = false;
      reduceTransparencySub.remove();
      increaseContrastSub.remove();
    };
  }, []);

  return resolveGlassTier({ glassApiAvailable, reduceTransparency, increaseContrast });
}
