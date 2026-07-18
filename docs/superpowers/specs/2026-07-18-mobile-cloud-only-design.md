# Cloud-Only Mobile — Expo 56 + Liquid Glass + Instant Push — Design (Sub-project B+C)

**Goal:** Bring the existing Expo mobile app (`apps/mobile`) to **full feature
parity with the web client** — every capability a user has in the web UI, native
on mobile — on **Expo SDK 56** with iOS 26 **Liquid Glass**, and add **instant
push notifications** driven from the agent runtime so a user is pinged the moment
a cloud agent needs them (permission, question, input). Cloud-only; no local
runtime. The mobile UX/information-architecture is designed by a **Fable 5**
design agent.

**Architecture:** The mobile app is a native RN client that reuses the shared
non-UI packages (`@proliferate/cloud-sdk`, `@proliferate/cloud-sdk-react`,
`@anyharness/sdk`, `@proliferate/product-domain`, `@proliferate/design`) and
talks only to the hosted control plane at `https://proliferate.theitdept.au`,
reaching cloud sandboxes through the same gateway the web client uses. Push is a
new **runtime → server → device** pipeline. One feature branch, four internal
phases so the app stays shippable.

**Tech stack:** Expo SDK 56 / React Native 0.85 (New Architecture), React 19.2,
`expo-glass-effect`, `expo-notifications`; Python/FastAPI server + Celery;
Rust `anyharness` runtime (emits interaction events); EAS Build iOS.

---

## Global Constraints

- **Cloud-only.** The app has no local runtime and no instance selector: the API
  base is **hardcoded to `https://proliferate.theitdept.au`**. (This lands after,
  and is consistent with, sub-project A making the platform web/cloud only.)
- **Reuse shared packages; native UI only.** No `@proliferate/product-client`
  (web DOM UI) dependency — mobile builds its own RN screens over the shared
  SDK/domain/design packages.
- **Design is a first-class deliverable.** Every parity surface and the glass
  system are laid out by a Fable 5 design agent before/as they are built — not
  ad-hoc. The design extends `@proliferate/design` with mobile tokens + a glass
  layer.
- **Full parity is the bar.** "Everything we can do in the web UI, we can do in
  the app" — workspaces (create/manage/archive/delete), sessions (list/create/
  switch), chat, interactive terminals, changes/diffs, agent auth, settings,
  managed workflows. Nothing web-only by omission.

---

## Current state

`apps/mobile` is a real Expo **SDK 54 / RN 0.81** app (~131 files, EAS iOS
pipeline, Apple auth, secure-store, Sentry, PostHog). It already has real depth in
**chat** (~2.3k lines), **home** (~1.4k), **work** (~1k), and **sessions**, and it
already reaches cloud sandboxes through the gateway. Gaps to full parity:
interactive **terminals**, **changes/diffs**, complete **workspace create/manage**,
deeper **sessions**, **settings/agent-auth**, and **managed workflows**. No push
infra exists anywhere (no `expo-notifications`, no device tokens, no server
detection of "agent needs you").

---

## Phase 1 — Expo 54 → 56 upgrade + platform hardening

Foundation: get the app building and green on SDK 56 / New Architecture before
layering features.

