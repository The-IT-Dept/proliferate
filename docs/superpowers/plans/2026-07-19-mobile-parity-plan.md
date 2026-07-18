# Mobile Feature Parity — Implementation Plan (Phase 3)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.
> Design: `docs/design/mobile/information-architecture.md` (IA + 42-row parity map) + `mockups.html`. Depends on the Glass system (Phase 2).

**Goal:** Every capability in the web UI, native on mobile — build surface-by-surface until the 42-row parity map is fully covered.

**Architecture:** Native RN screens over the SHARED data layer. The anyharness data comes from `@anyharness/sdk-react` hooks (REST/React-Query) plus, for live transcript/terminal, the plain SDK stream functions wired via `useSyncExternalStore` (there is NO streaming hook — see Global Constraints). Cloud workspace CRUD comes from `@proliferate/cloud-sdk-react`. Navigation per the IA: 4 glass tabs (Home / Workspaces / Automations / Settings); opening a workspace pushes a shell with a glass segmented control (Sessions / Chat / Term / Diff); decisions are sheets.

**Tech Stack:** Expo SDK 56 / RN 0.85, `@proliferate/design` glass layer, `@anyharness/sdk` + `@anyharness/sdk-react`, `@proliferate/cloud-sdk(-react)`, `@proliferate/product-domain`. Tests: vitest node env for logic/derivation hooks + deep-link/parse; screens get a render smoke + manual visual check vs mockups.

## Global Constraints
- **Cloud-only**; reuse the shared data hooks — never re-implement API calls. Providers required at the workspace root: `<QueryClientProvider>`, `<AnyHarnessRuntime runtimeUrl authToken>`, `<AnyHarnessWorkspace workspaceId resolveConnection>` (from `@anyharness/sdk-react`), with `resolveConnection` returning the cloud gateway connection (`{runtimeUrl, authToken, anyharnessWorkspaceId, webSocketAuthTransport}`).
- **Live transcript & terminal have NO React hook.** Use the plain SDK: `streamSession({baseUrl,sessionId,authToken,afterSeq,onEvent})` + the reducer `createTranscriptState`/`reduceEvent` → expose via `useSyncExternalStore`. Terminal: `connectTerminal({baseUrl,terminalId,authToken,webSocketAuthTransport,onData,onExit,onReplayGap})` → `{send,sendResize,close}`. Both `http→ws`, `binaryType=arraybuffer`.
- Parity = the **full 42-row map** in the IA. Each surface below must be provably complete against it; deliberate N/As (local/SSH runtime, desktop materialization, keyboard shortcuts) are the map's listed exclusions.
- Glass on the control layer only; transcript/terminal/diff bodies opaque.
- Copy exact status vocabulary + UI strings from the web client / SDK enums (do not invent labels — e.g. permission options Allow/Deny, PR badge kinds, mode names).

## Surfaces (build order — each is a task group, independently shippable & reviewable)

### Group A: App shell, auth, navigation
Root providers, Sign in with Apple + GitHub against the hosted API, the 4 glass tabs, deep-link routing (`proliferate://workspace/{id}?interaction=`). **Hooks:** existing `apps/mobile/src` auth; `@anyharness/sdk-react` providers. **Tests:** deep-link parse; auth-state reducer. Extends the current mobile shell rather than rebuilding.

