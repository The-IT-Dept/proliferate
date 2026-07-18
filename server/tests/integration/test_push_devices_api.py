from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from proliferate.db.models.auth import User, UserPushDevice
from tests.helpers.desktop_auth import mint_desktop_token_payload

EXPO_TOKEN = "ExponentPushToken[abc123DEF456]"


async def _create_user_and_get_token(
    client: AsyncClient,
    db_session: AsyncSession,
    *,
    email: str,
) -> tuple[str, str]:
    user = User(
        email=email,
        hashed_password="unused-oauth-only",
        is_active=True,
        is_superuser=False,
        is_verified=True,
        display_name="Push Device Tester",
    )
    db_session.add(user)
    await db_session.commit()

    token_payload = await mint_desktop_token_payload(
        client,
        user_id=user.id,
        state_prefix="push-device-state",
    )
    return str(user.id), str(token_payload["access_token"])


async def _devices_for_user(db_session: AsyncSession, user_id: str) -> list[UserPushDevice]:
    # The app under test writes via its own session/connection; without this,
    # db_session's identity map would keep serving the first-loaded (now
    # stale) copy of any row queried more than once in the same test.
    db_session.expire_all()
    result = await db_session.execute(
        select(UserPushDevice).where(UserPushDevice.user_id == user_id)
    )
    return list(result.scalars().all())


class TestRegisterPushDevice:
    async def test_registers_a_new_device(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        _user_id, access_token = await _create_user_and_get_token(
            client, db_session, email="push-register@example.com"
        )

        response = await client.post(
            "/users/me/push-devices",
            headers={"Authorization": f"Bearer {access_token}"},
            json={"expoPushToken": EXPO_TOKEN, "platform": "ios"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["platform"] == "ios"
        assert body["expoPushToken"] == EXPO_TOKEN

    async def test_registering_the_same_token_twice_is_idempotent(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        user_id, access_token = await _create_user_and_get_token(
            client, db_session, email="push-idempotent@example.com"
        )
        headers = {"Authorization": f"Bearer {access_token}"}

        first = await client.post(
            "/users/me/push-devices",
            headers=headers,
            json={"expoPushToken": EXPO_TOKEN, "platform": "ios"},
        )
        second = await client.post(
            "/users/me/push-devices",
            headers=headers,
            json={"expoPushToken": EXPO_TOKEN, "platform": "ios"},
        )

        assert first.status_code == 200
        assert second.status_code == 200
        assert first.json()["id"] == second.json()["id"]

        devices = await _devices_for_user(db_session, user_id)
        assert len(devices) == 1

    async def test_registering_again_clears_disabled_at(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        user_id, access_token = await _create_user_and_get_token(
            client, db_session, email="push-reregister@example.com"
        )
        headers = {"Authorization": f"Bearer {access_token}"}
        await client.post(
            "/users/me/push-devices",
            headers=headers,
            json={"expoPushToken": EXPO_TOKEN, "platform": "ios"},
        )
        delete_response = await client.delete(
            f"/users/me/push-devices/{EXPO_TOKEN}",
            headers=headers,
        )
        assert delete_response.status_code == 204

        devices = await _devices_for_user(db_session, user_id)
        assert len(devices) == 1
        assert devices[0].disabled_at is not None

        await client.post(
            "/users/me/push-devices",
            headers=headers,
            json={"expoPushToken": EXPO_TOKEN, "platform": "ios"},
        )

        devices = await _devices_for_user(db_session, user_id)
        assert len(devices) == 1
        assert devices[0].disabled_at is None

    async def test_requires_authentication(self, client: AsyncClient) -> None:
        response = await client.post(
            "/users/me/push-devices",
            json={"expoPushToken": EXPO_TOKEN, "platform": "ios"},
        )
        assert response.status_code == 401

    async def test_rejects_unknown_platform(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        _user_id, access_token = await _create_user_and_get_token(
            client, db_session, email="push-bad-platform@example.com"
        )

        response = await client.post(
            "/users/me/push-devices",
            headers={"Authorization": f"Bearer {access_token}"},
            json={"expoPushToken": EXPO_TOKEN, "platform": "windows-phone"},
        )

        assert response.status_code == 422


class TestUnregisterPushDevice:
    async def test_sets_disabled_at_and_is_idempotent(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        user_id, access_token = await _create_user_and_get_token(
            client, db_session, email="push-unregister@example.com"
        )
        headers = {"Authorization": f"Bearer {access_token}"}
        await client.post(
            "/users/me/push-devices",
            headers=headers,
            json={"expoPushToken": EXPO_TOKEN, "platform": "android"},
        )

        first = await client.delete(f"/users/me/push-devices/{EXPO_TOKEN}", headers=headers)
        second = await client.delete(f"/users/me/push-devices/{EXPO_TOKEN}", headers=headers)

        assert first.status_code == 204
        assert second.status_code == 204
        devices = await _devices_for_user(db_session, user_id)
        assert len(devices) == 1
        assert devices[0].disabled_at is not None

    async def test_unknown_token_is_a_no_op(
        self,
        client: AsyncClient,
        db_session: AsyncSession,
    ) -> None:
        _user_id, access_token = await _create_user_and_get_token(
            client, db_session, email="push-unregister-unknown@example.com"
        )
        headers = {"Authorization": f"Bearer {access_token}"}

        response = await client.delete(
            "/users/me/push-devices/ExponentPushToken[does-not-exist]",
            headers=headers,
        )

        assert response.status_code == 204

    async def test_requires_authentication(self, client: AsyncClient) -> None:
        response = await client.delete(f"/users/me/push-devices/{EXPO_TOKEN}")
        assert response.status_code == 401
