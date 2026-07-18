# Proliferate Mobile — Information Architecture

Cloud-only iOS app against `https://proliferate.theitdept.au`. Goal: **full feature parity with the web client** (`apps/packages/product-client/src`), reshaped for one hand and for the push → approve → continue loop. Companion docs: `design-system.md` (material/tokens), `mockups.html` (visuals; frame letters A–L referenced below).

---

## 1. Navigation model

```
Root (authenticated)
│
├── TAB BAR (Liquid Glass, floating; minimizes on scroll)
│   ├── Home                     [stack]   frame A
│   ├── Workspaces  (badge = pending-interaction count)  [stack]  frame C
│   ├── Automations              [stack]   frame J
│   └── Settings                 [stack]
│
├── Workspace Shell  — pushed full-screen from any tab (hides tab bar)
│   ├── header: back · title · ellipsis  +  CONTEXT CAPSULE (repo · branch · status)
│   └── glass segmented control:
│       ├── Sessions   frame E
│       ├── Chat       frame F / L
│       ├── Term       frame G
│       └── Diff       frame H
│
├── SHEETS (glass chrome + opaque body)
│   ├── Session setup (agent/model + session controls)      frame B
│   ├── Repo picker · Branch picker (search, "Base branch")
│   ├── Session switcher (same content as Sessions segment, quick access)
│   ├── Tool detail / interaction detail
│   ├── Publish (Commit / Publish branch / Create PR)
│   ├── Terminal roster (rename, close, New terminal)
│   ├── Workspace actions (ellipsis: rename, archive, delete, copy branch, open PR)
│   ├── Slash commands · @-mention file search
│   ├── Automation editor (title, schedule, repo, prompt, enable)
│   └── Auth: agent setup (install / API key / CLI login terminal)   frame I
│
└── AUTH FLOW (pre-tab): Sign in → Connect GitHub → Onboarding
```

**Modality rules.** Pushes = places (workspace shell, settings panes, run history). Sheets = decisions and pickers. Full-screen covers only for auth. Alerts only for destructive confirms (web copy reused verbatim, e.g. delete-workspace "cannot be undone").

**Why four tabs.** Home is the composer ("What should we build?") — the fastest path to new work. Workspaces is the inventory and the attention queue (badge). Automations and Settings complete the web's top-level surfaces. Sessions/chat/terminal/changes are *workspace-scoped* on the web too — they belong inside the shell, not the tab bar.

### Deep links & push

| Route | Target |
|---|---|
| `proliferate://home` | Home tab |
| `proliferate://workspace/{id}` | Shell · last-active segment |
| `proliferate://workspace/{id}/session/{sid}` | Shell · Chat |
| `proliferate://workspace/{id}/session/{sid}?interaction={iid}` | Chat scrolled to card, focused ring (frame L) |
| `proliferate://workspace/{id}/terminal/{tid}` | Shell · Term |
| `proliferate://workspace/{id}/changes` | Shell · Diff |
| `proliferate://automation/{id}/run/{rid}` | Run detail → its session |
| `proliferate://settings/agents/{kind}` | Agent setup sheet |

Push categories (actionable, Notification Service Extension resolves without app launch — frame K):

| Category | Body | Actions |
|---|---|---|
| `interaction.permission` | tool + mono command + workspace | **Allow**, **Deny**, Open |
| `interaction.question` / `interaction.elicitation` | question/server + workspace | Open (answers need UI) |
| `session.finished` / `session.failed` | outcome summary | Open, View changes |
| `pr.status` | PR # + new status (checks failing, merged…) | Open PR, Open workspace |
| `automation.run` | run outcome | Open session |

---

## 2. Screen inventory (with gestures, empty/loading/error per screen)

