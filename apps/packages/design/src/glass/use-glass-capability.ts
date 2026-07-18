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
 *
 * `isReduceTransparencyEnabled`/`isDarkerSystemColorsEnabled` are iOS-only
 * concepts react-native-web's AccessibilityInfo shim does not implement —
 * calling them there throws a TypeError rather than resolving/rejecting
 * (unlike its `addEventListener`, which is a safe no-op for unrecognized
 * event names), so both are feature-detected before being called. Missing on
 * a platform is treated as "not set" (false), which resolves to the
 * native/blur tier rather than the degraded opaque/bordered tiers meant for
 * users who explicitly enabled the corresponding OS accessibility setting.
 */
export function useGlassCapability(): GlassTier {
  const [glassApiAvailable] = useState(() => isGlassEffectAPIAvailable());
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const [increaseContrast, setIncreaseContrast] = useState(false);

  useEffect(() => {
    let mounted = true;

    if (typeof AccessibilityInfo.isReduceTransparencyEnabled === "function") {
      AccessibilityInfo.isReduceTransparencyEnabled().then((enabled) => {
        if (mounted) setReduceTransparency(enabled);
      });
    }
    if (typeof AccessibilityInfo.isDarkerSystemColorsEnabled === "function") {
      AccessibilityInfo.isDarkerSystemColorsEnabled().then((enabled) => {
        if (mounted) setIncreaseContrast(enabled);
      });
    }

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
