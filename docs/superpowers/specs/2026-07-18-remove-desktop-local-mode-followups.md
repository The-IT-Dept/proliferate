# Remove Desktop + Local Mode — Deferred CI / release-orchestration follow-ups

Companion to `2026-07-18-remove-desktop-local-mode-design.md`. These items were
**intentionally deferred** out of the Phase 1 branch `feat/remove-desktop-local-mode`.

## Why deferred (not blocked)

Editing `.github/workflows/**` is **not** gated in this environment (verified: a
workflow file stages cleanly). The reason for deferral is **coupling + green-ness**,
per the operating rule "depth and green-ness matter more than covering all phases":

The desktop CI/release-orchestration layer is a large, tightly-interconnected web —
15 workflow files reference `desktop` (103 refs in `release-desktop.yml` alone), and
they are cross-wired to ~15 `scripts/ci-cd/*.mjs` scripts **each with a `*.test.mjs`
assertion test** that reads the workflow files and desktop surface lists. Removing any
one pure-desktop workflow (e.g. `release-desktop.yml`) cascades into 5+ scripts/tests.
Doing it piecemeal leaves the `scripts/ci-cd` node test suite red; doing it fully is a
self-contained sub-project comparable in size to Phase 2/3. **None of it affects app
build/typecheck/pytest green-ness** (it is CI config + CI-only node tests), so it is
safe to land as one focused follow-up PR.

## Already done on the branch (so CI isn't left reading a deleted file)

The Phase 1 deletion removed `apps/desktop/`, which three server-image workflows read
via `jq -r '.version' apps/desktop/package.json`. Those reads + the now-dead
`DESKTOP_VERSION`/`MIN_DESKTOP_VERSION` build-args were removed so the server image
pipeline still builds:

- `.github/workflows/server-ci.yml` — "Resolve version pins" step + build-args.
- `.github/workflows/fast-server-image.yml` — same.
- `.github/workflows/_deploy-server.yml` — same.
- `server/Dockerfile` — dropped the dead `ARG/ENV DESKTOP_VERSION` + `MIN_DESKTOP_VERSION`
  (server `version.py` no longer defines `desktop_version()`/`min_desktop_version()`).

## Deferred work (one follow-up PR; keep `scripts/ci-cd` node tests green in lockstep)

### 1. Delete the two pure-desktop workflows
- `.github/workflows/release-desktop.yml`
- `.github/workflows/_deploy-desktop.yml`

### 2. Remove desktop jobs/steps/needs from shared workflows
- `.github/workflows/ci.yml` — the `desktop-frontend` job.
- `.github/workflows/deploy-staging.yml` — the `deploy-desktop` job + its `needs`.
- `.github/workflows/promote-production.yml` — the `deploy-desktop` job + its `needs`.
- `.github/workflows/nightly-release-train.yml` — `release-desktop` job, its `needs`,
  the `prepare.outputs.desktop` gate, and the summary line.
- `.github/workflows/hotfix-production.yml` — desktop gating/jobs (13 refs).
- `.github/workflows/release-e2e.yml` + `release-e2e-selfhost.yml` — the desktop/native
  lanes (the `--desktop native` matrix arm; keep web).
- `.github/workflows/release-runtime.yml` — desktop refs (5).
- `.github/workflows/self-host-smoke.yml`, `.github/workflows/intent-tests.yml` — 1 ref each.

### 3. `scripts/ci-cd/*.mjs` desktop logic + their `*.test.mjs`
- `detect-deploy-surfaces.mjs` (5) — drop the desktop deploy surface + `release-desktop.yml`
  path; update `detect-deploy-surfaces.test.mjs`.
- `prepare-artifact-release.mjs` (21) — remove desktop version tracking / `apps/desktop/package.json`
  read+write; update `prepare-artifact-release.test.mjs` (writes `apps/desktop/package.json`).
- `pr-metadata.mjs` (2) — drop desktop; update `validate-pr-metadata.test.mjs`
  (asserts `release-desktop.yml`).
- `build-local-qualification-candidates.mjs` (12) — drop the desktop (`proliferate`) candidate;
  update `build-local-qualification-candidates.test.mjs`.
- `build-selfhost-qualification-candidates.{mjs,test.mjs}` — `DESKTOP_VERSION` refs.
- `release-title-propagation.test.mjs` — reads `release-desktop.yml`; remove those cases.
- `generate-updater-manifest.{mjs,test.mjs}` — desktop Tauri updater manifest generator;
  delete outright.
- `scripts/test_check_docs.py` — `valid_env_var_entry(workflow="release-desktop")` entry.
- `scripts/ci-cd/publish-runtime-cdn.sh` — comment referencing `release-desktop.yml` (cosmetic).

### 4. `tests/release/**` desktop harness (the "desktop-manifest requirement")
- `tests/release/upgrade/run-t4-desktop.mjs` + `tests/release/upgrade/updater-driver/` (Rust
  crate; standalone, not a cargo-workspace member) — the desktop auto-update tier-4 test.
- `tests/release/src/artifacts/local-candidate-set.ts`, `selfhost-candidate-set.ts` — desktop
  candidate entries.
- `tests/release/src/scenarios/t3-update-1.ts` (desktop update scenario), `t3-repo-1.ts`,
  `scenarios/selfhost/t3-sh-2.ts` — desktop lanes.
- `tests/release/src/worlds/local-workspace/renderer.ts`, `src/fixtures/local-runtime.ts`,
  `product-page.ts`, `integration-gateway.ts`, `connect-server.ts` — desktop/local worlds.
