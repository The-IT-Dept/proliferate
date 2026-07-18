from __future__ import annotations

import json
from uuid import UUID

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from proliferate.background.config import PUSH_SEND_TASK
from proliferate.db.models.auth import User, UserPushDevice
from proliferate.server.cloud.push import delivery as delivery_module
from proliferate.server.cloud.push.delivery import (
    PushDeliveryOutcome,
    build_expo_payload,
    deliver_interaction_push,
)
from proliferate.server.cloud.push.expo import (
    EXPO_PUSH_API_URL,
    ExpoPushResult,
    ExpoPushTicket,
    ExpoPushTransportError,
    send_expo_push,
)


@pytest.fixture(autouse=True)
def _delivery_uses_test_engine(test_engine, monkeypatch: pytest.MonkeyPatch) -> None:  # type: ignore[no-untyped-def]
    # deliver_interaction_push opens its own session via db_engine.async_
    # session_factory (the notifications.py pattern, meant for a real worker
    # process's global engine) rather than a request-scoped dependency, so it
    # must be pointed at the isolated test engine explicitly — the same idiom
    # test_signup_slack_duplicate_task_delivery_posts_once uses.
    monkeypatch.setattr(
        delivery_module.db_engine,
        "async_session_factory",
        async_sessionmaker(test_engine, expire_on_commit=False),
    )


def _mock_client(handler) -> httpx.AsyncClient:  # type: ignore[no-untyped-def]
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def _ok_handler(request: httpx.Request) -> httpx.Response:
    messages = json.loads(request.content)
    return httpx.Response(200, json={"data": [{"status": "ok"} for _ in messages]})


