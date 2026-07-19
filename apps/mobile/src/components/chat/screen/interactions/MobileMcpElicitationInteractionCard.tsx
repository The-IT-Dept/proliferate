import { useState } from "react";
import { StyleSheet, Switch, Text, View } from "react-native";
import type { McpElicitationField, McpElicitationSubmittedField } from "@anyharness/sdk";

import {
  buildMcpElicitationSubmittedFields,
  initialMcpElicitationDrafts,
  type McpDraftValue,
  type McpDrafts,
} from "../../../../lib/domain/chat/mobile-chat-interaction-cards";
import type { McpElicitationInteractionRow } from "../../../../lib/domain/chat/mobile-live-transcript-view";
import { MobileTextInput } from "../../../primitives/MobileTextInput";
import { colors, spacing } from "../../../../styles/tokens";
import {
  MobileInteractionCardFooter,
  MobileInteractionCardShell,
  MobileInteractionOptionRow,
} from "./MobileInteractionCardShell";

interface MobileMcpElicitationInteractionCardProps {
  row: McpElicitationInteractionRow;
  resolving: boolean;
  onAccept: (requestId: string, fields: McpElicitationSubmittedField[]) => void;
  onDecline: (requestId: string) => void;
  onCancel: (requestId: string) => void;
  onRevealUrl: (requestId: string) => Promise<string | null>;
}

/**
 * Group E3 — the MCP elicitation interaction card (design-system.md §10
 * "MCP elicitation card"): same shell as the other cards; URL mode shows
 * "Destination: {url}" with Reveal URL / Decline / Accept; form mode
 * renders typed fields (boolean, single/multi select, number, text) with
 * required markers. Footer copy (including "Cancel", present on web's
 * `McpElicitationUrlPanel`/`McpElicitationFormPanel` though not spelled
 * out in the design-system prose) is verbatim from those two source
 * components — never invented.
 */
export function MobileMcpElicitationInteractionCard({
  row,
  resolving,
  onAccept,
  onDecline,
  onCancel,
  onRevealUrl,
}: MobileMcpElicitationInteractionCardProps) {
  const mode = row.payload.mode;
  const [drafts, setDrafts] = useState<McpDrafts>(() =>
    mode.mode === "form" ? initialMcpElicitationDrafts(mode.fields ?? []) : {}
  );
  const [error, setError] = useState<string | null>(null);
  const [revealedUrl, setRevealedUrl] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);

  if (mode.mode === "url") {
    // Fix D (E3 Minor, reviewer finding): url mode used to carry its own
    // `setError(null)`/`{error ? ...}` around this action, but nothing in
    // this branch ever sets `error` to anything but `null` — reveal/accept
    // failures already surface via `useMobileToast()` inside
    // `useMobileChatInteractionActions` (`onRevealUrl`/`onAccept`'s own
    // catch blocks). The shared `error` state below is real, load-bearing
    // state for form mode's client-side validation message
    // (`handleSubmit`), which has no toast equivalent — just dead here.
    async function handleReveal() {
      setRevealing(true);
      try {
        const url = await onRevealUrl(row.requestId);
        if (url) setRevealedUrl(url);
      } finally {
        setRevealing(false);
      }
    }

    return (
      <MobileInteractionCardShell accentColor={colors.info} title={row.title} context={row.payload.serverName}>
        <View style={styles.bodyGroup}>
          <Text style={styles.bodyMessage}>{mode.message}</Text>
          <Text style={styles.bodyDestination}>Destination: {mode.urlDisplay}</Text>
          {revealedUrl ? (
            <MobileTextInput value={revealedUrl} editable={false} selectTextOnFocus />
          ) : null}
        </View>
        <MobileInteractionCardFooter
          secondaryActions={[
            { label: "Reveal URL", onPress: () => { void handleReveal(); } },
            { label: "Decline", onPress: () => onDecline(row.requestId) },
            { label: "Cancel", onPress: () => onCancel(row.requestId) },
          ]}
          primaryAction={{ label: "Accept", onPress: () => onAccept(row.requestId, []), busy: resolving }}
          disabled={resolving || revealing}
        />
      </MobileInteractionCardShell>
    );
  }

  const fields = mode.fields ?? [];

  function updateDraft(fieldId: string, value: McpDraftValue) {
    setDrafts((current) => ({ ...current, [fieldId]: value }));
  }

  function handleSubmit() {
    setError(null);
    const result = buildMcpElicitationSubmittedFields(fields, drafts);
    if (typeof result === "string") {
      setError(result);
      return;
    }
    onAccept(row.requestId, result);
  }

  return (
    <MobileInteractionCardShell accentColor={colors.info} title={row.title} context={row.payload.serverName}>
      <View style={styles.bodyGroup}>
        <Text style={styles.bodyMessage}>{mode.message}</Text>
        {fields.map((field) => (
          <McpFieldRow
            key={field.fieldId}
            field={field}
            value={drafts[field.fieldId]}
            disabled={resolving}
            onChange={(value) => updateDraft(field.fieldId, value)}
          />
        ))}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>
      <MobileInteractionCardFooter
        secondaryActions={[
          { label: "Cancel", onPress: () => onCancel(row.requestId) },
          { label: "Decline", onPress: () => onDecline(row.requestId) },
        ]}
        primaryAction={{ label: "Submit", onPress: handleSubmit, busy: resolving }}
        disabled={resolving}
      />
    </MobileInteractionCardShell>
  );
}

