"""Interaction push delivery: loads a user's devices, sends via Expo, reconciles token state."""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import dataclass
from uuid import UUID

from proliferate.config import settings
from proliferate.db import engine as db_engine
from proliferate.db.store.push_devices import (
    disable_expo_push_tokens,
    list_active_expo_tokens_for_user,
)
from proliferate.server.cloud.push.expo import send_expo_push

logger = logging.getLogger(__name__)

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


@dataclass(frozen=True)
class PushDeliveryOutcome:
    """Result of one delivery attempt (one Expo API round-trip).

    ``sent`` is ``False`` only when there were no tokens to send to at all (a
    no-op, not a failure). ``retry_tokens`` carries exactly the tokens whose
    ticket came back with a genuinely transient error (Expo rate limiting) —
    never a token that already got an "ok" ticket, was disabled
    (``DeviceNotRegistered``), or hit a terminal per-ticket error. The caller
    (the Celery task) retries ONLY ``retry_tokens``.
    """

    sent: bool
    retry_tokens: tuple[str, ...] = ()


async def deliver_interaction_push(
    *,
    user_id: str,
    workspace_id: str,
    session_id: str,
    request_id: str,
    kind: str,
    title: str,
    tokens: Sequence[str] | None = None,
) -> PushDeliveryOutcome:
    """Send an interaction push to ``tokens``, or every active device of ``user_id``.

    ``tokens`` is the explicit token set to send to (used by a retry, so it
    resends only to the tokens that transiently failed last attempt). When
    omitted (the initial delivery), it defaults to every currently active
    device token for ``user_id``.

    Disables any token Expo reports as permanently gone
    (``DeviceNotRegistered``). Logs and drops tokens with a terminal
    per-ticket error (payload/credentials problems that retrying can't fix)
    without disabling them — the token itself may still be valid. Never
    raises for a per-ticket error of any kind; only a transport-level failure
    (the whole Expo request failing, e.g. network/5xx — see
    ``ExpoPushTransportError``) or another unexpected error propagates, for
    the Celery task to retry with the same token set this attempt used.

    Returns ``sent=False`` (a no-op, not an error) when there are no tokens
    to send to.
    """

    if tokens is None:
        async with db_engine.async_session_factory() as db, db.begin():
            resolved_tokens = await list_active_expo_tokens_for_user(db, UUID(user_id))
    else:
        resolved_tokens = list(tokens)

    if not resolved_tokens:
        return PushDeliveryOutcome(sent=False)

    payload = build_expo_payload(
        title=title,
        workspace_id=workspace_id,
        session_id=session_id,
        request_id=request_id,
        kind=kind,
    )
    result = await send_expo_push(
        resolved_tokens,
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

    if result.terminal_tokens:
        logger.warning(
            "push_delivery_terminal_ticket_error: dropping %d token(s) after a "
            "permanent Expo ticket error (not retried, not disabled)",
            len(result.terminal_tokens),
        )

    return PushDeliveryOutcome(sent=True, retry_tokens=result.transient_tokens)
