import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { UserInputQuestion, UserInputSubmittedAnswer } from "@anyharness/sdk";

import {
  buildUserInputAnswer,
  OTHER_OPTION_LABEL,
  userInputAllowsDraftText,
  userInputQuestionOptions,
  type UserInputDraft,
} from "../../../../lib/domain/chat/mobile-chat-interaction-cards";
import type { UserInputInteractionRow } from "../../../../lib/domain/chat/mobile-live-transcript-view";
import { MobileTextInput } from "../../../primitives/MobileTextInput";
import { colors, spacing } from "../../../../styles/tokens";
import {
  MobileInteractionCardFooter,
  MobileInteractionCardShell,
  MobileInteractionOptionRow,
} from "./MobileInteractionCardShell";

interface MobileUserInputInteractionCardProps {
  row: UserInputInteractionRow;
  resolving: boolean;
  onSubmit: (requestId: string, answers: UserInputSubmittedAnswer[]) => void;
  onCancel: (requestId: string) => void;
}

/**
 * Group E3 — the user_input interaction card (design-system.md §10
 * "Question card (web `UserInputCard`)"): tint accent bar, wizard over
 * questions with "{i} of {n}" context, option rows with label +
 * description, synthetic last row "None of the above — Write a custom
 * answer" opening a free-text field (secure field when `isSecret`),
 * footer "Cancel" / "Back" / "Next" / "Submit". Selecting a real option
 * auto-advances (submits on the last question) exactly like web's
 * `UserInputCard.tsx`, ported here since RN can't import that component.
 */
export function MobileUserInputInteractionCard({
  row,
  resolving,
  onSubmit,
  onCancel,
}: MobileUserInputInteractionCardProps) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, UserInputDraft>>(() =>
    Object.fromEntries(
      row.questions.map((question) => [question.questionId, { selectedOptionLabel: null, text: "" }]),
    ),
  );

  const questions = row.questions;
  const currentQuestion: UserInputQuestion | null = questions[questionIndex] ?? null;
  const progressContext = questions.length > 1
    ? `${Math.min(questionIndex + 1, questions.length)} of ${questions.length}`
    : null;
  const isFirst = questionIndex === 0;
  const isLast = questionIndex >= questions.length - 1;

  if (!currentQuestion) {
    return (
      <MobileInteractionCardShell accentColor={colors.info} title={row.title} context={progressContext}>
        <MobileInteractionCardFooter
          secondaryActions={[{ label: "Cancel", onPress: () => onCancel(row.requestId) }]}
          disabled={resolving}
        />
      </MobileInteractionCardShell>
    );
  }

  const draft: UserInputDraft = drafts[currentQuestion.questionId] ?? { selectedOptionLabel: null, text: "" };
  const options = userInputQuestionOptions(currentQuestion);
  const showTextInput = userInputAllowsDraftText(currentQuestion, draft.selectedOptionLabel);

  function updateDraft(patch: Partial<UserInputDraft>) {
    if (!currentQuestion) return;
    setDrafts((current) => ({
      ...current,
      [currentQuestion.questionId]: { ...draft, ...patch },
    }));
  }

  function answersWithOverride(questionId: string, override: UserInputDraft): UserInputSubmittedAnswer[] {
    return questions.map((question) =>
      buildUserInputAnswer(
        question,
        question.questionId === questionId ? override : drafts[question.questionId] ?? { selectedOptionLabel: null, text: "" },
      )
    );
  }

  function chooseOption(index: number) {
    if (!currentQuestion) return;
    const option = options[index];
    if (!option) return;
    const isSynthetic = option.label === OTHER_OPTION_LABEL;
    const nextDraft: UserInputDraft = {
      selectedOptionLabel: option.label,
      text: isSynthetic ? draft.text : "",
    };
    updateDraft(nextDraft);
    if (isSynthetic) {
      // Opens the free-text field instead of advancing.
      return;
    }
    if (isLast) {
      onSubmit(row.requestId, answersWithOverride(currentQuestion.questionId, nextDraft));
    } else {
      setQuestionIndex((current) => Math.min(questions.length - 1, current + 1));
    }
  }

  function handleAdvance() {
    if (!currentQuestion) return;
    if (isLast) {
      onSubmit(row.requestId, answersWithOverride(currentQuestion.questionId, draft));
      return;
    }
    setQuestionIndex((index) => Math.min(questions.length - 1, index + 1));
  }

  const showHeaderLine = Boolean(currentQuestion.header && currentQuestion.header !== row.title);

  return (
    <MobileInteractionCardShell accentColor={colors.info} title={row.title} context={progressContext}>
      {(showHeaderLine || currentQuestion.question) ? (
        <View style={styles.bodyGroup}>
          {showHeaderLine ? <Text style={styles.bodyHeader}>{currentQuestion.header}</Text> : null}
          {currentQuestion.question ? <Text style={styles.bodyQuestion}>{currentQuestion.question}</Text> : null}
        </View>
      ) : null}

      <View style={styles.optionList}>
        {options.map((option, index) => (
          <MobileInteractionOptionRow
            key={option.label}
            index={index}
            label={option.label}
            description={option.description}
            tone="neutral"
            selected={draft.selectedOptionLabel === option.label}
            disabled={resolving}
            onPress={() => chooseOption(index)}
          />
        ))}
      </View>

      {showTextInput ? (
        <MobileTextInput
          multiline={!currentQuestion.isSecret}
          secureTextEntry={currentQuestion.isSecret}
          value={draft.text}
          onChangeText={(text) => updateDraft({ text })}
          placeholder={draft.selectedOptionLabel === OTHER_OPTION_LABEL ? "Write a custom answer" : "Enter your answer"}
          editable={!resolving}
        />
      ) : null}

      <MobileInteractionCardFooter
        secondaryActions={[
          { label: "Cancel", onPress: () => onCancel(row.requestId) },
          ...(isFirst ? [] : [{ label: "Back", onPress: () => setQuestionIndex((index) => Math.max(0, index - 1)) }]),
        ]}
        primaryAction={{ label: isLast ? "Submit" : "Next", onPress: handleAdvance, busy: resolving }}
        disabled={resolving}
      />
    </MobileInteractionCardShell>
  );
}

const styles = StyleSheet.create({
  bodyGroup: {
    gap: 2,
  },
  bodyHeader: {
    color: colors.fg,
    fontSize: 14.5,
    fontWeight: "600",
  },
  bodyQuestion: {
    color: colors.mutedForeground,
    fontSize: 14.5,
    lineHeight: 20,
  },
  optionList: {
    gap: spacing[1],
  },
});
