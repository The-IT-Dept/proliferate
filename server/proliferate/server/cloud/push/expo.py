"""Expo push notification transport (POST https://exp.host/--/api/v2/push/send)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

import httpx

EXPO_PUSH_API_URL = "https://exp.host/--/api/v2/push/send"
# Expo's documented maximum messages per push API request.
EXPO_PUSH_BATCH_SIZE = 100

ExpoTicketStatus = Literal["ok", "error"]

# The one per-ticket error code that means the token itself is permanently
# gone: the caller disables it and never sends to it again.
# https://docs.expo.dev/push-notifications/sending-notifications/#individual-errors
DEVICE_NOT_REGISTERED = "DeviceNotRegistered"

# Expo's other documented per-ticket ``details.error`` codes that are also
# permanent (retrying changes nothing — a payload/config problem, not
# upstream trouble) but do NOT mean the token itself is invalid, so the token
# stays enabled:
#   - MessageTooBig: payload exceeded Expo's 4096-byte limit.
#   - MismatchSenderId: FCM server key and google-services.json sender ID
#     mismatch (a credentials-configuration problem).
#   - InvalidCredentials: this app's standalone push credentials are invalid.
#   - InvalidProviderToken: the APNs key/provisioning profile is invalid.
# Source: https://docs.expo.dev/push-notifications/sending-notifications/#individual-errors
_TERMINAL_ERROR_CODES = frozenset(
    {
        "MessageTooBig",
        "MismatchSenderId",
        "InvalidCredentials",
        "InvalidProviderToken",
    }
)

# The one per-ticket error code Expo documents as transient: real
# backpressure, safe (and expected) to retry with backoff. Any code that is
# NOT this, NOT ``DEVICE_NOT_REGISTERED``, and NOT in ``_TERMINAL_ERROR_CODES``
# (including an absent/unrecognized code) is treated as terminal too — when
# unsure whether a new/unknown Expo error code is safe to retry, the safe
# default is to drop it rather than retry it forever.
_TRANSIENT_ERROR_CODES = frozenset({"MessageRateExceeded"})


@dataclass(frozen=True)
class ExpoPushTicket:
    token: str
    status: ExpoTicketStatus
    error_code: str | None = None


@dataclass(frozen=True)
class ExpoPushResult:
    tickets: tuple[ExpoPushTicket, ...]

    @property
    def tokens_to_disable(self) -> tuple[str, ...]:
        return tuple(
            ticket.token
            for ticket in self.tickets
            if ticket.status == "error" and ticket.error_code == DEVICE_NOT_REGISTERED
        )

    @property
    def transient_tokens(self) -> tuple[str, ...]:
        """Tokens whose ticket reported a genuinely transient error.

        The caller retries ONLY these — never a token that already got an
        "ok" ticket, was disabled (``DEVICE_NOT_REGISTERED``), or hit a
        terminal error (``terminal_tokens``).
        """
        return tuple(
            ticket.token
            for ticket in self.tickets
            if ticket.status == "error" and ticket.error_code in _TRANSIENT_ERROR_CODES
        )

    @property
    def terminal_tokens(self) -> tuple[str, ...]:
        """Tokens whose ticket reported a permanent, non-disable error.

        Retrying would never succeed (a payload or push-credentials problem,
        or an unrecognized code — defaulted to terminal rather than retried
        forever), but the token itself may still be good, so it is dropped
        for this delivery without being disabled.
        """
        return tuple(
            ticket.token
            for ticket in self.tickets
            if ticket.status == "error"
            and ticket.error_code != DEVICE_NOT_REGISTERED
            and ticket.error_code not in _TRANSIENT_ERROR_CODES
        )

    @property
    def has_transient_failures(self) -> bool:
        return bool(self.transient_tokens)


class ExpoPushTransportError(Exception):
    """The Expo push API request itself failed.

    Covers network errors, a non-2xx response, or a request-level error body —
    always retryable at the caller's discretion, unlike a per-ticket error
    (which ``ExpoPushResult`` reports per token instead of raising).
    """


def _batches(tokens: list[str], size: int) -> list[list[str]]:
    return [tokens[i : i + size] for i in range(0, len(tokens), size)]


async def send_expo_push(
    tokens: list[str],
    payload: dict[str, Any],
    *,
    access_token: str = "",
    batch_size: int = EXPO_PUSH_BATCH_SIZE,
    client: httpx.AsyncClient | None = None,
) -> ExpoPushResult:
    """Send one push message (shared title/body/data) to each of ``tokens``.

    Splits ``tokens`` into batches of at most ``batch_size`` (Expo's push API
    accepts an array of messages per request) and issues one POST per batch.
    Returns a per-token ticket for every token; raises ``ExpoPushTransportError``
    only when a batch request itself fails (never for a per-ticket error, which
    is a normal, expected outcome the caller acts on via ``ExpoPushResult``).
    """

    if not tokens:
        return ExpoPushResult(tickets=())

    title = str(payload.get("title", ""))
    body = str(payload.get("body", ""))
    data = payload.get("data") or {}

    headers = {"content-type": "application/json", "accept": "application/json"}
    if access_token:
        headers["authorization"] = f"Bearer {access_token}"

    owns_client = client is None
    http_client = client or httpx.AsyncClient(timeout=10.0)
    tickets: list[ExpoPushTicket] = []
    try:
        for batch in _batches(tokens, batch_size):
            messages = [
                {"to": token, "title": title, "body": body, "data": data} for token in batch
            ]
            try:
                response = await http_client.post(
                    EXPO_PUSH_API_URL,
                    json=messages,
                    headers=headers,
                )
            except httpx.HTTPError as exc:
                raise ExpoPushTransportError(f"Expo push request failed: {exc}") from exc

            if response.status_code != 200:
                raise ExpoPushTransportError(
                    f"Expo push API returned {response.status_code}: {response.text[:300]}"
                )

            response_body = response.json()
            if response_body.get("errors"):
                raise ExpoPushTransportError(
                    f"Expo push API returned request-level errors: {response_body['errors']}"
                )

            entries = response_body.get("data") or []
            if len(entries) != len(batch):
                raise ExpoPushTransportError(
                    "Expo push API returned a ticket count that does not match the batch size."
                )
            for token, entry in zip(batch, entries, strict=True):
                if entry.get("status") == "ok":
                    tickets.append(ExpoPushTicket(token=token, status="ok"))
                else:
                    details = entry.get("details") or {}
                    tickets.append(
                        ExpoPushTicket(
                            token=token,
                            status="error",
                            error_code=details.get("error"),
                        )
                    )
    finally:
        if owns_client:
            await http_client.aclose()

    return ExpoPushResult(tickets=tuple(tickets))
