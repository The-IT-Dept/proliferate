"""Behavioral proof for the widened ``ck_cloud_sandbox_type`` check constraint.

Revision ``775b33c8d1f5`` widens the constraint to
``sandbox_type IN ('e2b', 'kubernetes')``. ``schema_migration_assertions.py``
already asserts the constraint's ``sqltext`` mentions both values, which
proves the constraint's *definition* changed but not that Postgres actually
*enforces* it. This module inserts directly against the migrated schema (raw
SQL, bypassing the ORM's ``Enum(..., validate_strings=True)`` type — which
would reject an invalid string in Python before it ever reaches the
database) to prove the constraint governs real INSERTs: a ``kubernetes`` row
is accepted, and a bogus ``sandbox_type`` is rejected by Postgres itself.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from proliferate.db.models.auth import User

_INSERT_SANDBOX = text(
    "INSERT INTO cloud_sandbox "
    "(id, owner_user_id, sandbox_type, status, created_at, updated_at) "
    "VALUES (:id, :owner, :sandbox_type, 'ready', now(), now())"
)


async def _seed_user(db: AsyncSession) -> uuid.UUID:
    user = User(
        email=f"sandbox-type-{uuid.uuid4()}@example.com",
        hashed_password="x",
        is_active=True,
        is_superuser=False,
        is_verified=True,
    )
    db.add(user)
    await db.flush()
    return user.id


@pytest.mark.asyncio
async def test_cloud_sandbox_type_accepts_kubernetes(db_session: AsyncSession) -> None:
    user_id = await _seed_user(db_session)
    sandbox_id = uuid.uuid4()

    await db_session.execute(
        _INSERT_SANDBOX,
        {"id": sandbox_id, "owner": user_id, "sandbox_type": "kubernetes"},
    )

    stored_type = (
        await db_session.execute(
            text("SELECT sandbox_type FROM cloud_sandbox WHERE id = :id"),
            {"id": sandbox_id},
        )
    ).scalar_one()
    assert stored_type == "kubernetes"


@pytest.mark.asyncio
async def test_cloud_sandbox_type_rejects_invalid_value(db_session: AsyncSession) -> None:
    user_id = await _seed_user(db_session)

    # Same shape as the accepted-value insert above (every NOT NULL column
    # populated) so this can only fail on the check constraint under test,
    # never on a null-column violation.
    with pytest.raises(IntegrityError) as exc_info:
        await db_session.execute(
            _INSERT_SANDBOX,
            {"id": uuid.uuid4(), "owner": user_id, "sandbox_type": "bogus"},
        )

    assert "ck_cloud_sandbox_type" in str(exc_info.value)
