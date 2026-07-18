import { useEffect, useMemo, useState } from "react";
import {
  useCloudAgentCatalog,
  useCloudRepoBranches,
  useRepositories,
} from "@proliferate/cloud-sdk-react";
import {
  buildCloudLaunchComposerControls,
  DEFAULT_DIRECT_PROMPT_AGENT_KIND,
  DEFAULT_DIRECT_PROMPT_MODEL_ID,
  resolveCloudLaunchSelection,
  type CloudLaunchComposerSelection,
} from "@proliferate/product-domain/chats/cloud/composer-controls";
import {
  resolveCloudHarnessAvailability,
} from "@proliferate/product-domain/chats/cloud/harness-availability";

import {
  buildMobileRepoOptions,
  buildMobileBranchOptions,
  buildMobileRuntimeOptions,
  resolveMobileSelectedBaseBranch,
} from "../../../lib/domain/home/mobile-home-launch";
import {
  resolveMobileModelAvailabilityState,
  type MobileModelAvailabilityState,
} from "../../../lib/domain/home/mobile-home-launch-enablement";

export function useMobileHomeLaunchModel() {
  const [repoId, setRepoId] = useState("");
  const [baseBranchByRepoId, setBaseBranchByRepoId] = useState<Record<string, string>>({});
  const [runtimeId, setRuntimeId] = useState("cloud");
  const [launchSelection, setLaunchSelection] = useState<CloudLaunchComposerSelection>({
    agentKind: DEFAULT_DIRECT_PROMPT_AGENT_KIND,
    modelId: DEFAULT_DIRECT_PROMPT_MODEL_ID,
    modeId: null,
    controlValues: {},
  });
  const repoConfigs = useRepositories();
  const agentCatalog = useCloudAgentCatalog();
  const configuredCloudRepos = useMemo(
    () => (repoConfigs.data?.repositories ?? []).flatMap((repo) => {
      const cloudEnvironment = repo.environments.find((environment) =>
        environment.kind === "cloud"
      );
      if (!cloudEnvironment) {
        return [];
      }
      return [{
        gitOwner: repo.gitOwner,
        gitRepoName: repo.gitRepoName,
      }];
    }),
    [repoConfigs.data?.repositories],
  );
  const repoOptions = useMemo(
    () => buildMobileRepoOptions(configuredCloudRepos),
    [configuredCloudRepos],
  );
  const runtimeOptions = useMemo(
    () => buildMobileRuntimeOptions(),
    [],
  );
  const selectedRepo = repoOptions.find((repo) => repo.id === repoId) ?? repoOptions[0] ?? null;
  const repoBranches = useCloudRepoBranches(
    selectedRepo?.gitOwner,
    selectedRepo?.gitRepoName,
    Boolean(selectedRepo),
  );
  const selectedBaseBranchOverride = selectedRepo ? baseBranchByRepoId[selectedRepo.id] ?? null : null;
  const branchOptions = useMemo(
    () => buildMobileBranchOptions({
      branches: repoBranches.data?.branches,
      defaultBranch: repoBranches.data?.defaultBranch,
      selectedBranch: selectedBaseBranchOverride,
    }),
    [repoBranches.data?.branches, repoBranches.data?.defaultBranch, selectedBaseBranchOverride],
  );
  const selectedBaseBranch = resolveMobileSelectedBaseBranch({
    overrideBranch: selectedBaseBranchOverride,
    defaultBranch: repoBranches.data?.defaultBranch,
    branchOptions,
  });
  const selectedRuntime =
    runtimeOptions.find((runtime) => runtime.id === runtimeId) ?? runtimeOptions[0] ?? null;
  const catalogAgentKindsKey = agentCatalog.data?.agents.map((agent) => agent.kind).join("\0") ?? "";
  const harnessAvailability = useMemo(() => resolveCloudHarnessAvailability({
    catalogAgentKinds: agentCatalog.data?.agents.map((agent) => agent.kind),
  }), [
    agentCatalog.data,
    catalogAgentKindsKey,
  ]);
  const launchableAgentKinds = harnessAvailability.launchableAgentKinds;
  // Mirrors web's `modelAvailabilityState` (product-client
  // `use-home-next-model-selection.ts` → `resolveHomeModelAvailabilityState`):
  // an in-flight/undefined catalog must resolve to "loading", not silently
  // fall through `resolveCloudHarnessAvailability`'s "no kinds listed yet ⇒
  // treat everything as launchable" default — that default exists for the
  // *allowed*-kinds case, not for "the catalog hasn't loaded".
  const modelAvailabilityState: MobileModelAvailabilityState = useMemo(
    () => resolveMobileModelAvailabilityState({
      isLoading: agentCatalog.isLoading,
      hasLoadError: agentCatalog.isError,
      hasLaunchableModel: launchableAgentKinds.length > 0,
    }),
    [agentCatalog.isLoading, agentCatalog.isError, launchableAgentKinds],
  );
  const resolvedLaunchSelection = useMemo(
    () => resolveCloudLaunchSelection({
      catalog: agentCatalog.data,
      launchableAgentKinds,
      selection: launchSelection,
    }),
    [agentCatalog.data, launchSelection, launchableAgentKinds],
  );
  const launchComposerControls = useMemo(
    () => buildCloudLaunchComposerControls({
      catalog: agentCatalog.data,
      launchableAgentKinds,
      selection: resolvedLaunchSelection,
      onAgentModelSelect: (agentKind, modelId) => {
        setLaunchSelection((current) => ({
          agentKind,
          modelId,
          modeId: current.agentKind === agentKind ? current.modeId : null,
          controlValues: current.agentKind === agentKind ? current.controlValues : {},
        }));
      },
      onControlSelect: ({ controlKey, value }) => {
        setLaunchSelection((current) => {
          if (controlKey === "mode") {
            return { ...current, modeId: value };
          }
          return {
            ...current,
            controlValues: {
              ...current.controlValues,
              [controlKey]: value,
            },
          };
        });
      },
    }),
    [agentCatalog.data, launchableAgentKinds, resolvedLaunchSelection],
  );

  useEffect(() => {
    if (!repoId && repoOptions[0]) {
      setRepoId(repoOptions[0].id);
    }
  }, [repoId, repoOptions]);

  useEffect(() => {
    if (!runtimeOptions.some((runtime) => runtime.id === runtimeId)) {
      setRuntimeId("cloud");
    }
  }, [runtimeId, runtimeOptions]);

  return {
    agentCatalog,
    launchableAgentKinds,
    modelAvailabilityState,
    launchComposerControls,
    branchOptions,
    repoBranches,
    repoConfigs,
    repoId,
    repoOptions,
    resolvedLaunchSelection,
    runtimeId,
    runtimeOptions,
    selectedRepo,
    selectedBaseBranch,
    selectedRuntime,
    setBaseBranch: (branch: string) => {
      if (!selectedRepo) {
        return;
      }
      setBaseBranchByRepoId((current) => ({
        ...current,
        [selectedRepo.id]: branch,
      }));
    },
    setRepoId,
    setRuntimeId,
  };
}
