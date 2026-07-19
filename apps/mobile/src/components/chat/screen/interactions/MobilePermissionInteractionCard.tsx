import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { InteractionDecision } from "@anyharness/sdk";

import { permissionCardOptions } from "../../../../lib/domain/chat/mobile-chat-interaction-cards";
import type { PermissionInteractionRow } from "../../../../lib/domain/chat/mobile-live-transcript-view";
import { colors, radius, spacing } from "../../../../styles/tokens";
import {
  MobileInteractionCardShell,
  MobileInteractionOptionRow,
  monoTextStyle,
} from "./MobileInteractionCardShell";

interface MobilePermissionInteractionCardProps {
  row: PermissionInteractionRow;
  resolving: boolean;
  onSelectOption: (requestId: string, optionId: string) => void;
  onDecision: (requestId: string, decision: InteractionDecision) => void;
}

/**
 * Group E3 — the permission ("approval") interaction card. Design-system.md
 * §10: warning accent bar, fixed header **"Permission request"**, the
 * request body as a wrapping mono snippet, options as the harness-provided
 * `{optionId, label, kind}` rows (allow-kinds filled success tint, kinds
 * starting reject/deny/cancel in dangerSubtle) with a fallback Allow/Deny
 * pair when the harness sends none. Mirrors web's `ApprovalCard.tsx`
 * exactly — header copy, body-vs-title mapping, and the fallback's
 * `decision` (not `selected`) resolve path all verified against that
 * source, not invented.
 */
export function MobilePermissionInteractionCard({
  row,
  resolving,
  onSelectOption,
  onDecision,
}: MobilePermissionInteractionCardProps) {
  const options = permissionCardOptions(row.options);

  return (
    <MobileInteractionCardShell
      icon="shield"
      accentColor={colors.warning}
      title="Permission request"
    >
      {/* design-system.md §10: "the request body as a wrapping mono
          snippet on terminalBg (max-height, scrollable)". */}
      <ScrollView style={styles.bodyBox} nestedScrollEnabled>
        <Text style={styles.bodyText}>{row.title}</Text>
      </ScrollView>
      <View style={styles.optionList}>
        {options.map((option, index) => (
          <MobileInteractionOptionRow
            key={option.key}
            index={index}
            label={option.label}
            tone={option.destructive ? "negative" : "positive"}
            disabled={resolving}
            onPress={() => {
              if (option.resolve === "selected" && option.optionId) {
                onSelectOption(row.requestId, option.optionId);
              } else if (option.resolve === "decision" && option.decision) {
                onDecision(row.requestId, option.decision);
              }
            }}
          />
        ))}
      </View>
    </MobileInteractionCardShell>
  );
}

const styles = StyleSheet.create({
  bodyBox: {
    maxHeight: 160,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceControl,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
  },
  bodyText: {
    color: colors.fg,
    fontSize: 12.5,
    lineHeight: 18,
    ...monoTextStyle,
  },
  optionList: {
    gap: spacing[1],
  },
});