### 2.1 Home (frame A, B)
- **Content:** date eyebrow; hero "What should we build?" / "What should we build in {repo}?" (repo name = inline switcher); repo + branch pills; composer ("Describe a task, @mention files, run /commands"); config summary line → Session setup sheet; Recent list (attention first).
- **Session setup sheet (B):** harness → model catalog grouped like the web model selector (search at >8 models); session controls per harness — Permissions (claude: Default / Accept Edits / Auto / Plan / Don't Ask / Bypass; codex: Read Only / Auto / Full Access; opencode: Build / Plan), Reasoning effort (bars + tier label incl. X High/Max/Ultra tones), Fast mode, Subagents toggle.
- **Gestures:** pull-down on hero → search all workspaces; long-press recent card → management menu; swipe recent card → Archive.
- **Empty:** no repos → onboarding cards ("Add a GitHub repo", "Configure default harnesses", "Configure your repo", model-probe card states). **Loading:** skeleton pills + disabled composer ("Waiting for workspace" copy family). **Error:** model availability notices verbatim — "Finish agent setup to start a chat." → Agents; "Models are unavailable right now. Try again in a moment."

### 2.2 Workspaces (frames C, D)
- **Content:** filter field; recency buckets (Today / Yesterday / This week / This month / Older); cards: name, `repo · branch` mono, relative time, status pill, PR badge (`#n` + Open / Checks failing / Checks pending / Changes requested / Draft / Merged / Closed), ahead/behind `↑2 ↓1`, activity preview line; attention cards get warning accent bar; glass FAB = new workspace (→ Home composer with repo preselected).
- **Status vocabulary** (from sidebar model): Error, Waiting for input, Waiting for plan approval, Iterating, Queued prompt(s), Materializing, Needs attention + cloud runtime states (pending/provisioning/running/paused/error/disabled).
- **Gestures:** swipe left → Archive / Delete; swipe right → Open chat; long-press → context menu (Open, New session, Rename…, Open pull request #n, Copy branch name, Archive…, Delete workspace…); pull-to-refresh.
- **Empty:** "No workspaces yet — describe a task on Home to start one." **Loading:** 3 skeleton cards. **Error:** inline retry card; per-row `gh` note "PR status unavailable" when applicable. **Edge:** unclaimed shared workspaces show Claim button; repo-access loss shows locked banner with reason (commanding disabled).

### 2.3 Workspace shell (E–H)
Header: back, session/workspace title, ellipsis (workspace actions sheet). **Context capsule** always present. Segmented: Sessions / Chat / Term / Diff with per-segment attention badges. Swipe left/right anywhere on content edge to move between segments.

**Sessions (E):** Active/Earlier groups; rows = agent-kind icon, title, status line ("Waiting for input · Permission request", "Iterating · claude · Sonnet 4.6", "Closed · yesterday", "Hidden"), unread dot; subagent children indented with trailing "Wake scheduled" / "Working" / "Failed"; review-agent children disabled ("Review agents are managed by the review run"). New session (primary button) → composer in new-session mode. Long-press row: Rename, Hide, Close.
- Empty: "No sessions yet — send a prompt to start one." Loading: "Loading history". Error: retry row.

**Chat (F, L):** transcript rows — user_message (bubble), assistant_prose, thought (collapsed eyebrow chip), tool_call rows (mono, diff counts; tap → tool detail sheet), tool groups (collapsed "Work history"), plan / proposed_plan cards (status chips Awaiting approval / Approved / Rejected / Superseded / Failed; actions Approve, Reject, Run here, New session), per-turn diff cards (tap → Diff segment), mode-transition dividers, subagent creation groups + wake badges, error rows.
- **Interaction cards** (shared shell, §10 design-system): Permission request (harness options, numbered; fallback Allow/Deny), UserInputCard wizard ("{i} of {n}", option descriptions, "None of the above → Write a custom answer", secret input support; footer Cancel/Back/Next/Submit), MCP elicitation (URL mode: Destination + Reveal URL/Decline/Accept; form mode: typed fields), Tasks panel ("{done} of {total} done"), queued-prompt list (reorder ↑↓, steer "Send next — interrupts the current turn", edit, delete), prompt recovery panel.
- **Composer dock:** draft field ("Message this session" / "Start a session with a message" / "Choose a session or start a new one" / "Waiting for workspace"), model chip, mode pill, send↔stop morph; overflow (+): attach (post-session only — web tooltip copy), slash commands, goal, integrations status, workspace status card (Source control / Subagents / Agents & terminals / Resources / Advanced).
- Streaming labels verbatim: "Thinking", "Steering…", "Restoring session…". Empty: "Ready when you are". Loading phases: "Preparing workspace" / "Opening session" / "Connecting" / "Loading history". Error: failed-delivery banner with retry; claim banner when unclaimed.

**Term (G):** full-bleed PTY on `terminalBg`; glass key-accessory row (esc ⇥ ⌃ ⌥ / – arrows); clear-glass Interrupt; status line "Terminal 1 · 80×24 · connected"; roster sheet (rename inline ≤160 chars, close when runtime ready, "New terminal", unread dots, "No terminals" empty); font-size stepper; disabled until runtime ready ("New terminal" greyed).
- States: connecting spinner over field; exited shows `exited (code)` line + Restart; disconnected → reconnect banner.

**Diff (H):** modes Working tree (Unstaged/Staged sections) / Branch (base selector) / Last turn (undo with confirm copy verbatim); aggregate `+adds −dels`; jump-to-file; per-file rows; unified/split toggle, wrap lines, collapse all; diff on terminal field with gutter glyphs; PR row with status badge.
- **Publish sheet:** intents Commit ("Commit message (leave blank to generate)…", "Include unstaged changes") / Publish branch / Create–Update pull request (title, description, base branch, Draft switch, "View pull request").
- Empty per mode verbatim: "Working tree clean", "No staged changes", "No branch changes", "No file changes in last turn". Loading: 3 skeleton file cards ("Loading changes"). Error: retry + refresh in options menu.

### 2.4 Automations (J)
List: title, cron/summary mono chip, repo, enable/pause switch, last-run outcome ("Last run opened PR #479 · 03:04" → Open session; failures on-card → View run), next-run line. FAB → editor sheet (title, schedule, repo, prompt, enabled). Run detail: run list → each opens its session (web `onOpenSession`). Gated states reuse workflow copy: "Sign in to use workflows" etc. Empty: "No automations yet — schedule an agent to run while you sleep." *(Field-level definitions UI derives from `@proliferate/product-surfaces` workflows — flagged dependency.)*

### 2.5 Settings
Grouped list mirroring web sections: **Account** (email, Google link, GitHub App), **General** (branch prefix, default open-in, long-paste attachments, turn-end sound, subagents policy), **Appearance** (Mode Dark/Light/System, UI/code font size; no window-zoom — desktop-only), **Repositories** (per-repo Configure / Actions / Environment, cloud gates), **Agents** (→ 2.6), **Personal secrets**, **Integrations** (rows + connect dialogs, reauth warnings), **Organization** (admin: settings, members, billing, usage & limits, secrets, integrations, model policy, SSO), **Support**, **Sign out**. Desktop-only panes (Pruning/worktrees, Desktop updates, Transparent chrome) are intentionally absent — documented N/A. Error shell: "Settings couldn't be displayed" / "Try again" / "Show details".

### 2.6 Agents & models (I)
Per-harness cards (Claude Code, Codex, OpenCode, Grok; Cursor native-only note): auth method chips — **Proliferate gateway** ("Proliferate-managed model access. No setup required." / "Unavailable for your account" / enrollment states), **API key** ("Saved in Keychain" + Change, paste field), **CLI login** ("CLI not authenticated" / "Authenticated") with on-device **auth terminal** (status: Opening/Running/Exited n/Failed/Needs retry; Restart auth / Close) for cloud device-code login; org-policy lock tooltip. Install/retry section with error paths. "All Models" catalog: refresh, probe freshness ("seed" / "probed {time}"), Recommended badge. Restart notice + "Apply & Restart Runtime" verbatim.

### 2.7 Auth flow
Sign in (Apple / Google / GitHub / email+password) → Connect GitHub (required) → onboarding (repo step, cards). Errors inline; bootstrapping spinner "Opening Proliferate".

---

## 3. Web surface → mobile parity map

| # | Web surface (product-client) | Mobile home | Notes |
|---|---|---|---|
| 1 | Home hero + HomeComposerForm | Home tab (A) | hero copy verbatim |
| 2 | HomeProjectMenu / repo picker | repo pill → picker sheet | includes "Add repository" |
| 3 | Runtime picker (local/worktree/cloud/SSH) | **collapsed** — cloud fixed | cloud-only app; local/SSH rows never shown |
| 4 | Branch picker | branch pill → sheet | search, "Loading branches", "No branches found" |
| 5 | Home onboarding cards + model notices | Home empty/notice states | copy verbatim |
| 6 | Deferred launch + draft-handoff stores | same stores via cloud-sdk | pending prompt survives app kill (existing mobile pattern) |
| 7 | WorkspacesPage (recency command list) | Workspaces tab (C) | filter field replaces cmdk |
| 8 | Sidebar workspace items + indicators | workspace cards, status pills | full status enum table §2.2 |
| 9 | WorkspaceItemMenu (rename/archive/delete/PR/copy branch) | long-press menu (D) + swipe | destructive confirms verbatim |
| 10 | Availability commands (Add Cloud copy, Open on this Mac, link/relink/unlink, reconcile) | **N/A — desktop runtime ops** | cloud copies auto-managed; reconcile surfaced as status only |
| 11 | Cloud status screen ("Preparing cloud workspace", "Opening automatically when ready", Retry) | Materializing card + full-screen status on open | copy verbatim |
| 12 | Workspace shell (sidebar+topbar+panes+right panel) | Workspace Shell + segmented | right-panel tabs → Term/Diff segments |
| 13 | Chat tabs menu (sessions, subagents, wake/hidden) | Sessions segment (E) + switcher sheet | |
| 14 | ChatView surface states | Chat states | §2.3 |
| 15 | Transcript item kinds + tool-call renderers | transcript rows + tool sheet | |
| 16 | ApprovalCard | Permission card (F) + push actions (K) | options passthrough `{optionId,label,kind}` |
| 17 | UserInputCard | Question wizard card (F) | secret input supported |
| 18 | McpElicitationCard (URL + form) | elicitation card | field types all mapped |
| 19 | PendingPromptList (queue/steer/edit) | queued prompts above dock | drag handle = long-press |
| 20 | Plan / ProposedPlanCard + handoff | plan cards; handoff → New session action | decision states verbatim |
| 21 | TodoTrackerPanel / strip | Tasks strip + expanding panel | |
| 22 | Composer control row (model, reasoning bars, mode, fast, goal, integrations, attach, status) | dock chips + Session setup sheet + overflow | one-tap parity for model/mode |
| 23 | Slash commands + @mentions | composer sheets | grouped, inputHint shown |
| 24 | Workspace status card (source control, subagents, agents/terminals, resources, advanced) | status card sheet from dock | CPU/Memory rows cloud |
| 25 | EnvironmentStatusCard / worktrees modal | Resources section in status sheet | delete-worktree kept |
| 26 | Send/stop/queue button semantics | dock send↔stop morph | "Send message to queue" state |
| 27 | Terminals (panel, top bar roster, new-tab menu) | Term segment (G) + roster sheet | PTY over WebSocket unchanged |
| 28 | Git panel (modes, header, file rows, empty/loading, undo) | Diff segment (H) | undo confirm verbatim |
| 29 | PublishDialog (commit/publish/PR) | Publish sheet | ⌘⏎ list → stacked buttons |
| 30 | PrStatusBadge kinds | PR badge (C, H) | merged purple token added |
| 31 | AgentSetupModal (install/API keys/CLI login) | Agent setup sheet (I) | Keychain → iOS Keychain |
| 32 | HarnessAuthSection (gateway/api_key/cli) | method chips (I) | multi-source opencode honored |
| 33 | AgentLoginTerminalPanel (cloud device-code) | on-device auth terminal (I) | fresh gateway token per reconnect |
| 34 | AgentHarnessModelSelector + All Models | Session sheet + catalog list | probe freshness shown |
| 35 | SettingsPage panes (user/org/repo/actions) | Settings tab | §2.5; desktop-only panes N/A |
| 36 | UserIntegrationsPane + reauth | Settings › Integrations + composer plug | urgent dot parity |
| 37 | WorkflowsPage + definitions/runs surfaces | Automations tab (J) | product-surfaces dependency flagged |
| 38 | Workflow auth-gate copy | Automations gated states | verbatim |
| 39 | Cloud repository-intent / availability-intent stores | OAuth resume on foreground | ASWebAuthenticationSession |
| 40 | Connectivity store | offline banner + queued sends | |
| 41 | Command palette / keyboard shortcuts | **N/A — desktop input** | replaced by search + segments |
| 42 | Cloud start-block reasons (credits, caps, holds) | blocking card on send with billing link | all 7 reasons mapped to copy |

**Deliberate N/A set (cloud-only, touch-only):** local/worktree/SSH runtimes, desktop materialization commands (row 10), desktop updates, window zoom/transparent chrome, keyboard shortcut system, gh-CLI local auth note (server-side PR status only).

---

## 4. Cross-cutting states

- **Offline:** persistent slim banner under header; drafts and interaction answers queue locally with "Queued — will send when online"; transcript reads from cache.
- **Unclaimed shared workspace:** claim banner above transcript (existing mobile pattern), commanding disabled until claimed.
- **Repo access lost:** locked card + reason, no commands (mirrors `accessLossReason`).
- **Runtime paused/asleep:** context capsule dot → busy; first command shows "Waking runtime…" inline.
- **Push while in-app:** in-app glass banner top; tap = same deep link; never a modal.
