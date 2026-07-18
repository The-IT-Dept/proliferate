"""Runtime interaction push webhook: auth, dedupe, and delivery enqueue."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from proliferate.background.config import NOTIFICATIONS_QUEUE, PUSH_SEND_TASK
from proliferate.db.store import runtime_workers as runtime_workers_store
from proliferate.db.store.background_outbox import enqueue_outbox_task
from proliferate.db.store.billing_runtime_usage import (
    claim_webhook_event,
    mark_webhook_event_processed,
)
from proliferate.server.cloud.errors import CloudApiError
from proliferate.server.cloud.push.models import (
    PushInteractionWebhookRequest,
    PushInteractionWebhookResponse,
)

# Dedupe receipt provider for `(session_id, request_id)` — one push per
# interaction even across retries/reconnects (Global Constraints, mobile push
# plan). Deliberately distinct from the E2B/billing/Slack receipt providers so
# a collision there can never suppress or be suppressed by a push delivery.
PUSH_INTERACTION_RECEIPT_PROVIDER = "push_interaction"


async def handle_interaction_webhook(
    db: AsyncSession,
    body: PushInteractionWebhookRequest,
) -> PushInteractionWebhookResponse:
    worker = await runtime_workers_store.get_worker_by_token_hash(
        db,
        token_hash=runtime_workers_store.hash_worker_token(body.sandbox_token),
    )
    if worker is None:
        raise CloudApiError(
            "push_webhook_unauthorized",
            "Sandbox token is invalid or revoked.",
            status_code=401,
        )

    claim = await claim_webhook_event(
        db,
        provider=PUSH_INTERACTION_RECEIPT_PROVIDER,
        event_id=f"{body.session_id}:{body.request_id}",
        event_type=body.kind,
        external_sandbox_id=(
            str(worker.cloud_sandbox_id) if worker.cloud_sandbox_id is not None else None
        ),
    )
    if claim.status != "claimed" or claim.receipt is None:
        # Already claimed by an earlier delivery of this same interaction (a
        # runtime retry/reconnect) or a concurrent in-flight claim: never a
        # second enqueue.
        return PushInteractionWebhookResponse(enqueued=False)

    await enqueue_outbox_task(
        db,
        task_name=PUSH_SEND_TASK,
        queue=NOTIFICATIONS_QUEUE,
        kwargs_json={
            "user_id": str(worker.owner_user_id),
            "workspace_id": body.workspace_id,
            "session_id": body.session_id,
            "request_id": body.request_id,
            "kind": body.kind,
            "title": body.title,
        },
        idempotency_key=f"push-interaction:{body.session_id}:{body.request_id}",
    )
    await mark_webhook_event_processed(db, receipt_id=claim.receipt.id)
    return PushInteractionWebhookResponse(enqueued=True)
