"""Authenticated user profile routes."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Response, status
from pydantic import BaseModel, ConfigDict, EmailStr, Field, TypeAdapter, field_validator
from pydantic.alias_generators import to_camel
from sqlalchemy import update as sa_update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from proliferate.auth.dependencies import current_active_user
from proliferate.auth.models import UserRead
from proliferate.db.engine import get_async_session
from proliferate.db.models.auth import User, UserPushDevice
from proliferate.utils.time import utcnow

router = APIRouter(prefix="/users", tags=["users"])

_email_adapter = TypeAdapter(EmailStr)


class _CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class PushDeviceRegisterRequest(_CamelModel):
    """Register (or re-register) an Expo push token for the current user.

    Upserts on ``(user, expo_push_token)``: re-registering the same token
    updates ``platform`` and clears ``disabled_at`` instead of duplicating.
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    expo_push_token: str = Field(min_length=1, max_length=256)
    platform: Literal["ios", "android"]


class PushDeviceResponse(_CamelModel):
    id: str
    expo_push_token: str
    platform: str
    created_at: datetime
    updated_at: datetime


class ProfileUpdateRequest(BaseModel):
    """Editable fields on the authenticated user's own profile.

    ``outreach_email`` is an optional override address for support/outreach
    follow-up. Sending ``null`` or an empty/whitespace string clears it (falls
    back to the account email); any other value must look like an email.
    Unknown fields are rejected (422) so credential fields like ``password``
    can never ride through this endpoint.
    """

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    outreach_email: str | None = None

    @field_validator("outreach_email")
    @classmethod
    def _validate_outreach_email(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        if not cleaned:
            return None
        # Raises pydantic ValidationError (-> 422) when it does not look like an
        # email. Normalize to the validated address.
        return str(_email_adapter.validate_python(cleaned))


@router.get(
    "/me",
    response_model=UserRead,
    name="users:current_user",
    responses={
        401: {
            "description": "Missing token or inactive user.",
        },
    },
)
async def current_user_profile(
    user: User = Depends(current_active_user),
) -> UserRead:
    return UserRead.model_validate(user)


@router.patch(
    "/me",
    response_model=UserRead,
    name="users:update_current_user",
    responses={
        401: {
            "description": "Missing token or inactive user.",
        },
        422: {
            "description": "outreach_email is not a valid email address.",
        },
    },
)
async def update_current_user_profile(
    body: ProfileUpdateRequest,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
) -> UserRead:
    if "outreach_email" in body.model_fields_set:
        user.outreach_email = body.outreach_email
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserRead.model_validate(user)


@router.post(
    "/me/push-devices",
    response_model=PushDeviceResponse,
    name="users:register_push_device",
    responses={
        401: {
            "description": "Missing token or inactive user.",
        },
    },
)
async def register_push_device(
    body: PushDeviceRegisterRequest,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
) -> PushDeviceResponse:
    now = utcnow()
    statement = (
        pg_insert(UserPushDevice)
        .values(
            id=uuid.uuid4(),
            user_id=user.id,
            expo_push_token=body.expo_push_token,
            platform=body.platform,
            created_at=now,
            updated_at=now,
            disabled_at=None,
        )
        .on_conflict_do_update(
            constraint="uq_user_push_device_token",
            set_={
                "platform": body.platform,
                "updated_at": now,
                "disabled_at": None,
            },
        )
        .returning(UserPushDevice.id)
    )
    device_id = (await db.execute(statement)).scalar_one()
    device = await db.get(UserPushDevice, device_id)
    if device is None:
        raise RuntimeError("Push device was not persisted.")
    await db.commit()
    return PushDeviceResponse(
        id=str(device.id),
        expo_push_token=device.expo_push_token,
        platform=device.platform,
        created_at=device.created_at,
        updated_at=device.updated_at,
    )


@router.delete(
    "/me/push-devices/{expo_push_token}",
    status_code=status.HTTP_204_NO_CONTENT,
    name="users:unregister_push_device",
    responses={
        401: {
            "description": "Missing token or inactive user.",
        },
    },
)
async def unregister_push_device(
    expo_push_token: str,
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session),
) -> Response:
    # Idempotent: unregistering a token that is not registered (never was, or
    # already disabled) is a successful no-op, not a 404 — the caller's desired
    # end state (this device does not receive pushes) already holds.
    await db.execute(
        sa_update(UserPushDevice)
        .where(
            UserPushDevice.user_id == user.id,
            UserPushDevice.expo_push_token == expo_push_token,
            UserPushDevice.disabled_at.is_(None),
        )
        .values(disabled_at=utcnow())
    )
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
