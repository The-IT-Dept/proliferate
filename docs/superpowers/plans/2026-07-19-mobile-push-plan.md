# Instant Push Subsystem — Implementation Plan (Phase 4)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.
> Spec: `docs/superpowers/specs/2026-07-18-mobile-cloud-only-design.md` (Phase 4).

**Goal:** The instant the runtime emits an interaction the user must act on, a push lands on their phone and deep-links into that pending interaction — runtime → server → device, no polling.

**Architecture:** (1) anyharness runtime POSTs a fire-and-forget event to a new server webhook when it emits `interaction_requested` (`Permission`/`UserInput`/`McpElicitation`) or a `turn_ended` leaving the session `awaiting_interaction`. (2) Server authenticates the per-sandbox token, resolves `owner_user_id`, dedupes on `(session_id, request_id)`, and sends an Expo push to the user's registered devices. (3) Mobile registers its Expo token and deep-links the tap into the interaction card.

**Tech Stack:** Rust (anyharness), Python/FastAPI + Celery, Expo `expo-notifications`, Postgres/Alembic, k8s (GitOps).

## Global Constraints
- Runtime emit is **fire-and-forget and non-blocking** to the session (spawn/detach; failures never stall the agent).
- **Dedupe on `(session_id, request_id)`** via the existing `claim_webhook_event` receipt store — one push per interaction, even on retries/reconnects.
- Webhook is authenticated by a **per-sandbox token** injected at provision time; only that sandbox's events are accepted for its owner.
- NetworkPolicy egress from sandboxes is scoped to **only the control-plane service** (not the whole cluster).
- **Migrations run inside the pytest schema build** (`tests/conftest.py` → `command.upgrade(cfg,"head")`) — the migration + the model + tests land together and green. New model goes in `server/proliferate/db/models/auth.py` (already imported by `alembic/env.py` and `tests/postgres.py`).
- **The k8s deploy (migration apply + control-plane roll + netpol) is a deliberate, human-gated step at the end** — never auto-apply an unreviewed migration to the live control plane.

## File Structure
- Server: `db/models/auth.py` (+`UserPushDevice`), `alembic/versions/<new>_user_push_device.py`, `auth/profile_api.py` (register/unregister routes), new `server/proliferate/server/cloud/push/` (webhook endpoint + service + Expo transport), `background/tasks/push.py` (+ wire into `background/config.py` + `background/relay.py SUPPORTED_OUTBOX_TASKS`).
- Runtime: `anyharness/crates/anyharness-lib/src/...` interaction-emit hook + a small HTTP notifier.
- Mobile: `apps/mobile/src/lib/push/` (registration + handler) + deep-link routing.
- Infra: `/Users/nickp/code/infra/k8s/apps/au-syd-0/proliferate/` (netpol egress + sandbox token env).

---

### Task 1: `UserPushDevice` model + migration
**Files:** Modify `server/proliferate/db/models/auth.py`; create `server/alembic/versions/<rev>_user_push_device.py` (down_revision `775b33c8d1f5`).
**Interfaces (Produces):**
```python
class UserPushDevice(Base):
    __tablename__ = "user_push_device"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id", ondelete="CASCADE"), index=True)
    expo_push_token: Mapped[str] = mapped_column(String(256))
    platform: Mapped[str] = mapped_column(String(16))  # "ios"|"android"
    created_at / updated_at (inline, utcnow)
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    __table_args__ = (UniqueConstraint("user_id","expo_push_token", name="uq_user_push_device_token"),)
```
- [ ] Add the model to `auth.py` (reuse `Base`, `utcnow`, uuid PK, FK `user.id` CASCADE).
- [ ] `cd server && uv run alembic revision --autogenerate -m "add user_push_device table"`; set `down_revision="775b33c8d1f5"`; review the create_table (uuid PK, FK, unique constraint, index).
- [ ] `cd server && uv run alembic upgrade head` on the local test DB; `uv run pytest -q -k meta` (schema builds) → PASS. Commit `feat(server): user_push_device model + migration`.

### Task 2: Device register/unregister routes
**Files:** Modify `server/proliferate/auth/profile_api.py`; create `tests/integration/test_push_devices_api.py`.
**Interfaces (Produces):** `POST /users/me/push-devices {expoPushToken, platform}` (upsert on `(user,token)`, clears `disabled_at`); `DELETE /users/me/push-devices/{token}` (sets `disabled_at`). Auth `Depends(current_active_user)`, `Depends(get_async_session)`.
- [ ] Failing test (use the `_create_user_and_get_token` helper pattern): POST registers → row exists; POST again same token → idempotent (one row); DELETE → `disabled_at` set. Run `cd server && uv run pytest tests/integration/test_push_devices_api.py -q` → FAIL.
- [ ] Implement the routes. Run → PASS. Commit `feat(server): push-device register/unregister routes`.

