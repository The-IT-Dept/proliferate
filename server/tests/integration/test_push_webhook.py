from __future__ import annotations

from uuid import UUID

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from proliferate.background.config import NOTIFICATIONS_QUEUE, PUSH_SEND_TASK
from proliferate.config import settings
from proliferate.constants.cloud import CloudSandboxStatus, CloudSandboxType
from proliferate.db.models.auth import User
from proliferate.db.models.background import BackgroundOutboxTask
from proliferate.db.models.cloud.sandboxes import CloudSandbox
from proliferate.db.store import runtime_workers as runtime_workers_store
from proliferate.server.cloud.runtime_workers import service as runtime_workers_service
from proliferate.server.cloud.runtime_workers.models import WorkerEnrollRequest

WEBHOOK_PATH = "/v1/internal/push/interaction"


@pytest.fixture(autouse=True)
def _worker_cloud_base_url(monkeypatch: pytest.MonkeyPatch) -> None:
    # enroll_worker() mints an integration-gateway config that requires this to
    # be set; the push webhook itself never uses it; the fixture just clears
    # the way for the shared enrollment helper to mint a worker token.
    monkeypatch.setattr(settings, "cloud_worker_base_url", "http://cloud.test")


async def _create_owner(db_session: AsyncSession, *, email: str) -> str:
    user = User(
        email=email,
        hashed_password="unused-oauth-only",
        is_active=True,
        is_superuser=False,
        is_verified=True,
        display_name="Push Webhook Owner",
    )
    db_session.add(user)
    await db_session.commit()
    return str(user.id)


async def _provision_cloud_sandbox_worker_token(
    db_session: AsyncSession,
    *,
    owner_user_id: str,
) -> tuple[str, UUID]:
    """Mint a runtime-worker bearer token via the real enrollment flow.

    Mirrors how a cloud sandbox actually gets its token at provision time:
    mint a pending enrollment for the sandbox, then exchange it for a worker
    token — the same token family the worker already uses to authenticate
    back to Cloud (``CloudRuntimeWorker.token_hash``).

    Returns ``(worker_token, cloud_sandbox_id)`` — the sandbox id is exposed
    because the push dedupe key is scoped to it (Fix 2).
    """
    sandbox = CloudSandbox(
        owner_user_id=UUID(owner_user_id),
        sandbox_type=CloudSandboxType.e2b,
        status=CloudSandboxStatus.ready,
    )
    db_session.add(sandbox)
    await db_session.flush()

    enrollment_token = await runtime_workers_service.create_cloud_sandbox_enrollment(
        db_session,
        cloud_sandbox_id=sandbox.id,
        owner_user_id=UUID(owner_user_id),
    )
    enroll_response = await runtime_workers_service.enroll_worker(
        db_session,
        request=WorkerEnrollRequest(enrollment_token=enrollment_token),
    )
    await db_session.commit()
    return enroll_response.worker_token, sandbox.id


async def _outbox_rows_for_idempotency_key(
    db_session: AsyncSession,
    idempotency_key: str,
) -> list[BackgroundOutboxTask]:
    db_session.expire_all()
    result = await db_session.execute(
        select(BackgroundOutboxTask).where(BackgroundOutboxTask.idempotency_key == idempotency_key)
    )
    return list(result.scalars().all())