### Group B: Home / composer
"What should we build?" — browse repos, pick base branch, create a cloud workspace. **Hooks (cloud-sdk-react):** repositories list, `useCloudRepoBranches`, create-cloud-workspace mutation (mirror the web home composer's `use-create-cloud-workspace`). **Tests:** branch-selection + launch-enablement logic. **Screen:** mockup A.

### Group C: Workspaces list + management
Recency-grouped inventory with attention badge; open/rename/archive/restore/delete. **Hooks:** `useCloudVisibleWorkspaces` + the cloud workspace actions (archive/restore/delete/refresh from `use-cloud-workspace-actions`). **Tests:** grouping + attention-count derivation. **Screen:** mockup B.

### Group D: Workspace shell + Sessions
Full-screen shell, context capsule (repo·branch + status dot), glass segmented Sessions/Chat/Term/Diff; sessions list/create/switch/dismiss. **Hooks:** `useWorkspaceSessionsQuery`, `useCreateSessionMutation`, `useDismissSessionMutation`, `useCloseSessionMutation`, `useSessionQuery`. **Session status:** `SessionExecutionPhase`/`SessionStatus` enums. **Screen:** mockups C/D.

### Group E: Chat / agent transcript + interaction handling (CORE)
Live transcript, pending prompts queue, and the interaction cards (permission / user_input / mcp_elicitation) — the push deep-link target. **Data:** `streamSession` + `reduceEvent` via `useSyncExternalStore`; selectors `selectPrimaryPendingInteraction`/`selectPendingApprovalInteraction`. **Actions:** `usePromptSessionTextMutation`, `useCancelSessionMutation` (interrupt), `useResolveSessionInteractionMutation` (`ResolveInteractionRequest` union: `{outcome:"selected",optionId}` / `{outcome:"submitted",answers}` / `{outcome:"accepted",fields}` / decline/dismiss), `useRevealMcpElicitationUrlMutation`; pending-prompt hooks (edit/delete/reorder/steer). **Render:** the `TranscriptItem` union (user_message/assistant_prose/thought/tool_call/plan/proposed_plan/error) + `ContentPart` union (text/reasoning/tool_call/terminal_output/file_change/plan…). **Tests:** reducer integration (feed a canned `SessionEventEnvelope[]` → assert transcript state + pending interaction); resolve-payload builders. **Screen:** mockup D (permission + question cards). **Highest-risk / largest group — split into sub-tasks: transcript render, prompt composer + queue, permission card, user-input card, mcp-elicitation card, plan/proposed-plan.**

### Group F: Interactive terminal (HARD)
Attach to a workspace terminal, stream I/O, resize. **Data:** `useTerminalsQuery`, `useCreateTerminalMutation`; the PTY via `connectTerminal(...)` → `{send,sendResize,close}`, `onData(Uint8Array)` → a terminal renderer (evaluate `@xterm/xterm` under RN vs a native RN terminal view; `react-native-webview` xterm host is the likely path). Roster sheet from `TerminalRecord[]` (`TerminalStatus`). **Tests:** frame dedupe (drop `seq<=lastSeq`), resize JSON, base64 decode. **Screen:** mockup E. **Flag: highest technical risk — spike the renderer first.**

### Group G: Changes / diffs + PR
Git changes list, file diffs, PR status. **Hooks:** `client.git` + `client.pullRequests` sub-clients (via a thin mobile hook if no sdk-react wrapper); PR badge kinds verbatim. **Tests:** diff-model derivation. **Screen:** mockup F.

### Group H: Agent auth / harness settings
Cloud harness surface: subscription CLI **device-code login terminal** (`connectAgentLoginTerminal`), model catalog, auth methods. Mirror the web harness pane, cloud-only. **Hooks:** `client.agentAuth`, `client.agentGatewayCatalog`, `agents`. **Tests:** login-terminal state. **Screen:** mockup G.

### Group I: Settings + managed workflows
Account/settings panes; view/trigger managed (scheduled) workflows. **Note:** workflow-definition editor UI lives in `@proliferate/product-surfaces` — confirm against that package before building the editor. **Hooks:** managed-workflow endpoints + settings. **Tests:** settings persistence.

### Group J: Parity audit
Walk the 42-row map; assert each row has a mapped, working mobile screen or is a listed N/A. Close gaps found. Fix the two `app.proliferate.ai` refs in `mobile-github-app-callback.test.ts` + its parser to `proliferate.theitdept.au`.

## Per-group task shape
Each group: (1) failing test for the derivation/logic hook(s) with real canned data → (2) implement the hook consuming the named shared SDK hook → (3) build the screen(s) per the mockup → (4) render smoke + `pnpm --filter @proliferate/mobile typecheck` → (5) commit. Keep sub-tasks small enough to review one screen at a time.

## Verification
`pnpm --filter @proliferate/mobile typecheck` + vitest green after each group; each group visually checked against `mockups.html`; the Group J audit proves the full 42-row map; a dev-client build on-device exercises the core loop (create workspace → run agent → resolve a permission).

## Sequencing
A → B → C → D → E → (F, G, H, I in any order) → J. Group E is the biggest; Group F the riskiest (spike first). Glass (Phase 2) must be merged before D onward.
