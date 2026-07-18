from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from proliferate.db.engine import get_async_session
from proliferate.server.cloud.push.models import (
    PushInteractionWebhookRequest,
    PushInteractionWebhookResponse,
)
from proliferate.server.cloud.push.service import handle_interaction_webhook

router = APIRouter(prefix="/internal/push", tags=["push"])


@router.post(
    "/interaction",
    response_model=PushInteractionWebhookResponse,
    name="push:interaction_webhook",
    responses={
        401: {
            "description": "Sandbox token is invalid or revoked.",
        },
    },
)
async def interaction_webhook(
    body: PushInteractionWebhookRequest,
    db: AsyncSession = Depends(get_async_session),
) -> PushInteractionWebhookResponse:
    return await handle_interaction_webhook(db, body)
