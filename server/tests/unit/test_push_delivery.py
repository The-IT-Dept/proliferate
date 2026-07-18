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
from proliferate.server.cloud.push.delivery import build_expo_payload, deliver_interaction_push
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

    async def test_other_error_codes_are_treated_as_transient(self) -> None:
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
        assert result.has_transient_failures is True

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

        sent = await deliver_interaction_push(
            user_id=user_id,
            workspace_id="w1",
            session_id="s1",
            request_id="r1",
            kind="permission",
            title="Approve?",
        )
        assert sent is False

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

        sent = await deliver_interaction_push(
            user_id=user_id,
            workspace_id="w1",
            session_id="s1",
            request_id="r1",
            kind="permission",
            title="Approve?",
        )

        assert sent is True
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

        sent = await deliver_interaction_push(
            user_id=user_id,
            workspace_id="w1",
            session_id="s1",
            request_id="r1",
            kind="permission",
            title="Approve?",
        )
        assert sent is True

        db_session.expire_all()
        device = (
            await db_session.execute(
                select(UserPushDevice).where(
                    UserPushDevice.expo_push_token == "ExponentPushToken[stale]"
                )
            )
        ).scalar_one()
        assert device.disabled_at is not None

    async def test_raises_for_celery_retry_on_transient_ticket_error(
        self,
        db_session: AsyncSession,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        user_id = await _create_user(db_session, email="push-delivery-transient@example.com")
        await _add_device(db_session, user_id=user_id, token="ExponentPushToken[flaky]")

        async def _fake_send(tokens, payload, *, access_token="", **kwargs):  # type: ignore[no-untyped-def]
            return ExpoPushResult(
                tickets=(
                    ExpoPushTicket(
                        token="ExponentPushToken[flaky]",
                        status="error",
                        error_code="MessageRateExceeded",
                    ),
                )
            )

        monkeypatch.setattr(delivery_module, "send_expo_push", _fake_send)

        with pytest.raises(RuntimeError):
            await deliver_interaction_push(
                user_id=user_id,
                workspace_id="w1",
                session_id="s1",
                request_id="r1",
                kind="permission",
                title="Approve?",
            )

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
    # running), so it must be invoked here the same way — via .run(), from a
    # plain sync test — exactly like test_send_slack_task_dispatches_signup_payload
    # in test_slack_notifications.py.
    def test_task_delegates_to_delivery_service(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from proliferate.background.tasks import push as push_task_module

        captured: dict[str, object] = {}

        async def _fake_deliver(**kwargs: object) -> bool:
            captured.update(kwargs)
            return True

        monkeypatch.setattr(push_task_module, "deliver_interaction_push", _fake_deliver)

        result = push_task_module.send_expo_push.run(
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
        }
        assert push_task_module.send_expo_push.name == PUSH_SEND_TASK