class TestInteractionPushWebhook:
    async def test_valid_token_and_new_request_enqueues_one_delivery(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        owner_user_id = await _create_owner(db_session, email="push-webhook-owner@example.com")
        token, cloud_sandbox_id = await _provision_cloud_sandbox_worker_token(
            db_session, owner_user_id=owner_user_id
        )

        response = await client.post(
            WEBHOOK_PATH,
            json={
                "sandboxToken": token,
                "workspaceId": "workspace-1",
                "sessionId": "session-1",
                "requestId": "request-1",
                "kind": "permission",
                "title": "Approve file write?",
            },
        )

        assert response.status_code == 200, response.text
        assert response.json() == {"enqueued": True}

        rows = await _outbox_rows_for_idempotency_key(
            db_session, f"push-interaction:{cloud_sandbox_id}:session-1:request-1"
        )
        assert len(rows) == 1
        row = rows[0]
        assert row.task_name == PUSH_SEND_TASK
        assert row.queue == NOTIFICATIONS_QUEUE
        assert row.kwargs_json == {
            "user_id": owner_user_id,
            "workspace_id": "workspace-1",
            "session_id": "session-1",
            "request_id": "request-1",
            "kind": "permission",
            "title": "Approve file write?",
        }

    async def test_duplicate_session_and_request_does_not_enqueue_twice(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        owner_user_id = await _create_owner(db_session, email="push-webhook-duplicate@example.com")
        token, cloud_sandbox_id = await _provision_cloud_sandbox_worker_token(
            db_session, owner_user_id=owner_user_id
        )
        payload = {
            "sandboxToken": token,
            "workspaceId": "workspace-2",
            "sessionId": "session-2",
            "requestId": "request-2",
            "kind": "user_input",
            "title": "Need input",
        }

        first = await client.post(WEBHOOK_PATH, json=payload)
        second = await client.post(WEBHOOK_PATH, json=payload)

        assert first.status_code == 200
        assert first.json() == {"enqueued": True}
        assert second.status_code == 200
        assert second.json() == {"enqueued": False}

        rows = await _outbox_rows_for_idempotency_key(
            db_session, f"push-interaction:{cloud_sandbox_id}:session-2:request-2"
        )
        assert len(rows) == 1

    async def test_same_session_and_request_across_different_sandboxes_both_enqueue(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        # Fix 2 regression: the dedupe key must be scoped to the resolved
        # sandbox identity, not just the body-supplied (session_id,
        # request_id) pair. Two different sandboxes that happen to report
        # the identical pair must each get their own push — one sandbox must
        # never be able to pre-claim the other's slot. (A single owner can
        # have at most one active personal sandbox, so this needs two
        # owners; that's incidental to what's under test here, which is the
        # sandbox scoping, not the owner scoping — see the dedicated
        # two-owner authz test for that.)
        owner_a = await _create_owner(db_session, email="push-webhook-cross-sandbox-a@example.com")
        owner_b = await _create_owner(db_session, email="push-webhook-cross-sandbox-b@example.com")
        token_a, sandbox_a = await _provision_cloud_sandbox_worker_token(
            db_session, owner_user_id=owner_a
        )
        token_b, sandbox_b = await _provision_cloud_sandbox_worker_token(
            db_session, owner_user_id=owner_b
        )
        assert sandbox_a != sandbox_b

        response_a = await client.post(
            WEBHOOK_PATH,
            json={
                "sandboxToken": token_a,
                "workspaceId": "workspace-2b",
                "sessionId": "shared-session",
                "requestId": "shared-request",
                "kind": "user_input",
                "title": "Need input A",
            },
        )
        response_b = await client.post(
            WEBHOOK_PATH,
            json={
                "sandboxToken": token_b,
                "workspaceId": "workspace-2b",
                "sessionId": "shared-session",
                "requestId": "shared-request",
                "kind": "user_input",
                "title": "Need input B",
            },
        )

        assert response_a.status_code == 200
        assert response_a.json() == {"enqueued": True}
        assert response_b.status_code == 200
        assert response_b.json() == {"enqueued": True}

        rows_a = await _outbox_rows_for_idempotency_key(
            db_session, f"push-interaction:{sandbox_a}:shared-session:shared-request"
        )
        rows_b = await _outbox_rows_for_idempotency_key(
            db_session, f"push-interaction:{sandbox_b}:shared-session:shared-request"
        )
        assert len(rows_a) == 1
        assert len(rows_b) == 1

    async def test_bad_token_is_unauthorized(self, client: AsyncClient) -> None:
        response = await client.post(
            WEBHOOK_PATH,
            json={
                "sandboxToken": "not-a-real-token",
                "workspaceId": "workspace-3",
                "sessionId": "session-3",
                "requestId": "request-3",
                "kind": "mcp_elicitation",
                "title": "Elicitation",
            },
        )
        assert response.status_code == 401

    async def test_revoked_worker_token_is_unauthorized(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        owner_user_id = await _create_owner(db_session, email="push-webhook-revoked@example.com")
        token, _cloud_sandbox_id = await _provision_cloud_sandbox_worker_token(
            db_session, owner_user_id=owner_user_id
        )

        worker = await runtime_workers_store.get_worker_by_token_hash(
            db_session,
            token_hash=runtime_workers_store.hash_worker_token(token),
        )
        assert worker is not None
        await runtime_workers_store.revoke_active_workers_for_identity(
            db_session,
            cloud_sandbox_id=worker.cloud_sandbox_id,
            owner_user_id=UUID(owner_user_id),
            desktop_install_id=None,
        )
        await db_session.commit()

        response = await client.post(
            WEBHOOK_PATH,
            json={
                "sandboxToken": token,
                "workspaceId": "workspace-4",
                "sessionId": "session-4",
                "requestId": "request-4",
                "kind": "awaiting",
                "title": "Awaiting interaction",
            },
        )
        assert response.status_code == 401

    async def test_resolves_owner_from_token_not_request_body(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        # The webhook body carries no owner/user field at all: owner resolution
        # must come entirely from the sandbox token, never from client input.
        owner_user_id = await _create_owner(db_session, email="push-webhook-owner-2@example.com")
        token, cloud_sandbox_id = await _provision_cloud_sandbox_worker_token(
            db_session, owner_user_id=owner_user_id
        )

        response = await client.post(
            WEBHOOK_PATH,
            json={
                "sandboxToken": token,
                "workspaceId": "workspace-5",
                "sessionId": "session-5",
                "requestId": "request-5",
                "kind": "permission",
                "title": "Approve?",
            },
        )
        assert response.status_code == 200

        rows = await _outbox_rows_for_idempotency_key(
            db_session, f"push-interaction:{cloud_sandbox_id}:session-5:request-5"
        )
        assert rows[0].kwargs_json["user_id"] == owner_user_id

    async def test_rejects_unknown_kind(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        owner_user_id = await _create_owner(db_session, email="push-webhook-bad-kind@example.com")
        token, _cloud_sandbox_id = await _provision_cloud_sandbox_worker_token(
            db_session, owner_user_id=owner_user_id
        )

        response = await client.post(
            WEBHOOK_PATH,
            json={
                "sandboxToken": token,
                "workspaceId": "workspace-6",
                "sessionId": "session-6",
                "requestId": "request-6",
                "kind": "not_a_real_kind",
                "title": "Bad kind",
            },
        )
        assert response.status_code == 422
