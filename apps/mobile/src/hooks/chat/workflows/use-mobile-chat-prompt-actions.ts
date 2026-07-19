import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { usePromptSessionTextMutation } from "@anyharness/sdk-react";
import type {
  CloudSessionProjection,
  CloudTranscriptItem,
  CloudWorkspaceDetail,
} from "@proliferate/cloud-sdk";
import {
  buildLaunchSessionConfigUpdates,
  resolveCloudLaunchSelection,
  type CloudLaunchComposerSelection,
} from "@proliferate/product-domain/chats/cloud/composer-controls";
import { latestCloudTranscriptSeq } from "@proliferate/product-domain/chats/cloud/transcript-view";
import type { CloudChatTranscriptRowView } from "@proliferate/product-domain/chats/cloud/transcript-view";
import { cloudCommandReadiness } from "@proliferate/product-domain/workspaces/cloud-work-inventory";

import type { MobilePendingPrompt } from "../../../lib/domain/workspace/mobile-workspace-chat";
import { savePendingMobilePrompt } from "../../../lib/access/cloud/pending-mobile-prompt-store";
import { isMobileCloudSandboxWorkspace } from "../../../lib/access/anyharness/cloud-sandbox-runtime";
import type { OptimisticPrompt } from "../../../lib/domain/chat/mobile-chat-transcript";
import { useMobileToast } from "../../../providers/MobileToastProvider";

type CloudLaunchCatalog = Parameters<typeof resolveCloudLaunchSelection>[0]["catalog"];
type CloudLaunchableAgentKinds = Parameters<typeof resolveCloudLaunchSelection>[0]["launchableAgentKinds"];

