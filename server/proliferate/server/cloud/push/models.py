"""Request/response models for the runtime interaction push webhook."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

# `permission` | `user_input` | `mcp_elicitation` mirror anyharness's
# InteractionKind; `awaiting` covers a TurnEnded that leaves the session in
# SessionExecutionPhase::AwaitingInteraction (no fresh interaction request, but
# still something the user must act on).
InteractionPushKind = Literal["permission", "user_input", "mcp_elicitation", "awaiting"]


class _CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class PushInteractionWebhookRequest(_CamelModel):
    """Body the anyharness runtime POSTs when an interaction needs a push.

    ``sandbox_token`` is the per-sandbox runtime-worker bearer token minted at
    enrollment (the same token family the worker already uses to authenticate
    back to Cloud); it resolves to the owning user without a separate lookup.
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")

    sandbox_token: str = Field(min_length=1, max_length=512)
    workspace_id: str = Field(min_length=1, max_length=128)
    session_id: str = Field(min_length=1, max_length=128)
    request_id: str = Field(min_length=1, max_length=128)
    kind: InteractionPushKind
    title: str = Field(min_length=1, max_length=500)


class PushInteractionWebhookResponse(_CamelModel):
    # False when this (session_id, request_id) was already claimed (a retry or
    # reconnect) — the caller learns delivery was already handled without
    # treating the duplicate as an error.
    enqueued: bool