- Migrate the bearer-login fixtures off `/auth/desktop/password/login` → `/auth/mobile/password/login`
  (see Phase 0 findings contingency #2): `authenticated-actor.ts`, `invited-actor.ts`,
  `selfhost-actor.ts`, and `tests/intent/**` seed/login helpers.

### 5. Makefile residue (kept intentionally on the branch until §2/§4 land)
- `DESKTOP ?= web` var + the `--desktop web` / `--desktop $(DESKTOP)` flags in the
  release-E2E lanes. These stay valid (web is the only surface) but should be dropped
  when the release harness's `--desktop` CLI arg is removed in §4.

## Verification for the follow-up PR
- `node --test scripts/ci-cd/*.test.mjs` (or the CI invocation) green.
- `scripts/test_check_docs.py` green.
- `tests/release` + `tests/intent` typecheck/lint green.
- Confirm no workflow references `apps/desktop`, `release-desktop`, `_deploy-desktop`,
  `DESKTOP_VERSION`, or `MIN_DESKTOP_VERSION`.

---

# Phase 2 status + Phase 2/3 coupling finding

## Done in this pass (green, committed)
- **Parked local-desktop automation executor deleted**: `server/proliferate/server/automations/local_executor.py`,
  its parked API routes (`/automations/executor/local/*`), the `Local*` request/response
  models, and `local_claim_payload`. The automations router is unmounted (parked in
  `main.py`), so this touched no live path, no web client, and no OpenAPI schema.
  Verified: ruff clean, `main` imports, 41 automations unit tests pass.
  (Note: `automations/models.py`/`api.py` have a *pre-existing* broken transitive import
  `proliferate.db.models.cloud.repo_config` — unrelated to this change; the parked
  subsystem's tests import `automations.domain.*`, not `.models`.)

## KEY FINDING: Phase 2 (server) is coupled to Phase 3 (web) — sequence them together

The spec treats Phase 2 (server local-execution removal) and Phase 3 (web local surface)
as separable. In practice the discriminator-enum and response-shape parts of Phase 2 are
**tightly coupled** to the Phase 3 web client through the generated SDK
(`cloud/sdk/src/generated/openapi.ts`):

- Server response models (`WorkspaceMaterializationSummary.targetKind`/`desktopInstallId`,
  `RepoEnvironmentResponse.kind`/`localPath`/`desktopInstallId`, worker kinds) are mirrored
  into the generated SDK and **read by the web client**. Removing a field or an enum literal
  (`local_desktop`, `local`, `desktop`) from the server changes the generated TypeScript, and
  the web client has extensive readers/comparators (`surface === "local"`, `environmentKind
  === "local"`, `RepoGroupEnvironmentKind`, `add-repo-flow-store` `kind:"local"`, harness
  `surface="local"`, etc. — all Phase 3). Those become TS errors → web typecheck goes red.
- Dropping a DB **column** (e.g. `repo_environment.local_path`, `..._materialization.desktop_install_id`)
  forces removing it from the SQLAlchemy model → store Value → response payload → SDK →
  web reader — i.e. it *is* Phase 3 work.

**Implication for the remaining plan:** split Phase 2 into
1. **Web-decoupled server-internal removals** (safe to land now, no web churn):
   - the parked executor (DONE);
   - the desktop-only **endpoints** the web never calls — local-materialization
     `POST/PUT/DELETE /workspaces/{id}/materializations`, runtime-worker
     `POST /workers/desktop/{enrollment,revoke}`, and the `auth/desktop/*` DELETE set
     from the Phase 0 findings — plus the service/store functions only they reach;
   - the DB **row-drop + CHECK-relax + local-partial-unique-index-drop** migrations that do
     NOT drop columns (keep columns until step 2), verified with `alembic upgrade/downgrade`
     on a throwaway Postgres (available locally on :5432 — never touch prod).
   Caveat: verify each endpoint is truly not called by the web client / generated SDK before
   removing (some request models may still be in the SDK even if unused).
2. **Discriminator/response-shape/column removals** — do these **in lockstep with Phase 3**
   web-client edits + one SDK regeneration, so typecheck stays green:
   `MaterializationTargetKind` → `managed_cloud` only; `RepoEnvironmentKind` drop `local`;
   drop `desktop_install_id`/`local_path`/`worktree_path` columns; collapse the runtime-worker
   `runtime_kind` desktop arm's schema; the `auth` `{web,mobile,desktop}` surface switches
   (keep shared constants `DESKTOP_REDIRECT_SCHEME(S)`, `DESKTOP_DEEP_LINK_LAUNCH_ENABLED`,
   `GITHUB_OAUTH_SCOPES`, `SUPPORTED_CODE_CHALLENGE_METHODS` — used by github_app/integrations
   and web/mobile login, NOT desktop-execution-only, per the map).

The full per-file map for both steps is in the completed background exploration (materialization,
runtime_workers, repositories, auth surface switches, DB constraints/indexes). Alembic head to
branch new migrations from: **`775b33c8d1f5`**.

## Phase 0 auth/desktop DELETE set — still to execute (web-safe; test-heavy)
Delete `/auth/desktop/{password/login,authorize,github/authorize,github/callback,poll,token,
refresh}` + `pages.py`; trim `service.py`/`models.py` to `github_oauth_enabled` +
`AuthMethodsResponse`/`OAuthAvailabilityResponse`; KEEP `/methods` + `/github/availability`.
Contingencies: repoint `auth/jwt.py` `BearerTransport(tokenUrl=...)` off `/auth/desktop/token`;
migrate bearer-login fixtures (`tests/release/**`, `tests/intent/**`) to
`/auth/mobile/password/login`; update/remove the ~8 desktop auth server test files.
