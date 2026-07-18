# Remove Desktop + Local Mode — Design (Sub-project A)

**Goal:** Make the platform run **web/cloud only**. Delete the desktop (Tauri)
app and every local-machine agent-execution path, so the only execution mode is
managed cloud (agents run in `au-syd-0` sandbox pods). Keep the self-hosted cloud
platform and the shared AnyHarness runtime — the cloud sandboxes run on it.

**Architecture:** This is a subtractive refactor across four surfaces — the
Tauri app + build graph, the Python server, the shared web client, and the
Rust/SDK runtime — plus DB migrations. It is **not** a subtree delete: the local
runtime abstraction is shared with cloud, so we remove the desktop *host* and the
`local_desktop` *execution path*, and prune local branches out of shared modules.

**Tech context:** pnpm workspace + Rust cargo workspace; Python/FastAPI server
with Alembic migrations; React web client (`apps/packages/product-client`, wrapped
by `apps/web`); Rust `anyharness` runtime baked into both the (deleted) desktop
sidecar and the cloud sandbox image.

---

## Global Constraints

- **The app stays green (builds, typechecks, deploys) between every phase.** Each
  phase is independently shippable; no phase leaves the tree half-migrated.
- **Do not delete the shared runtime.** The `anyharness` Rust crates, the
  `@anyharness/sdk` HTTP/WS client, and the `@anyharness/sdk-react` runtime
  abstraction (`useAnyHarnessRuntimeContext`, `runtimeUrl`) are the transport the
  **cloud** path uses (the sandbox pod runs `anyharness serve`; the client points
  the same `AnyHarnessClient({baseUrl})` at the gateway URL). Keep them.
- **Keep self-hosted, drop desktop.** `telemetry_mode`, `instance_*`,
  `webApp`/support/pricing capabilities, and `web_dist_dir` are *self-hosted*
  concepts and remain. Only desktop and `local_desktop` execution go.
- **Preserve cloud-critical, misleadingly-named code:** `integrations/desktop_downloads.py`
  (reused by cloud runtime-worker binary resolution) and the `cloud_sandbox`
  arm of runtime-workers stay.

---

## Current state (why it's shaped this way)

Two distinct axes, often conflated, both being dropped:

1. **Desktop client** — the Tauri app (`apps/desktop`) and everything that exists
   only because a signed desktop app connects: desktop auth/updater/downloads,
   desktop version pins, desktop runtime-worker enrollment, desktop-scoped repo
   environments, the (already-parked) local automation executor.
2. **`local_desktop` execution** — the user's local machine materializes a
   workspace worktree and runs the agent via the Tauri-spawned `anyharness`
   sidecar. Tracked in the materialization ledger beside `managed_cloud`.

The AnyHarness runtime is a single URL-parameterized transport. "Local" is one
`runtimeUrl` value produced by a desktop-only launcher (the Tauri sidecar spawns
`anyharness serve` on `127.0.0.1`); "cloud" is the gateway URL. On web the local
`runtimeUrl` store is never written, so it is already empty — but it is threaded
through ~53 client files, so removal is a wide mechanical refactor, not a delete.

---

## Approach — five phases

### Phase 0 — Resolve the `/auth/desktop` boundary (gating, do first)

The package `server/proliferate/auth/desktop/` is named "desktop" but the web
client may depend on it (`/auth/desktop/token` appears as the JWT bearer token
URL; `auth-probes.ts` calls `/auth/desktop/methods` and
`/auth/desktop/github/availability`). Two explorations disagreed on whether it is
desktop-only or the web app's real auth boundary. **This is the live web login
path**, so before anything is deleted we determine, from code:

- Which `/auth/desktop/*` endpoints the **web** client actually calls (grep
  `apps/packages/product-client` + `apps/web`), and how web auth tokens are
  minted (cookie session via `auth/identity` vs bearer via `/auth/desktop/token`).
- Decision recorded in this doc: **keep-and-optionally-rename** the shared auth
  endpoints the web uses, delete only the genuinely desktop-only ones
  (`/authorize`, `/poll`, deep-link `pages.py`, PKCE handoff).