export function useMobileChatPromptActions({
  ownerUserId,
  workspace,
  session,
  draft,
  pendingPrompt,
  pendingPromptFailed,
  hasActiveOptimisticPrompt,
  isUnclaimed,
  canStartNewSession,
  workspaceHarnessAvailabilityMessage,
  workspaceLaunchableAgentKinds,
  resolvedLaunchSelection,
  catalog,
  transcriptItems,
  transcriptRows,
  setDraft,
  setPendingPrompt,
  setPendingPromptStatus,
  setPendingPromptFailed,
  setOptimisticPrompts,
  transcriptRefetch,
  sessionEventsRefetch,
}: {
  ownerUserId: string | null;
  workspace: CloudWorkspaceDetail | null;
  session: CloudSessionProjection | null;
  draft: string;
  pendingPrompt: MobilePendingPrompt | null;
  pendingPromptFailed: boolean;
  hasActiveOptimisticPrompt: boolean;
  isUnclaimed: boolean;
  canStartNewSession: boolean;
  workspaceHarnessAvailabilityMessage?: string | null;
  workspaceLaunchableAgentKinds: CloudLaunchableAgentKinds;
  resolvedLaunchSelection: CloudLaunchComposerSelection;
  catalog: CloudLaunchCatalog;
  transcriptItems: readonly CloudTranscriptItem[];
  transcriptRows: readonly CloudChatTranscriptRowView[];
  setDraft: Dispatch<SetStateAction<string>>;
  setPendingPrompt: Dispatch<SetStateAction<MobilePendingPrompt | null>>;
  setPendingPromptStatus: Dispatch<SetStateAction<string | null>>;
  setPendingPromptFailed: Dispatch<SetStateAction<boolean>>;
  setOptimisticPrompts: Dispatch<SetStateAction<OptimisticPrompt[]>>;
  transcriptRefetch: () => void | Promise<unknown>;
  sessionEventsRefetch: () => void | Promise<unknown>;
}) {
  const [directPromptDispatching, setDirectPromptDispatching] = useState(false);
  const directPromptDispatchingRef = useRef(false);
  const sessionPromptDispatchingRef = useRef(false);
  const promptSessionTextMutation = usePromptSessionTextMutation();
  const toast = useMobileToast();

  async function submitPrompt() {
    const text = draft.trim();
    if (!text || !workspace) {
      return;
    }
    if (isUnclaimed) {
      setPendingPromptStatus("Claim this workspace before sending prompts from mobile.");
      return;
    }
    const readiness = cloudCommandReadiness(workspace);
    if (!readiness.commandable) {
      setPendingPromptStatus(readiness.message ?? "This workspace cannot accept cloud commands right now.");
      return;
    }
    if (!isMobileCloudSandboxWorkspace(workspace)) {
      setPendingPromptStatus("Cloud workspace runtime is unavailable.");
      return;
    }
    if (!session) {
      await submitPendingSessionPrompt(text);
      return;
    }
    await submitExistingSessionPrompt(text, session);
  }

  async function submitPendingSessionPrompt(text: string) {
    if (!ownerUserId) {
      setPendingPromptStatus("Account is still loading. Try again in a moment.");
      return;
    }
    if (!workspace) {
      return;
    }
    if (directPromptDispatchingRef.current || (pendingPrompt && !pendingPromptFailed)) {
      return;
    }
    if (!canStartNewSession) {
      setPendingPromptStatus(
        workspaceHarnessAvailabilityMessage ?? "No cloud agent is ready for a new session.",
      );
      return;
    }
    const promptSelection = resolveCloudLaunchSelection({
      catalog,
      launchableAgentKinds: workspaceLaunchableAgentKinds,
      selection: resolvedLaunchSelection,
    });
    directPromptDispatchingRef.current = true;
    const prompt: MobilePendingPrompt = {
      id: `mobile-chat:${workspace.id}:${Date.now().toString(36)}`,
      text,
      agentKind: promptSelection.agentKind,
      modelId: promptSelection.modelId,
      modeId: promptSelection.modeId,
      sessionConfigUpdates: buildLaunchSessionConfigUpdates({
        catalog,
        launchableAgentKinds: workspaceLaunchableAgentKinds,
        selection: promptSelection,
      }),
      createdAt: Date.now(),
    };
    setDraft("");
    setPendingPrompt(prompt);
    setPendingPromptStatus("Starting a session for this prompt.");
    setPendingPromptFailed(false);
    setDirectPromptDispatching(true);
    try {
      await savePendingMobilePrompt(workspace.id, ownerUserId, prompt);
    } catch (error) {
      setPendingPromptStatus(
        error instanceof Error
          ? `Prompt will send while this chat stays open. Storage failed: ${error.message}`
          : "Prompt will send while this chat stays open, but could not be saved.",
      );
    } finally {
      directPromptDispatchingRef.current = false;
      setDirectPromptDispatching(false);
    }
  }

  async function submitExistingSessionPrompt(
    text: string,
    activeSession: CloudSessionProjection,
  ) {
    if (!workspace) {
      return;
    }
    if (sessionPromptDispatchingRef.current || hasActiveOptimisticPrompt) {
      return;
    }
    sessionPromptDispatchingRef.current = true;
    const optimisticPrompt: OptimisticPrompt = {
      id: `mobile:${workspace.id}:${activeSession.sessionId}:${Date.now()}`,
      sessionId: activeSession.sessionId,
      text,
      baseTranscriptSeq: latestCloudTranscriptSeq(transcriptItems, transcriptRows),
      status: "sending",
    };
    setOptimisticPrompts((current) => [...current, optimisticPrompt]);
    setDraft("");
    setPendingPromptStatus(null);
    try {
      // Reuse the shared SDK hook (never hand-roll the API call): the
      // runtime queues this automatically when the agent is busy, so the
      // same call path covers both "send" and "queue" from the composer's
      // point of view.
      await promptSessionTextMutation.mutateAsync({
        sessionId: activeSession.sessionId,
        text,
      });
      setOptimisticPrompts((current) =>
        current.map((prompt) =>
          prompt.id === optimisticPrompt.id
            ? { ...prompt, status: "queued" }
            : prompt
        )
      );
      void transcriptRefetch();
      void sessionEventsRefetch();
    } catch (error) {
      // Mark the optimistic row failed (not silently dropped) and surface a
      // toast — no desync between what the composer implies happened and
      // what actually reached the runtime.
      setOptimisticPrompts((current) =>
        current.map((prompt) =>
          prompt.id === optimisticPrompt.id ? { ...prompt, status: "failed" } : prompt
        )
      );
      const message = error instanceof Error ? error.message : "Prompt could not be sent.";
      setPendingPromptStatus(message);
      toast.show({ tone: "error", message });
    } finally {
      sessionPromptDispatchingRef.current = false;
    }
  }

  return {
    promptSubmitting:
      directPromptDispatching
      || (Boolean(pendingPrompt) && !pendingPromptFailed)
      || hasActiveOptimisticPrompt,
    submitPrompt,
  };
}