- **Incremental upgrade 54 → 55 → 56** (Expo's guidance: never skip). Each step:
  `npx expo install expo@^<ver> --fix` → `npx expo-doctor@latest` → regenerate
  native / `pod-install`. React stays 19.2.
- **New Architecture becomes mandatory at SDK 55.** Audit every native dep for
  Fabric compatibility (`react-native-svg`, `react-native-safe-area-context`,
  `expo-*` are fine; `@anyharness/sdk` is pure JS). This is the single biggest
  risk item — validate a New-Arch build early.
- **Delete `@sentry/react-native` entirely** (and its config/plugin, sourcemap
  upload script, DSN). Removes the sharpest RN-0.85/New-Arch compat risk. PostHog
  stays (product analytics); the app ships without third-party crash reporting.
- **Hardcode the API base URL** to `https://proliferate.theitdept.au` in
  `apps/mobile/src/config`; remove any runtime/instance-selection path.
- **Mechanical breaking-change fixes:** `expo-blur` (`<BlurTargetView>` wrapper +
  `experimentalBlurMethod`→`blurMethod`), `expo-file-system` async `copy()`/
  `move()` → `copySync`/`moveSync` where sync is needed, `expo/fetch` becoming the
  global `fetch` (re-verify networking + PostHog instrumentation). Confirm
  `expo-router`/`@react-navigation` codemod is N/A (neither is a dep).
- **EAS:** bump `eas-cli` off the pinned `18.13.0` to a release that selects an
  **Xcode 26.4** build image; iOS deployment target moves to 16.4 (SDK 56 default).
- **Exit criteria:** app builds via EAS, boots on an iOS 26 simulator on New Arch,
  existing chat/home/work/sessions still function against the hosted API,
  `pnpm --filter @proliferate/mobile typecheck` green.

## Phase 2 — Liquid Glass design system (Fable 5)

- **First-party `expo-glass-effect`** (`GlassView` / `GlassContainer`). Every
  glass surface is capability-guarded with `isGlassEffectAPIAvailable()` and falls
  back to a tinted `BlurView` (or solid surface) below iOS 26. Never use
  `opacity:0` to hide glass.
- **`GlassSurface` primitives + tokens in `@proliferate/design`:** encapsulate the
  capability check + fallback once, and define elevation/tint/contrast/dark-mode
  tokens governing *where* glass is allowed (nav bars, tab bars, toolbars, sheets,
  floating controls — not dense body content), plus Reduce-Transparency /
  Increase-Contrast accessibility handling.
- **Fable 5 design pass** produces the glass component system (the primitives,
  tokens, usage rules, light/dark + fallback specs) as the design source of truth,
  which the RN components implement.

## Phase 3 — Full feature parity (Fable 5-designed IA + screens)

The parity target is **every web capability**. A Fable 5 design agent first
produces the mobile information architecture and per-surface layouts (navigation
model, screens, states, gestures) for the full set; implementation follows the
design. Surfaces to reach parity on:

- **Home / composer:** browse repos, pick base branch, create a cloud workspace
  (the mobile analog of the web home composer, cloud-only).
- **Workspace management:** list, open, rename, archive, restore, delete; the
  workspace shell that hosts the surfaces below.
- **Sessions:** list, create, switch, dismiss; per-session status.
- **Chat / agent transcript:** the running agent conversation, pending prompts,
  and interaction handling (approve permissions, answer questions, MCP
  elicitations) — the mobile home of the push deep-links (Phase 4).
- **Interactive terminals:** PTY over WebSocket in RN (the heaviest lift) — attach
  to a workspace terminal, stream I/O, resize.
- **Changes / diffs:** view a workspace's git changes and file diffs; PR status.
- **Agent auth / harness settings:** the cloud harness surface (subscription CLI
  login, model catalog) — mirroring the web harness pane, cloud-only.
- **Settings + managed workflows:** account/settings, and viewing/triggering the
  managed (scheduled) workflows now that they run server-side.

All surfaces consume the shared `cloud-sdk`/`anyharness-sdk` data hooks; only the
presentation is new. Phase 3 is itself large and will be built surface-by-surface
behind the Fable 5 IA, each surface shippable independently.

## Phase 4 — Instant push (runtime → server → device)

The "the moment the agent needs you" pipeline, fired from the runtime for
minimum latency (no polling).

- **Runtime (Rust `anyharness`):** when it emits an interaction the user must act
  on — `InteractionRequested` with `InteractionKind ∈ {Permission, UserInput,
  McpElicitation}`, or a `TurnEnded` that leaves the session `AwaitingInteraction`
  — it POSTs a compact event to a new server webhook: `{workspace_id, session_id,
  request_id, kind, title}`. It already produces these events for the client
  stream; this adds a fire-and-forget server notification, deduped by `request_id`.
- **Sandbox → control-plane reachability:** the runtime needs the server URL + a
  credential. The control plane injects a **per-sandbox webhook token** at
  provision time (alongside the runtime token) and the sandbox NetworkPolicy gets
  a new **egress allow to the control-plane service** (today it's blocked by the
  cluster-CIDR `except` rules). The server authenticates the webhook by that token
  and resolves the owning sandbox.
- **Server:** new webhook endpoint → resolve `owner_user_id` from the
  sandbox/`CloudWorkspace` → look up the user's Expo tokens in a new
  **`user_push_device`** table (per-user, many devices; register/unregister route
  under the profile API) → send an **Expo push** with a deep-link payload
  (`workspace_id`/`session_id`/`request_id`). Dedupe via the existing
  `claim_webhook_event` receipt store keyed on `(session_id, request_id)`. Delivery
  modeled on the existing Slack-notification task pattern (a new Expo transport +
  task), but sent promptly for low latency.
- **Mobile:** add `expo-notifications`; register the device's Expo push token to
  the server on login; handle foreground + background notifications; tapping a
  push **deep-links straight into that session's pending interaction** so the user
  approves/answers in-app. Local notification permission onboarding.

---

## The Fable 5 design pass (cross-cutting)

Fable 5 (design-oriented model) is dispatched to produce, as design artifacts that
gate implementation: (1) the Liquid Glass system (Phase 2), and (2) the full
mobile IA + per-surface layouts for parity (Phase 3) — navigation model, screen
inventory, states/empty/loading/error, gestures, light/dark + glass usage, and
the iOS <26 fallback look. This runs in parallel with the Phase 1 upgrade (they're
independent), so design is ready when parity implementation starts.

## Risks & mitigations

- **New Architecture (SDK 55)** — biggest risk. Mitigate: upgrade incrementally,
  validate a New-Arch EAS build after each SDK step, audit native deps first.
- **Runtime → server reachability & auth** — new network path from a sandbox pod.
  Mitigate: per-sandbox webhook token + a scoped NetworkPolicy egress allow to
  only the control-plane service; authenticate + rate-limit the webhook.
- **Parity scope is large** — mitigate by building surface-by-surface behind the
  Fable 5 IA, each independently shippable; terminals (hardest) sequenced with
  room, but in scope.
- **Push duplicates / spam** — dedupe on `(session_id, request_id)`; only notify
  on *new* interaction requests and terminal turn-ends, not every event.

## Testing

- Mobile: `pnpm --filter @proliferate/mobile typecheck` + vitest; a New-Arch EAS
  preview build validated on an iOS 26 device after Phase 1 and before ship.
- Server: pytest for the new webhook, device-registration, and Expo delivery
  (mock the Expo push API); dedupe idempotency test.
- Runtime: Rust tests for the interaction→webhook emission (fire-and-forget,
  non-blocking to the session).
- E2E: create a cloud workspace on mobile, run an agent that requests a
  permission, confirm the push arrives on a device and deep-links to the approval.

## Out of scope

- Android (iOS-first; the RN code is largely portable but Android build/push/glass
  fallback is a later pass).
- The sub-project A desktop/local removal (separate branch, running now).
- Any change to the managed-workflow execution stack beyond surfacing it in mobile.

## Sequencing

Phase 1 (upgrade) and the Fable 5 design pass run in parallel first. Then Phase 2
(glass) → Phase 3 (parity, surface-by-surface) → Phase 4 (push) — though Phase 4
is independent of parity and can be pulled earlier if the "instant ping" is the
priority. Each surface/phase is its own plan + build cycle.
