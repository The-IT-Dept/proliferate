import React, { useEffect, useRef } from "react";
import { Animated, AccessibilityInfo, StyleSheet, Text, View, useColorScheme } from "react-native";
import { glassTokens } from "./tokens";
import {
  formatContextCapsule,
  statusDotColor,
  type ContextCapsuleStatus,
} from "./context-capsule-logic";

export { formatContextCapsule, statusDotColor, type ContextCapsuleStatus };

export interface ContextCapsuleProps {
  repo: string;
  branch: string;
  status: ContextCapsuleStatus;
}

/**
 * The signature `repo · branch` + status-dot pill (design-system.md §3.2,
 * "Context capsule (signature)"). Lives on the glass nav bar rather than
 * being glass itself — a control on a glass bar renders as vibrancy/plain,
 * never as nested glass (§1 hard rule 2).
 */
export function ContextCapsule({ repo, branch, status }: ContextCapsuleProps): React.JSX.Element {
  const theme = useColorScheme() === "light" ? "light" : "dark";
  const tokens = glassTokens(theme);
  const dotColor = statusDotColor(status, tokens);
  const label = formatContextCapsule(repo, branch);

  // §2.3: the `live`/running dot breathes (1.6s, opacity 0.6->1.0 loop);
  // static under Reduce Motion (§8).
  const breathe = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status !== "running") {
      breathe.setValue(1);
      return;
    }

    let animation: Animated.CompositeAnimation | undefined;
    let cancelled = false;

    AccessibilityInfo.isReduceMotionEnabled().then((reduceMotion) => {
      if (cancelled) return;
      if (reduceMotion) {
        breathe.setValue(1);
        return;
      }
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(breathe, { toValue: 0.6, duration: 1600, useNativeDriver: true }),
          Animated.timing(breathe, { toValue: 1, duration: 1600, useNativeDriver: true }),
        ]),
      );
      animation.start();
    });

    return () => {
      cancelled = true;
      animation?.stop();
    };
  }, [status, breathe]);

  return (
    <View
      style={[
        styles.capsule,
        { borderRadius: tokens.radius.capsule, paddingHorizontal: tokens.spacing(3) },
      ]}
      accessibilityLabel={`repo ${label.split(" · ")[0]}, branch ${branch}, status ${status}`}
    >
      <Animated.View
        style={[styles.dot, { backgroundColor: dotColor, opacity: breathe }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <Text
        style={[styles.label, { color: tokens.text.primary, fontFamily: tokens.text.mono }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  capsule: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 11.5,
    fontWeight: "500",
  },
});
