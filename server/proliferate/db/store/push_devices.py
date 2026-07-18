"""Persistence helpers for registered push devices."""

from __future__ import annotations

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from proliferate.db.models.auth import UserPushDevice
from proliferate.utils.time import utcnow


async def list_active_expo_tokens_for_user(db: AsyncSession, user_id: UUID) -> list[str]:
    result = await db.execute(
        select(UserPushDevice.expo_push_token).where(
            UserPushDevice.user_id == user_id,
            UserPushDevice.disabled_at.is_(None),
        )
    )
    return list(result.scalars().all())


async def disable_expo_push_tokens(
    db: AsyncSession,
    *,
    user_id: UUID,
    tokens: Sequence[str],
) -> None:
    if not tokens:
        return
    await db.execute(
        update(UserPushDevice)
        .where(
            UserPushDevice.user_id == user_id,
            UserPushDevice.expo_push_token.in_(tokens),
            UserPushDevice.disabled_at.is_(None),
        )
        .values(disabled_at=utcnow())
    )
