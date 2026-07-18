"""Push notification delivery task for the background job substrate."""

from __future__ import annotations

import asyncio

from proliferate.background.celery_app import celery_app
from proliferate.background.config import PUSH_SEND_TASK
from proliferate.background.correlation import CorrelatedTask
from proliferate.server.cloud.push.delivery import deliver_interaction_push


@celery_app.task(
    base=CorrelatedTask,
    name=PUSH_SEND_TASK,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_backoff_max=60,
    max_retries=None,
)
def send_expo_push(
    user_id: str,
    workspace_id: str,
    session_id: str,
    request_id: str,
    kind: str,
    title: str,
) -> bool:
    return asyncio.run(
        deliver_interaction_push(
            user_id=user_id,
            workspace_id=workspace_id,
            session_id=session_id,
            request_id=request_id,
            kind=kind,
            title=title,
        )
    )