**Deliverable:** an explicit keep/delete list for `auth/desktop/*`, plus
confirmation that no surviving non-web client (CLI/mobile) needs `/token`+`/refresh`.
No code change in Phase 0.

### Phase 1 — Delete the desktop app + its build wiring (low risk; leaf)

`apps/desktop/` is a leaf — nothing in the web client or server imports it.

- Delete `apps/desktop/` (Tauri app: `src/`, `src-tauri/`, `src-tauri-debug/`,
  `qualification/`, assets, icons).
- Remove it from `pnpm-workspace.yaml` and the two Rust `Cargo.toml` workspace
  `members` (`apps/desktop/src-tauri`, `apps/desktop/src-tauri-debug`).
- **Version pins:** three workflows read `apps/desktop/package.json` for
  `DESKTOP_VERSION`/`MIN_DESKTOP_VERSION` (`server-ci.yml`, `fast-server-image.yml`,
  `_deploy-server.yml`). Repoint to root `VERSION` or drop the build-args (the
  server `Dockerfile`/`version.py` already fall back to `server_version()`).
- Remove desktop-only CI/deploy/release: `release-desktop.yml`, `_deploy-desktop.yml`,
  the `desktop-frontend` job in `ci.yml`, the `deploy-desktop` jobs in
  `deploy-staging.yml`/`promote-production.yml`, and desktop lanes in the
  release-E2E workflows; Makefile `dev-desktop`/`desktop-build`/etc. targets and
  `DESKTOP_*` vars; `prepare-artifact-release.mjs` desktop version tracking; the
  `tests/release/**` desktop-manifest requirement.
- Server: drop `GET /desktop/updater/latest.json` and the `desktopVersion` /
  `minDesktopVersion` fields from `/meta` (`server/proliferate/server/meta.py`,
  `version.py`), and the mirrored fields in `cloud/sdk` generated types + tests.

### Phase 2 — Server: remove `local_desktop` execution (needs DB migrations)

`managed_cloud` is cleanly separated from `local_desktop` by the materialization
`target_kind` discriminator; the live automation executor already only branches
on `managed_cloud`.

- **Delete local-only units:** `server/proliferate/automations/local_executor.py`
  (already unmounted/parked), the local-materialization endpoints (`POST/PUT/DELETE
  /workspaces/{id}/materializations`), and `server/cloud/workspaces/materializations/service.py`
  (≈80% local-desktop; keep only any managed-source read still referenced).
- **Prune local branches in shared modules:** `workspaces/models.py`
  (`MaterializationTargetKind` → `"managed_cloud"` only; drop `desktop_install_id`
  fields and the "Add Cloud copy from Desktop" request shapes),
  `materializations/summaries.py`, `workspaces/service.py` (the exact-ref
  local-source block — verify cloud-only creation no longer needs it),
  `runtime_workers/*` (drop the `desktop` `runtime_kind` arm; keep `cloud_sandbox`),
  `repositories/*` (drop `environment_kind = "local"`; keep `"cloud"`).
- **Auth surface switches:** remove the `desktop` arm from the `{web,mobile,desktop}`
  switches in `auth/identity` and `auth/sso` (do not delete — web/mobile share the
  code); apply the Phase 0 decision to `auth/desktop/`. Remove `constants/auth.py`
  desktop constants. Flip `callback_surface`/`source_surface` defaults off "desktop".
- **DB migrations (3):** relax/rewrite the CHECK constraints + partial unique
  indexes that encode the local/cloud split, and remove now-dead columns, on
  `cloud_workspace_materialization`, `cloud_runtime_worker` (+ enrollment), and
  `repo_environment`. Each migration ships in lockstep with its code edits; drop
  existing `local_desktop` rows.
- **Keep:** `insert_managed_cloud_materialization` + managed reconcile,
  `cloud_sandbox` worker enroll/heartbeat/download, `desktop_downloads.py`
  (cloud binary resolution), the whole managed-workflow path.

