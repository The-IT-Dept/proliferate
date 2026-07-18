"""Automation API routes."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from proliferate.auth.dependencies import current_product_user
from proliferate.constants.automations import (
    AUTOMATION_RUN_LIST_DEFAULT_LIMIT,
    AUTOMATION_RUN_LIST_MAX_LIMIT,
)
from proliferate.db.engine import get_async_session
from proliferate.db.models.auth import User
from proliferate.server.automations.models import (
    AutomationListResponse,
    AutomationResponse,
    AutomationRunListResponse,
    AutomationRunResponse,
    CreateAutomationRequest,
    UpdateAutomationRequest,
    automation_payload,
    automation_run_payload,
)
from proliferate.server.automations.service import (
    create_automation,
    get_automation,
    list_automation_runs,
    list_automations,
    pause_automation,
    resume_automation,
    run_automation_now,
    update_automation,
)

router = APIRouter(prefix="/automations", tags=["automations"])


@router.get("", response_model=AutomationListResponse)
async def list_automations_endpoint(
    owner_scope: Annotated[str, Query(alias="ownerScope")] = "personal",
    organization_id: Annotated[UUID | None, Query(alias="organizationId")] = None,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_product_user),
) -> AutomationListResponse:
    values = await list_automations(
        db,
        user.id,
        owner_scope=owner_scope,
        organization_id=organization_id,
    )
    return AutomationListResponse(automations=[automation_payload(value) for value in values])


@router.post("", response_model=AutomationResponse)
async def create_automation_endpoint(
    body: CreateAutomationRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_product_user),
) -> AutomationResponse:
    return automation_payload(await create_automation(db, user.id, body))


@router.get("/{automation_id}", response_model=AutomationResponse)
async def get_automation_endpoint(
    automation_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_product_user),
) -> AutomationResponse:
    return automation_payload(await get_automation(db, user.id, automation_id))


@router.patch("/{automation_id}", response_model=AutomationResponse)
async def update_automation_endpoint(
    automation_id: UUID,
    body: UpdateAutomationRequest,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_product_user),
) -> AutomationResponse:
    return automation_payload(await update_automation(db, user.id, automation_id, body))


@router.post("/{automation_id}/pause", response_model=AutomationResponse)
async def pause_automation_endpoint(
    automation_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_product_user),
) -> AutomationResponse:
    return automation_payload(await pause_automation(db, user.id, automation_id))


@router.post("/{automation_id}/resume", response_model=AutomationResponse)
async def resume_automation_endpoint(
    automation_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_product_user),
) -> AutomationResponse:
    return automation_payload(await resume_automation(db, user.id, automation_id))


@router.post("/{automation_id}/run-now", response_model=AutomationRunResponse)
async def run_automation_now_endpoint(
    automation_id: UUID,
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_product_user),
) -> AutomationRunResponse:
    return automation_run_payload(await run_automation_now(db, user.id, automation_id))


@router.get("/{automation_id}/runs", response_model=AutomationRunListResponse)
async def list_automation_runs_endpoint(
    automation_id: UUID,
    limit: Annotated[int, Query(ge=1, le=AUTOMATION_RUN_LIST_MAX_LIMIT)] = (
        AUTOMATION_RUN_LIST_DEFAULT_LIMIT
    ),
    db: AsyncSession = Depends(get_async_session),
    user: User = Depends(current_product_user),
) -> AutomationRunListResponse:
    values = await list_automation_runs(db, user.id, automation_id, limit=limit)
    return AutomationRunListResponse(runs=[automation_run_payload(value) for value in values])