class TestSendExpoPushTransport:
    async def test_payload_shape_and_url(self) -> None:
        captured: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            captured.append(request)
            return _ok_handler(request)

        client = _mock_client(handler)
        try:
            result = await send_expo_push(
                ["ExponentPushToken[a]"],
                {
                    "title": "Approve?",
                    "body": "Tap to review the request.",
                    "data": {
                        "workspaceId": "w1",
                        "sessionId": "s1",
                        "requestId": "r1",
                        "kind": "permission",
                    },
                },
                client=client,
            )
        finally:
            await client.aclose()

        assert len(captured) == 1
        request = captured[0]
        assert str(request.url) == EXPO_PUSH_API_URL
        assert request.method == "POST"
        assert request.headers.get("authorization") is None
        body = json.loads(request.content)
        assert body == [
            {
                "to": "ExponentPushToken[a]",
                "title": "Approve?",
                "body": "Tap to review the request.",
                "data": {
                    "workspaceId": "w1",
                    "sessionId": "s1",
                    "requestId": "r1",
                    "kind": "permission",
                },
            }
        ]
        assert len(result.tickets) == 1
        assert result.tickets[0].status == "ok"

    async def test_includes_bearer_header_when_access_token_set(self) -> None:
        captured: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            captured.append(request)
            return _ok_handler(request)

        client = _mock_client(handler)
        try:
            await send_expo_push(
                ["ExponentPushToken[a]"],
                {"title": "t", "body": "b", "data": {}},
                access_token="secret-access-token",
                client=client,
            )
        finally:
            await client.aclose()

        assert captured[0].headers["authorization"] == "Bearer secret-access-token"

    async def test_empty_token_list_makes_no_request(self) -> None:
        calls: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            calls.append(request)
            return _ok_handler(request)

        client = _mock_client(handler)
        try:
            result = await send_expo_push(
                [], {"title": "t", "body": "b", "data": {}}, client=client
            )
        finally:
            await client.aclose()

        assert calls == []
        assert result.tickets == ()

    async def test_batches_large_token_lists(self) -> None:
        batch_sizes: list[int] = []

        def handler(request: httpx.Request) -> httpx.Response:
            messages = json.loads(request.content)
            batch_sizes.append(len(messages))
            return _ok_handler(request)

        tokens = [f"ExponentPushToken[{i}]" for i in range(150)]
        client = _mock_client(handler)
        try:
            result = await send_expo_push(
                tokens,
                {"title": "t", "body": "b", "data": {}},
                batch_size=100,
                client=client,
            )
        finally:
            await client.aclose()

        assert batch_sizes == [100, 50]
        assert len(result.tickets) == 150

    async def test_device_not_registered_tokens_are_marked_for_disable(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={
                    "data": [
                        {"status": "ok"},
                        {
                            "status": "error",
                            "message": "not registered",
                            "details": {"error": "DeviceNotRegistered"},
                        },
                    ]
                },
            )

        client = _mock_client(handler)
        try:
            result = await send_expo_push(
                ["ExponentPushToken[good]", "ExponentPushToken[stale]"],
                {"title": "t", "body": "b", "data": {}},
                client=client,
            )
        finally:
            await client.aclose()

        assert result.tokens_to_disable == ("ExponentPushToken[stale]",)
        assert result.has_transient_failures is False

    async def test_message_rate_exceeded_is_treated_as_transient(self) -> None:
        # The one Expo ticket error documented as real backpressure: retry
        # with backoff, don't disable the token.
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "status": "error",
                            "message": "rate limited",
                            "details": {"error": "MessageRateExceeded"},
                        }
                    ]
                },
            )

        client = _mock_client(handler)
        try:
            result = await send_expo_push(
                ["ExponentPushToken[a]"],
                {"title": "t", "body": "b", "data": {}},
                client=client,
            )
        finally:
            await client.aclose()

        assert result.tokens_to_disable == ()
        assert result.transient_tokens == ("ExponentPushToken[a]",)
        assert result.terminal_tokens == ()
        assert result.has_transient_failures is True

    @pytest.mark.parametrize(
        "error_code",
        [
            "MessageTooBig",
            "MismatchSenderId",
            "InvalidCredentials",
            "InvalidProviderToken",
            "SomeFutureExpoErrorCodeNobodyHasSeenYet",
        ],
    )
    async def test_permanent_and_unrecognized_error_codes_are_terminal(
        self, error_code: str
    ) -> None:
        # Expo's other documented permanent ticket errors (a payload or
        # push-credentials problem that retrying can never fix) — plus any
        # code Expo hasn't documented yet — must be dropped, not retried
        # forever, and must NOT disable the token (only DeviceNotRegistered
        # does that).
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "status": "error",
                            "message": "permanent failure",
                            "details": {"error": error_code},
                        }
                    ]
                },
            )

        client = _mock_client(handler)
        try:
            result = await send_expo_push(
                ["ExponentPushToken[a]"],
                {"title": "t", "body": "b", "data": {}},
                client=client,
            )
        finally:
            await client.aclose()

        assert result.tokens_to_disable == ()
        assert result.transient_tokens == ()
        assert result.terminal_tokens == ("ExponentPushToken[a]",)
        assert result.has_transient_failures is False

    async def test_raises_transport_error_on_non_200(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(500, text="upstream trouble")

        client = _mock_client(handler)
        try:
            with pytest.raises(ExpoPushTransportError):
                await send_expo_push(
                    ["ExponentPushToken[a]"],
                    {"title": "t", "body": "b", "data": {}},
                    client=client,
                )
        finally:
            await client.aclose()

    async def test_raises_transport_error_on_request_level_errors(self) -> None:
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(200, json={"errors": [{"code": "API_ERROR"}]})

        client = _mock_client(handler)
        try:
            with pytest.raises(ExpoPushTransportError):
                await send_expo_push(
                    ["ExponentPushToken[a]"],
                    {"title": "t", "body": "b", "data": {}},
                    client=client,
                )
        finally:
            await client.aclose()


def test_build_expo_payload_shape() -> None:
    payload = build_expo_payload(
        title="Approve file write?",
        workspace_id="w1",
        session_id="s1",
        request_id="r1",
        kind="permission",
    )
    assert payload == {
        "title": "Approve file write?",
        "body": "Tap to review the request.",
        "data": {
            "workspaceId": "w1",
            "sessionId": "s1",
            "requestId": "r1",
            "kind": "permission",
        },
    }


async def _create_user(db_session: AsyncSession, *, email: str) -> str:
    user = User(
        email=email,
        hashed_password="unused-oauth-only",
        is_active=True,
        is_superuser=False,
        is_verified=True,
        display_name="Push Delivery Tester",
    )
    db_session.add(user)
    await db_session.commit()
    return str(user.id)


async def _add_device(
    db_session: AsyncSession,
    *,
    user_id: str,
    token: str,
    disabled: bool = False,
) -> None:
    from datetime import UTC, datetime

    device = UserPushDevice(
        user_id=UUID(user_id),
        expo_push_token=token,
        platform="ios",
        disabled_at=datetime.now(UTC) if disabled else None,
    )
    db_session.add(device)
    await db_session.commit()


class TestDeliverInteractionPush:
    async def test_no_active_devices_is_a_noop(
        self,
        db_session: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        user_id = await _create_user(db_session, email="push-delivery-noop@example.com")

        async def _fail_if_called(*args: object, **kwargs: object) -> ExpoPushResult:
            raise AssertionError("send_expo_push must not be called with no active devices")

        monkeypatch.setattr(delivery_module, "send_expo_push", _fail_if_called)

        outcome = await deliver_interaction_push(
            user_id=user_id,
            workspace_id="w1",
            session_id="s1",
            request_id="r1",
            kind="permission",
            title="Approve?",
        )
        assert outcome.sent is False
        assert outcome.retry_tokens == ()

    async def test_sends_to_active_tokens_only(
        self,
        db_session: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        user_id = await _create_user(db_session, email="push-delivery-active@example.com")
        await _add_device(db_session, user_id=user_id, token="ExponentPushToken[active-1]")
        await _add_device(db_session, user_id=user_id, token="ExponentPushToken[active-2]")
        await _add_device(
            db_session, user_id=user_id, token="ExponentPushToken[disabled]", disabled=True
        )

        captured: dict[str, object] = {}

        async def _fake_send(tokens, payload, *, access_token="", **kwargs):  # type: ignore[no-untyped-def]
            captured["tokens"] = sorted(tokens)
            captured["payload"] = payload
            return ExpoPushResult(
                tickets=tuple(ExpoPushTicket(token=t, status="ok") for t in tokens)
            )

        monkeypatch.setattr(delivery_module, "send_expo_push", _fake_send)

        outcome = await deliver_interaction_push(
            user_id=user_id,
            workspace_id="w1",
            session_id="s1",
            request_id="r1",
            kind="permission",
            title="Approve?",
        )

        assert outcome.sent is True
        assert outcome.retry_tokens == ()
        assert captured["tokens"] == [
            "ExponentPushToken[active-1]",
            "ExponentPushToken[active-2]",
        ]
        assert captured["payload"] == build_expo_payload(
            title="Approve?",
            workspace_id="w1",
            session_id="s1",
            request_id="r1",
            kind="permission",
        )

    async def test_explicit_token_list_skips_the_active_device_lookup(
        self,
        db_session: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # This is the retry path: the Celery task passes the exact transient-
        # failed token set from the previous attempt. It must be sent to
        # as-is, never widened back out to a fresh "every active device"
        # lookup — proven here by registering NO devices for the user at all
        # and confirming the explicit token is still sent to.
        user_id = await _create_user(db_session, email="push-delivery-explicit@example.com")

        captured: dict[str, object] = {}

        async def _fake_send(tokens, payload, *, access_token="", **kwargs):  # type: ignore[no-untyped-def]
            captured["tokens"] = list(tokens)
            return ExpoPushResult(
                tickets=tuple(ExpoPushTicket(token=t, status="ok") for t in tokens)
            )

        monkeypatch.setattr(delivery_module, "send_expo_push", _fake_send)

        outcome = await deliver_interaction_push(
            user_id=user_id,
            workspace_id="w1",
            session_id="s1",
            request_id="r1",
            kind="permission",
            title="Approve?",
            tokens=["ExponentPushToken[retry-only]"],
        )

        assert outcome.sent is True
        assert captured["tokens"] == ["ExponentPushToken[retry-only]"]

    async def test_disables_device_not_registered_tokens(
        self,
        db_session: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        user_id = await _create_user(db_session, email="push-delivery-disable@example.com")
        await _add_device(db_session, user_id=user_id, token="ExponentPushToken[stale]")

        async def _fake_send(tokens, payload, *, access_token="", **kwargs):  # type: ignore[no-untyped-def]
            return ExpoPushResult(
                tickets=(
                    ExpoPushTicket(
                        token="ExponentPushToken[stale]",
                        status="error",
                        error_code="DeviceNotRegistered",
                    ),
                )
            )

        monkeypatch.setattr(delivery_module, "send_expo_push", _fake_send)

        outcome = await deliver_interaction_push(
            user_id=user_id,
            workspace_id="w1",
            session_id="s1",
            request_id="r1",
            kind="permission",
            title="Approve?",
        )
        assert outcome.sent is True
        assert outcome.retry_tokens == ()

        db_session.expire_all()
        device = (
            await db_session.execute(
                select(UserPushDevice).where(
                    UserPushDevice.expo_push_token == "ExponentPushToken[stale]"
                )
            )
        ).scalar_one()
        assert device.disabled_at is not None

    async def test_transient_ticket_error_returns_retry_token_without_raising(
        self,
        db_session: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # Regression for the retry-storm bug: a transient per-token error must
        # surface as a narrow retry_tokens set for the Celery task to act on,
        # never as a raised exception that would make the task retry the
        # WHOLE delivery (including tokens that already got "ok").
        user_id = await _create_user(db_session, email="push-delivery-transient@example.com")
        await _add_device(db_session, user_id=user_id, token="ExponentPushToken[ok]")
        await _add_device(db_session, user_id=user_id, token="ExponentPushToken[flaky]")

        async def _fake_send(tokens, payload, *, access_token="", **kwargs):  # type: ignore[no-untyped-def]
            return ExpoPushResult(
                tickets=(
                    ExpoPushTicket(token="ExponentPushToken[ok]", status="ok"),
                    ExpoPushTicket(
                        token="ExponentPushToken[flaky]",
                        status="error",
                        error_code="MessageRateExceeded",
                    ),
                )
            )

        monkeypatch.setattr(delivery_module, "send_expo_push", _fake_send)

        outcome = await deliver_interaction_push(
            user_id=user_id,
            workspace_id="w1",
            session_id="s1",
            request_id="r1",
            kind="permission",
            title="Approve?",
        )

        assert outcome.sent is True
        assert outcome.retry_tokens == ("ExponentPushToken[flaky]",)

    async def test_terminal_ticket_error_drops_token_without_disable_or_retry(
        self,
        db_session: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # A permanent, non-DeviceNotRegistered Expo error (e.g. MessageTooBig)
        # must be dropped: no retry (would retry forever, since the payload
        # problem never changes) and no disable (the token itself may still
        # be good for a future, smaller payload).
        user_id = await _create_user(db_session, email="push-delivery-terminal@example.com")
        await _add_device(db_session, user_id=user_id, token="ExponentPushToken[too-big]")

        async def _fake_send(tokens, payload, *, access_token="", **kwargs):  # type: ignore[no-untyped-def]
            return ExpoPushResult(
                tickets=(
                    ExpoPushTicket(
                        token="ExponentPushToken[too-big]",
                        status="error",
                        error_code="MessageTooBig",
                    ),
                )
            )

        monkeypatch.setattr(delivery_module, "send_expo_push", _fake_send)

        outcome = await deliver_interaction_push(
            user_id=user_id,
            workspace_id="w1",
            session_id="s1",
            request_id="r1",
            kind="permission",
            title="Approve?",
        )

        assert outcome.sent is True
        assert outcome.retry_tokens == ()

        db_session.expire_all()
        device = (
            await db_session.execute(
                select(UserPushDevice).where(
                    UserPushDevice.expo_push_token == "ExponentPushToken[too-big]"
                )
            )
        ).scalar_one()
        assert device.disabled_at is None

    async def test_transport_error_propagates_for_celery_retry(
        self,
        db_session: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        user_id = await _create_user(db_session, email="push-delivery-transport@example.com")
        await _add_device(db_session, user_id=user_id, token="ExponentPushToken[a]")

        async def _fake_send(tokens, payload, *, access_token="", **kwargs):  # type: ignore[no-untyped-def]
            raise ExpoPushTransportError("boom")

        monkeypatch.setattr(delivery_module, "send_expo_push", _fake_send)

        with pytest.raises(ExpoPushTransportError):
            await deliver_interaction_push(
                user_id=user_id,
                workspace_id="w1",
                session_id="s1",
                request_id="r1",
                kind="permission",
                title="Approve?",
            )


class TestPushSendCeleryTask:
    # Deliberately NOT async: the task body calls asyncio.run() internally (it
    # is invoked by a synchronous Celery worker, with no event loop already
    # running), so it must be invoked here the same way — via .run()/.apply(),
    # from a plain sync test — exactly like
    # test_send_slack_task_dispatches_signup_payload in test_slack_notifications.py.
    def test_task_delegates_to_delivery_service(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from proliferate.background.tasks import push as push_task_module

        captured: dict[str, object] = {}

        async def _fake_deliver(**kwargs: object) -> PushDeliveryOutcome:
            captured.update(kwargs)
            return PushDeliveryOutcome(sent=True)

        monkeypatch.setattr(push_task_module, "deliver_interaction_push", _fake_deliver)

        result = push_task_module.send_expo_push_task.run(
            user_id="user-1",
            workspace_id="w1",
            session_id="s1",
            request_id="r1",
            kind="permission",
            title="Approve?",
        )

        assert result is True
        assert captured == {
            "user_id": "user-1",
            "workspace_id": "w1",
            "session_id": "s1",
            "request_id": "r1",
            "kind": "permission",
            "title": "Approve?",
            "tokens": None,
        }
        assert push_task_module.send_expo_push_task.name == PUSH_SEND_TASK

    def test_retry_resends_only_to_transient_failed_tokens(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # Fix 1(a): tokens A (ok) and B (transient) — the retry must carry
        # ONLY B. Driven through the task's real (bounded) retry loop via
        # .apply(), which — unlike .run() — actually re-invokes the task body
        # with the kwargs passed to self.retry(), so the second call's
        # `tokens` argument is directly observable.
        from proliferate.background.tasks import push as push_task_module

        calls: list[object] = []

        async def _fake_deliver(*, tokens: list[str] | None = None, **kwargs: object):
            calls.append(tokens)
            if tokens is None:
                # Initial delivery: A already got "ok", B is transient.
                return PushDeliveryOutcome(sent=True, retry_tokens=("ExponentPushToken[B]",))
            # Retry: must be exactly the narrowed set — A is never re-sent.
            assert tokens == ["ExponentPushToken[B]"]
            return PushDeliveryOutcome(sent=True)

        monkeypatch.setattr(push_task_module, "deliver_interaction_push", _fake_deliver)

        result = push_task_module.send_expo_push_task.apply(
            kwargs={
                "user_id": "user-1",
                "workspace_id": "w1",
                "session_id": "s1",
                "request_id": "r1",
                "kind": "permission",
                "title": "Approve?",
            }
        )

        assert result.get() is True
        assert calls == [None, ["ExponentPushToken[B]"]]

    def test_retry_is_bounded_by_max_retries(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # Fix 1(c): a token that transiently fails on every attempt must stop
        # retrying at PUSH_SEND_MAX_RETRIES, not retry forever.
        from celery.exceptions import MaxRetriesExceededError
        from proliferate.background.tasks import push as push_task_module

        calls: list[object] = []

        async def _always_transient(*, tokens: list[str] | None = None, **kwargs: object):
            calls.append(tokens)
            return PushDeliveryOutcome(sent=True, retry_tokens=("ExponentPushToken[flaky]",))

        monkeypatch.setattr(push_task_module, "deliver_interaction_push", _always_transient)

        result = push_task_module.send_expo_push_task.apply(
            kwargs={
                "user_id": "user-1",
                "workspace_id": "w1",
                "session_id": "s1",
                "request_id": "r1",
                "kind": "permission",
                "title": "Approve?",
            }
        )

        with pytest.raises(MaxRetriesExceededError):
            result.get()
        assert len(calls) == push_task_module.PUSH_SEND_MAX_RETRIES + 1

    def test_disabled_token_is_never_retried(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # Fix 1(d): DeviceNotRegistered->disable happens inside
        # deliver_interaction_push (covered directly by
        # test_disables_device_not_registered_tokens); at the task level, the
        # contract is simply that an outcome with no retry_tokens never
        # triggers a retry at all.
        from proliferate.background.tasks import push as push_task_module

        calls: list[object] = []

        async def _fake_deliver(*, tokens: list[str] | None = None, **kwargs: object):
            calls.append(tokens)
            return PushDeliveryOutcome(sent=True, retry_tokens=())

        monkeypatch.setattr(push_task_module, "deliver_interaction_push", _fake_deliver)

        result = push_task_module.send_expo_push_task.run(
            user_id="user-1",
            workspace_id="w1",
            session_id="s1",
            request_id="r1",
            kind="permission",
            title="Approve?",
        )

        assert result is True
        assert calls == [None]

    def test_transport_error_retries_with_the_same_token_set(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        # A whole-request failure (network/5xx) carries no per-token
        # information at all, so the retry must reuse exactly the token set
        # this attempt was given — never a fresh, wider lookup.
        from proliferate.background.tasks import push as push_task_module

        calls: list[object] = []

        async def _fake_deliver(*, tokens: list[str] | None = None, **kwargs: object):
            calls.append(tokens)
            if len(calls) == 1:
                raise RuntimeError("simulated transport failure")
            assert tokens == ["ExponentPushToken[a]", "ExponentPushToken[b]"]
            return PushDeliveryOutcome(sent=True)

        monkeypatch.setattr(push_task_module, "deliver_interaction_push", _fake_deliver)

        result = push_task_module.send_expo_push_task.apply(
            kwargs={
                "user_id": "user-1",
                "workspace_id": "w1",
                "session_id": "s1",
                "request_id": "r1",
                "kind": "permission",
                "title": "Approve?",
                "tokens": ["ExponentPushToken[a]", "ExponentPushToken[b]"],
            }
        )

        assert result.get() is True
        assert len(calls) == 2