### Phase 3 — Web client: remove the local surface + `runtimeUrl` refactor (medium-high)

- **Delete the local writers** (all inert on web today): the Tauri runtime
  bootstrap (`runtime-bootstrap.ts`, `use-desktop-runtime-bootstrap-lifecycle.ts`),
  the top-level `AnyHarnessRuntime` context in `ProductProviderRoot.tsx`, the
  local runtime store (`harness-connection-store.ts`), the local inventory query
  (the `hasLocalRuntime`-gated `collectionsQuery` in `use-workspaces.ts` +
  `listRuntimeWorkspaces`/`listRepoRoots`), `useAgentCatalog` (local) and the
  local sync loops (`use-local-auth-state-sync`, `use-gateway-catalog-mirror-sync`),
  the local branch queries, and the Tauri/desktop lifecycle (`DesktopProductLifecycleRoot`,
  `hooks/access/tauri/**`, `host/desktop-bridge.ts`).
- **Delete the `surface="local"` UI:** `HarnessSurfaceLocal`, the Cloud|Local
  toggle (`AgentScopeHeaderControls`), and the `surface === "local"` branches in
  the harness panes; default `AgentAuthSurface` to `"cloud"` and hardwire
  `useHarnessAuthEditor` / `useAgentLoginTerminalWorkflow` to cloud.
- **Prune, don't delete, the shared connection resolver:** keep
  `runtime-target.ts` / `resolve-workspace-connection.ts` /
  `use-resolve-workspace-connection.ts` / the `AnyHarnessWorkspace` provider;
  delete their `location:"local"` and `location:"ssh"` branches. Once those and
  the store are gone, the now-dead `runtimeUrl`/`ssh` params thread out of ~53
  files (most collapse because the value was already `""` on web).
- **Keep:** the cloud gateway path (`cloud-sandbox-gateway.ts`,
  `use-selected-cloud-runtime-state`, `use-terminal-workspace-connection` cloud
  fast-path), the cloud agent catalog (`useWorkspaceAgentCatalog`),
  `HarnessSurfaceCloud`, and `auth-mode.ts` (`isProductAuthRequired`, host contract).

### Phase 4 — Dead-code sweep (low risk)

Remove now-unreferenced enum values (`CloudTargetKind` ssh/desktop_dispatch/
local_direct/self_hosted_cloud, `SUPPORTED_ENROLLABLE_CLOUD_TARGET_KINDS`), dead
config, `.vercelignore`/issue-template desktop entries, and stale desktop docs
under `specs/**`. Cosmetic; batched last so earlier phases don't churn on it.

---

## Risks & mitigations

- **DB migrations (Phase 2)** are the only hard-to-reverse step. Mitigate: write
  forward+down migrations, test against a copy of the `au-syd-0` DB, and land each
  migration in the same PR as its code so schema and code never skew. There are
  no `local_desktop` rows in production today (cloud-only usage), which de-risks
  the data drop.
- **`runtimeUrl` breadth (Phase 3)** — ~53 files. Mitigate: do it as a mechanical
  param-removal after the store/branches are deleted; TypeScript makes the dead
  params compile-errors that guide the sweep. Keep the shared resolver's public
  shape stable so cloud consumers don't churn.
- **The `/auth/desktop` boundary** — mitigated by Phase 0 gating (no deletion
  until the web dependency is proven).
- **Cross-cutting green-ness** — each phase ends with `pnpm typecheck` + server
  test suite + a deploy of the server image to `au-syd-0`, so regressions surface
  per-phase, not at the end.

## Verification / testing

- Client: `pnpm --filter @proliferate/product-client typecheck` + the vitest
  suites for touched hooks after each client change; the web build
  (`pnpm web:build`) must stay green.
- Server: the pytest suites for materialization, runtime-workers, repositories,
  auth/identity, and meta; new/updated tests assert the local paths are gone and
  the cloud paths intact; Alembic upgrade/downgrade tested.
