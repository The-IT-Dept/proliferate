"""Interaction push delivery: loads a user's devices, sends via Expo, reconciles token state."""

from __future__ import annotations

from uuid import UUID

from proliferate.config import settings
from proliferate.db import engine as db_engine
from proliferate.db.store.push_devices import (
    disable_expo_push_tokens,
    list_active_expo_tokens_for_user,
)
from proliferate.server.cloud.push.expo import send_expo_push

_KIND_BODY: dict[str, str] = {
    "permission": "Tap to review the request.",
    "user_input": "Tap to respond.",
    "mcp_elicitation": "Tap to respond.",
    "awaiting": "Tap to continue.",
}
_DEFAULT_BODY = "Tap to open."


def build_expo_payload(
    *,
    title: str,
    workspace_id: str,
    session_id: str,
    request_id: str,
    kind: str,
) -> dict[str, object]:
    return {
        "title": title,
        "body": _KIND_BODY.get(kind, _DEFAULT_BODY),
        "data": {
            "workspaceId": workspace_id,
            "sessionId": session_id,
            "requestId": request_id,
            "kind": kind,
        },
    }


async def deliver_interaction_push(
    *,
    user_id: str,
    workspace_id: str,
    session_id: str,
    request_id: str,
    kind: str,
    title: str,
) -> bool:
    """Send an interaction push to every active device of ``user_id``.

    Disables any token Expo reports as permanently gone
    (``DeviceNotRegistered``). Raises when any ticket reports a non-permanent
    (transient) error so the Celery task retries the whole delivery — a retry
    safely re-reads the (by-then-current) active token list, so a token
    already disabled by this same call is never retried.

    Returns ``False`` (a no-op, not an error) when the user has no active
    devices registered.
    """

    async with db_engine.async_session_factory() as db, db.begin():
        tokens = await list_active_expo_tokens_for_user(db, UUID(user_id))

    if not tokens:
        return False

    payload = build_expo_payload(
        title=title,
        workspace_id=workspace_id,
        session_id=session_id,
        request_id=request_id,
        kind=kind,
    )
    result = await send_expo_push(
        tokens,
        payload,
        access_token=settings.expo_push_access_token,
    )

    if result.tokens_to_disable:
        async with db_engine.async_session_factory() as db, db.begin():
            await disable_expo_push_tokens(
                db,
                user_id=UUID(user_id),
                tokens=result.tokens_to_disable,
            )

    if result.has_transient_failures:
        raise RuntimeError("Expo push delivery reported a transient per-token failure.")

    return True
