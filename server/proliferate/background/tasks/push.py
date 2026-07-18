"""Push notification delivery task for the background job substrate."""

from __future__ import annotations

import asyncio

from celery import Task

from proliferate.background.celery_app import celery_app
from proliferate.background.config import PUSH_SEND_TASK
from proliferate.background.correlation import CorrelatedTask
from proliferate.server.cloud.push.delivery import deliver_interaction_push

# A late interaction push is worthless to the user (unlike a workflow
# notification, where late delivery is still correct) — so, unlike the
# workflow tasks this was copied from, both the retry COUNT and the time a
# retried message is allowed to sit in the broker queue are bounded.
PUSH_SEND_MAX_RETRIES = 5
# 5 minutes: how long a single retried delivery attempt may sit queued
# before RabbitMQ discards it, so a backlog can't deliver a stale push many
# minutes late. Passed explicitly on every ``self.retry()`` call below rather
# than as a task-level default: Celery's ``Task.retry()`` always carries the
# ORIGINAL request's ``expires`` (``None`` for a first-attempt task enqueued
# via the outbox relay, which does not set one) into the retried signature's
# options unless a call-level ``expires`` explicitly overrides it, so a
# class-level default alone is silently ignored on every retry.
PUSH_SEND_RETRY_EXPIRES_SECONDS = 300


@celery_app.task(
    base=CorrelatedTask,
    name=PUSH_SEND_TASK,
    bind=True,
    retry_backoff=True,
    retry_backoff_max=60,
    max_retries=PUSH_SEND_MAX_RETRIES,
)
def send_expo_push_task(
    self: Task,
    user_id: str,
    workspace_id: str,
    session_id: str,
    request_id: str,
    kind: str,
    title: str,
    tokens: list[str] | None = None,
) -> bool:
    """Deliver one interaction push, retrying only tokens that need it.

    ``tokens`` is ``None`` on the initial delivery (send to every active
    device) and an explicit list on a retry (send to only the tokens that
    transiently failed last attempt) — a token that already received an
    "ok" ticket, or was disabled, is never included and so never re-sent.
    """

    retry_kwargs = {
        "user_id": user_id,
        "workspace_id": workspace_id,
        "session_id": session_id,
        "request_id": request_id,
        "kind": kind,
        "title": title,
    }
    try:
        outcome = asyncio.run(
            deliver_interaction_push(
                user_id=user_id,
                workspace_id=workspace_id,
                session_id=session_id,
                request_id=request_id,
                kind=kind,
                title=title,
                tokens=tokens,
            )
        )
    except Exception as exc:
        # The Expo request itself failed (network/5xx) before any ticket was
        # produced, or some other unexpected error occurred: retry the SAME
        # token set this attempt used — never a fresh, wider lookup.
        raise self.retry(
            exc=exc,
            kwargs={**retry_kwargs, "tokens": tokens},
            expires=PUSH_SEND_RETRY_EXPIRES_SECONDS,
        ) from exc

    if outcome.retry_tokens:
        raise self.retry(
            kwargs={**retry_kwargs, "tokens": list(outcome.retry_tokens)},
            expires=PUSH_SEND_RETRY_EXPIRES_SECONDS,
        )

    return outcome.sent