- Rust: `cargo build --workspace` after removing the two desktop crate members.
- End-to-end: after each server/web deploy to `au-syd-0`, a cloud workspace
  create → open → run still works; `/meta` no longer advertises desktop; sign-in
  still works (Phase 0/2 auth edits).

## Out of scope

- SSH "direct-attach" targets are removed with local (they are a desktop-host
  feature), not preserved.
- Mobile app parity and push (sub-project B+C) — separate spec/branch.
- Any change to the AnyHarness runtime protocol, the cloud sandbox provider, or
  the managed-workflow stack.

## Sequencing

Phase 0 → 1 → 2 → 3 → 4. Phases 1 and 4 are safe and mechanical; 2 and 3 are the
real work and each ship behind their own verification + `au-syd-0` deploy.

---

## Phase 0 findings

**Investigation date:** 2026-07-18. Read-only; no code changed.

### How the WEB client mints auth tokens

The web client (`apps/packages/product-client/src` + `apps/web`) authenticates via
**cookie sessions through `auth/identity`**, not via the desktop bearer flow. The
web login/token surface is `server/proliferate/auth/identity/api.py`:

- `POST /auth/web/password/login` — email/password; sets an httpOnly refresh
  cookie (`WEB_REFRESH_COOKIE`) + a readable CSRF cookie via `_set_web_session_cookies`.
- `POST /auth/web/token` — exchange an OAuth auth code (`exchange_auth_code`) →
  cookie session.
- `POST /auth/web/session/{bootstrap,refresh,logout}` — cookie-based session
  lifecycle (refresh guarded by CSRF cookie/header).
- OAuth start/callback via `POST /auth/{surface}/{provider}/start` +
  `GET /auth/{surface}/{provider}/callback` with `surface="web"`.

`auth_session_response(..., include_refresh_token=False)` returns a short-lived
bearer **access token** in the body (the browser sends it as `Authorization:
Bearer` on API calls) while the refresh token lives only in the httpOnly cookie.
**The web client never calls `/auth/desktop/token` or `/auth/desktop/refresh`.**

### Which `/auth/desktop/*` endpoints the WEB client actually calls

Grepping `apps/packages/product-client/src` + `apps/web` (excluding `dist/`), the
web client calls exactly **two** `/auth/desktop/*` endpoints, both **public,
unauthenticated capability probes** (no PKCE verifier / token / session):

- `GET /auth/desktop/methods` — via `getDesktopAuthMethods()` in
  `lib/access/cloud/auth-probes.ts`; consumed by `hooks/access/cloud/auth/use-auth-methods.ts`
  and `hooks/organizations/workflows/use-organization-join-invitation-flow.ts`.
- `GET /auth/desktop/github/availability` — via `getGitHubDesktopAuthAvailability()`
  in the same file; consumed by `hooks/access/cloud/auth/use-github-auth-availability.ts`.

(The related `discoverDesktopSso()` probe hits `/auth/sso/discover`, which lives in
`auth/sso`, **not** `auth/desktop`.)

Confirmed **no surviving non-web client needs `/token`+`/refresh`**:
- `apps/mobile` has zero `/auth/desktop/*` references — mobile uses `/auth/mobile/*`
  (`/auth/mobile/password/login`, `/auth/mobile/token`, `/auth/mobile/session/refresh`).
- There is no CLI package.
- The only `/auth/desktop/token|refresh|poll|password/login` callers outside the
  (Phase-1-deleted) `apps/desktop/src` are `server/tests/**` and `tests/{intent,release}/**`
  fixtures, plus the generated `cloud/sdk/src/generated/openapi.ts`.

### KEEP / DELETE decision for `server/proliferate/auth/desktop/`

Router prefix `/desktop` mounted under `/auth` → full paths below. Decision
executed in **Phase 2** (Phase 0 is decision-only).

