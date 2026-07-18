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