### Task 3: Runtime interaction webhook (server side)
**Files:** Create `server/proliferate/server/cloud/push/{api.py,service.py}`; mount router in `main.py`; `tests/integration/test_push_webhook.py`.
**Interfaces (Produces):**
```
POST /v1/internal/push/interaction   (authenticated by per-sandbox token header)
body: { sandboxToken, workspaceId, sessionId, requestId, kind: "permission"|"user_input"|"mcp_elicitation"|"awaiting", title }
```
Server: validate token → load sandbox → `owner_user_id` → `claim_webhook_event((session_id,request_id))` (skip if already claimed) → enqueue Expo push task.
- [ ] Failing tests: valid token+new request → enqueues one delivery; duplicate `(session,request)` → no second enqueue; bad token → 401; token→sandbox→owner resolution. Run → FAIL.
- [ ] Implement endpoint + service (reuse `claim_webhook_event`/`mark_webhook_event_processed`). Run → PASS. Commit `feat(server): runtime interaction push webhook + dedupe`.

### Task 4: Expo push delivery task
**Files:** Create `server/proliferate/server/cloud/push/expo.py` (transport) + `background/tasks/push.py` (Celery task); wire `PUSH_SEND_TASK` into `background/config.py` `TASK_ROUTES` + `background/relay.py SUPPORTED_OUTBOX_TASKS`; `tests/unit/test_push_delivery.py`.
**Interfaces (Produces):** `send_expo_push(tokens: list[str], payload: {title, body, data:{workspaceId,sessionId,requestId,kind}}) -> ExpoPushResult` (POST `https://exp.host/--/api/v2/push/send`); Celery `@celery_app.task(name=PUSH_SEND_TASK)`.
- [ ] Failing tests (mock the Expo HTTP API): payload shape, batching, drops `DeviceNotRegistered` tokens (mark `disabled_at`), retry on transient. Run → FAIL.
- [ ] Implement transport + task; enqueue via the outbox from Task 3. Run → PASS. Commit `feat(server): Expo push delivery task`.

### Task 5: Runtime emit (Rust, fire-and-forget)
**Files:** `anyharness/crates/anyharness-lib/src/domains/.../interactions*` — add a notifier that POSTs to the webhook when an interaction is requested / session goes awaiting; read server URL + `PROLIFERATE_PUSH_SANDBOX_TOKEN` from env (injected at provision).
**Interfaces (Produces):** `fn notify_interaction(ctx, event: &InteractionRequestedEvent | AwaitingInteraction)` — spawns a detached task; deduped by `request_id`; never blocks the session loop; no-op if env unset.
- [ ] Failing Rust test: emit is called on `InteractionRequested`, is non-blocking (returns immediately), dedupes repeat `request_id`, and is a no-op when the token env is absent. Run `cargo test -p anyharness-lib <name>` → FAIL. *(Note: `cargo build --workspace` is RED in this env for an unrelated `libsqlite3-sys`/nightly reason — scope the test to the crate.)*
- [ ] Implement the notifier (reqwest fire-and-forget / tokio::spawn). Run → PASS. Commit `feat(runtime): fire-and-forget interaction push notify`.

### Task 6: Mobile registration + deep-link handling
**Files:** Create `apps/mobile/src/lib/push/{register.ts,handler.ts}`; install `expo-notifications`; wire into app root + the navigation deep-link.
**Interfaces (Produces):** `registerPushToken(apiBaseUrl, authToken)` (get Expo token via `expo-notifications`, POST to `/users/me/push-devices`); `handlePushResponse(response)` → parse `data.{workspaceId,sessionId,requestId}` → navigate to the workspace shell + focus the pending interaction (`proliferate://workspace/{id}?interaction={requestId}`).
- [ ] `npx expo install expo-notifications` + config plugin. Failing test: `parsePushDeepLink(url|data)` → `{workspaceId,sessionId,requestId}`; unknown → null. Run `pnpm --filter @proliferate/mobile test` → FAIL → implement → PASS.
- [ ] Implement `registerPushToken` (on login) + foreground/background handlers + deep-link nav. `pnpm --filter @proliferate/mobile typecheck` green. Commit `feat(mobile): expo push registration + interaction deep-link`.

### Task 7 (HUMAN-GATED DEPLOY): k8s
**Files:** `/Users/nickp/code/infra/k8s/apps/au-syd-0/proliferate/`: `sandbox-netpol.yaml` (add egress allow to the `proliferate` control-plane service only), configmap/secret (inject `PROLIFERATE_PUSH_SANDBOX_TOKEN` per-sandbox at provision — via `kubernetes.py _build_pod`), server image bump.
- [ ] Add the NetworkPolicy egress rule (sandbox ns → control-plane svc:8000 only). GitOps commit + `kubectl apply --server-side --field-manager=kustomize-controller`.
- [ ] Apply the migration to the au-syd-0 DB **deliberately** (review the SQL first), then roll the new server image. Verify `/users/me/push-devices` + an end-to-end interaction push on a device.
- [ ] Merge coordination + deploy (see the release section of the parity plan). **Do not auto-run** — this is the human/checkpoint step.

## Verification
Server pytest (webhook auth, dedupe, delivery mocked, device routes) green; Rust crate test green; mobile typecheck + deep-link test green; end-to-end: create a cloud workspace on the phone, trigger a permission request, push arrives and taps into the approval card.