| Endpoint | Handler | Decision | Why |
|---|---|---|---|
| `GET /auth/desktop/methods` | `desktop_auth_methods` | **KEEP** | Live web login probe (`use-auth-methods`, join-invitation flow). Public. |
| `GET /auth/desktop/github/availability` | `github_availability` | **KEEP** | Live web login probe (`use-github-auth-availability`). Public. |
| `POST /auth/desktop/password/login` | `desktop_password_login` | **DELETE** | Web uses `/auth/web/password/login`. Only the desktop app + bearer test fixtures use it. |
| `POST /auth/desktop/authorize` | `create_desktop_auth_code` | **DELETE** | Debug-only PKCE code creation; desktop-only. |
| `GET /auth/desktop/github/authorize` | `authorize_github_desktop` | **DELETE** | Desktop browser-OAuth start; desktop-only. |
| `GET /auth/desktop/github/callback` | `github_desktop_callback` | **DELETE** | Desktop deep-link OAuth callback (uses `pages.py` handoff); desktop-only. |
| `POST /auth/desktop/poll` | `poll_desktop_auth` | **DELETE** | Desktop PKCE poll; desktop-only. |
| `POST /auth/desktop/token` | `exchange_token` | **DELETE** | Desktop PKCE→JWT exchange; desktop-only. Web uses cookie session. |
| `POST /auth/desktop/refresh` | `refresh_access_token` | **DELETE** | Desktop bearer refresh; desktop-only. Web=`/auth/web/session/refresh`, mobile=`/auth/mobile/session/refresh`. |

**No rename.** Spec allowed "keep-and-optionally-rename." I recommend keeping the
two survivors at their current paths (`/auth/desktop/methods`,
`/auth/desktop/github/availability`) — renaming needs a coordinated client+server
change with no functional benefit, and the operating rule is to make the safe,
green-preserving choice. An optional future rename to `/auth/methods` +
`/auth/github/availability` is deferred/out of scope.

**Supporting files** (executed in Phase 2, not Phase 0):
- `pages.py` — DELETE (only the desktop github callback uses it).
- `service.py` / `models.py` — trim to the survivors: **keep** `github_oauth_enabled()`
  (used by both KEEP endpoints; standalone `settings` read) and the response models
  `AuthMethodsResponse` / `OAuthAvailabilityResponse`. Delete the PKCE/token/poll/
  redirect/handoff orchestration.
- Before deleting `constants/auth.py` desktop constants, verify `GITHUB_OAUTH_SCOPES`
  is not shared by the identity/sso GitHub flows (keep if shared).

### Phase 2 contingencies flagged by this investigation (do together with the deletes)

1. **`server/proliferate/auth/jwt.py:17`** — `BearerTransport(tokenUrl="/auth/desktop/token")`.
   This is OpenAPI/Swagger "authorize" **metadata only** (it does not create the
   endpoint, and bearer auth validation is unaffected), but deleting `/auth/desktop/token`
   leaves it pointing at a dead path. Repoint to a surviving token endpoint (e.g.
   `/auth/mobile/token`) when `/token` is removed.
2. **Bearer-login test fixtures** — `tests/release/src/fixtures/*` (`authenticated-actor`,
   `invited-actor`, `selfhost-actor`) and `tests/intent/**` log in via
   `POST /auth/desktop/password/login` to obtain **bearer** tokens. Migrate these to
   `POST /auth/mobile/password/login` (same `AuthSessionResponse` with access+refresh)
   in the same change that deletes `/auth/desktop/password/login`.
3. **Server auth tests** — `server/tests/integration/test_auth_flow.py`,
   `test_desktop_auth_customerio.py`, `test_desktop_auth_gate.py`,
   `test_desktop_password_auth.py`, `unit/test_api_path_prefix.py`,
   `unit/auth/test_desktop_customerio.py`, and helpers `tests/helpers/desktop_auth.py`,
   `tests/e2e/cloud/helpers/auth.py` assert the deleted desktop endpoints; update/remove
   in lockstep with the Phase 2 deletions.

**Net:** the web login path is fully preserved by keeping the two public probes.
Everything else under `auth/desktop/` is desktop-app-only and safe to delete in Phase 2.