function McpFieldRow({
  field,
  value,
  disabled,
  onChange,
}: {
  field: McpElicitationField;
  value: McpDraftValue | undefined;
  disabled: boolean;
  onChange: (value: McpDraftValue) => void;
}) {
  const label = `${field.label}${field.required ? " *" : ""}`;

  if (field.fieldType === "boolean") {
    return (
      <View style={styles.fieldRow}>
        <View style={styles.booleanRow}>
          <Switch
            value={Boolean(value)}
            onValueChange={(next) => onChange(next)}
            disabled={disabled}
          />
          <Text style={styles.fieldLabel}>{label}</Text>
        </View>
        {field.description ? <Text style={styles.fieldDescription}>{field.description}</Text> : null}
      </View>
    );
  }

  if (field.fieldType === "single_select" || field.fieldType === "multi_select") {
    const selected: string[] = field.fieldType === "multi_select"
      ? (Array.isArray(value) ? value : [])
      : (typeof value === "string" && value ? [value] : []);
    return (
      <View style={styles.fieldRow}>
        <Text style={styles.fieldLabel}>{label}</Text>
        <View style={styles.optionList}>
          {(field.options ?? []).map((option, index) => (
            <MobileInteractionOptionRow
              key={option.optionId}
              index={index}
              label={option.label}
              tone="neutral"
              selected={selected.includes(option.optionId)}
              disabled={disabled}
              onPress={() => {
                if (field.fieldType === "multi_select") {
                  onChange(
                    selected.includes(option.optionId)
                      ? selected.filter((id) => id !== option.optionId)
                      : [...selected, option.optionId],
                  );
                } else {
                  onChange(option.optionId);
                }
              }}
            />
          ))}
        </View>
        {field.description ? <Text style={styles.fieldDescription}>{field.description}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <MobileTextInput
        value={typeof value === "string" ? value : ""}
        onChangeText={(text) => onChange(text)}
        keyboardType={field.fieldType === "number" ? "numeric" : "default"}
        editable={!disabled}
      />
      {field.description ? <Text style={styles.fieldDescription}>{field.description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bodyGroup: {
    gap: spacing[2],
  },
  bodyMessage: {
    color: colors.mutedForeground,
    fontSize: 13.5,
    lineHeight: 19,
  },
  bodyDestination: {
    color: colors.faint,
    fontSize: 12.5,
  },
  fieldRow: {
    gap: 4,
  },
  fieldLabel: {
    color: colors.fg,
    fontSize: 13.5,
    fontWeight: "600",
  },
  fieldDescription: {
    color: colors.faint,
    fontSize: 12,
    lineHeight: 16,
  },
  booleanRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing[2],
  },
  optionList: {
    gap: spacing[1],
  },
  errorText: {
    color: colors.destructive,
    fontSize: 12.5,
    lineHeight: 17,
  },
});
