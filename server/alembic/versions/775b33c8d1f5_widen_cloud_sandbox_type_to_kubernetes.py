"""widen cloud sandbox type to kubernetes

Revision ID: 775b33c8d1f5
Revises: e94a7c1d6b20
Create Date: 2026-07-18 09:42:39.016545

"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "775b33c8d1f5"
down_revision: str | Sequence[str] | None = "e94a7c1d6b20"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint("ck_cloud_sandbox_type", "cloud_sandbox", type_="check")
    op.create_check_constraint(
        "ck_cloud_sandbox_type",
        "cloud_sandbox",
        "sandbox_type IN ('e2b', 'kubernetes')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_cloud_sandbox_type", "cloud_sandbox", type_="check")
    op.create_check_constraint(
        "ck_cloud_sandbox_type",
        "cloud_sandbox",
        "sandbox_type IN ('e2b')",
    )
