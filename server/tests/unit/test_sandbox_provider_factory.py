"""Config-driven sandbox provider selection (M2 Task 6).

`get_configured_sandbox_provider()` must resolve the provider class from
`settings.sandbox_provider`, and `get_sandbox_provider(kind)` must resolve the
same way for an explicit kind string. Both providers stay importable and
constructible with no external services reachable (E2B/K8s calls happen lazily
per-method, never at construction time).
"""

from __future__ import annotations

import pytest

from proliferate.config import settings
from proliferate.integrations.sandbox.base import (
    SandboxProviderConfigurationError,
)
from proliferate.integrations.sandbox.e2b import E2BSandboxProvider
from proliferate.integrations.sandbox.factory import (
    get_configured_sandbox_provider,
    get_sandbox_provider,
)
from proliferate.integrations.sandbox.kubernetes import KubernetesSandboxProvider


def test_get_configured_sandbox_provider_defaults_to_e2b(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "sandbox_provider", "e2b")

    provider = get_configured_sandbox_provider()

    assert isinstance(provider, E2BSandboxProvider)


def test_get_configured_sandbox_provider_selects_kubernetes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "sandbox_provider", "kubernetes")

    provider = get_configured_sandbox_provider()

    assert isinstance(provider, KubernetesSandboxProvider)


def test_get_sandbox_provider_kubernetes_by_kind_string() -> None:
    provider = get_sandbox_provider("kubernetes")

    assert isinstance(provider, KubernetesSandboxProvider)


def test_get_sandbox_provider_e2b_by_kind_string() -> None:
    provider = get_sandbox_provider("e2b")

    assert isinstance(provider, E2BSandboxProvider)


def test_get_sandbox_provider_rejects_unknown_kind() -> None:
    with pytest.raises(SandboxProviderConfigurationError):
        get_sandbox_provider("not-a-real-provider")
