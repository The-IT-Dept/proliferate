"""E2B / cloud provisioning configuration safety (T1).

Regression: a half-configured E2B (``E2B_API_KEY`` set, ``E2B_TEMPLATE_NAME``
empty) raised at FastAPI startup in non-debug mode, crash-looping the whole API
and taking auth + every other control-plane surface offline. Partial config now
disables only the optional cloud capability (a boot warning, not a crash) and
cloud-provisioning requests fail with a specific, actionable error.
"""

from __future__ import annotations

import pytest

from proliferate.config import Settings
from proliferate.config_defaults import DEFAULT_CORS_ALLOW_ORIGINS, ENV_FILES
from proliferate.integrations.sandbox import e2b as e2b_runtime
from proliferate.server.cloud.cloud_sandboxes import service as cloud_sandboxes_service
from proliferate.server.cloud.errors import CloudApiError
from proliferate.server.meta import build_server_capabilities


def _settings(**overrides: object) -> Settings:
    base: dict[str, object] = {
        "_env_file": None,
        "jwt_secret": "test-secret",
        "cloud_secret_key": "test-cloud-secret",
    }
    base.update(overrides)
    return Settings(**base)  # type: ignore[arg-type]


def test_fully_configured_is_ready() -> None:
    settings = _settings(debug=False, e2b_api_key="e2b_key", e2b_template_name="tmpl")
    assert settings.cloud_provisioning_configured is True
    assert settings.cloud_provisioning_config_error is None


def test_no_api_key_is_disabled_not_an_error() -> None:
    # Base install with no cloud is a valid, healthy configuration.
    settings = _settings(debug=False, e2b_api_key="", e2b_template_name="")
    assert settings.cloud_provisioning_configured is False
    assert settings.cloud_provisioning_config_error is None


def test_api_key_without_template_is_a_named_error_in_production() -> None:
    settings = _settings(debug=False, e2b_api_key="e2b_key", e2b_template_name="")
    assert settings.cloud_provisioning_configured is False
    error = settings.cloud_provisioning_config_error
    assert error is not None
    assert "E2B_TEMPLATE_NAME" in error
    # The message names the requirement without echoing the secret value.
    assert "e2b_key" not in error


def test_debug_allows_missing_template() -> None:
    settings = _settings(debug=True, e2b_api_key="e2b_key", e2b_template_name="")
    assert settings.cloud_provisioning_configured is True
    assert settings.cloud_provisioning_config_error is None


def test_extracted_settings_defaults_remain_byte_identical() -> None:
    assert ENV_FILES == (".env", ".env.local")
    assert DEFAULT_CORS_ALLOW_ORIGINS == (
        "http://localhost:1420,http://127.0.0.1:1420,"
        "http://localhost:5174,http://127.0.0.1:5174,"
        "http://localhost:5175,http://127.0.0.1:5175,"
        "http://localhost:5176,http://127.0.0.1:5176,"
        "http://localhost:8081,http://127.0.0.1:8081,"
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:5174,http://127.0.0.1:5174,"
        "http://tauri.localhost,tauri://localhost"
    )
    assert Settings.model_config["env_file"] == ENV_FILES
    assert _settings().cors_allow_origins == DEFAULT_CORS_ALLOW_ORIGINS


def test_qualification_provider_identity_requires_the_exact_pair() -> None:
    configured = _settings(
        agent_gateway_qualification_run_id="qlc-ci-123-1",
        agent_gateway_qualification_shard_id="1",
    )
    assert configured.agent_gateway_qualification_run_id == "qlc-ci-123-1"
    with pytest.raises(ValueError, match="must be set together"):
        _settings(agent_gateway_qualification_run_id="qlc-ci-123-1")


@pytest.mark.parametrize("value", ["../prod", "-run", "a" * 129])
def test_qualification_provider_identity_rejects_unsafe_values(value: str) -> None:
    with pytest.raises(ValueError, match="qualification run id is malformed"):
        _settings(
            agent_gateway_qualification_run_id=value,
            agent_gateway_qualification_shard_id="1",
        )


def test_require_cloud_provisioning_configured_raises_503(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(cloud_sandboxes_service.settings, "debug", False)
    monkeypatch.setattr(cloud_sandboxes_service.settings, "e2b_api_key", "e2b_key")
    monkeypatch.setattr(cloud_sandboxes_service.settings, "e2b_template_name", "")

    with pytest.raises(CloudApiError) as excinfo:
        cloud_sandboxes_service.require_cloud_provisioning_configured()

    assert excinfo.value.status_code == 503
    assert excinfo.value.code == "e2b_template_not_configured"


def test_require_cloud_provisioning_configured_passes_when_ready(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(cloud_sandboxes_service.settings, "debug", False)
    monkeypatch.setattr(cloud_sandboxes_service.settings, "e2b_api_key", "e2b_key")
    monkeypatch.setattr(cloud_sandboxes_service.settings, "e2b_template_name", "tmpl")

    # Does not raise.
    cloud_sandboxes_service.require_cloud_provisioning_configured()


def test_e2b_template_name_raises_in_production_when_unset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(e2b_runtime.settings, "debug", False)
    monkeypatch.setattr(e2b_runtime.settings, "e2b_api_key", "e2b_key")
    monkeypatch.setattr(e2b_runtime.settings, "e2b_template_name", "")

    provider = e2b_runtime.E2BSandboxProvider()
    with pytest.raises(e2b_runtime.E2BRuntimeError) as excinfo:
        provider._template_name()
    assert "E2B_TEMPLATE_NAME" in str(excinfo.value)


# --- Provider-agnostic readiness (M2 Task 5) ---------------------------------
#
# Generalizes the E2B-only predicates above so a SANDBOX_PROVIDER=kubernetes
# deployment reads as configured without any E2B env, while every existing
# E2B case (above) is untouched and keeps passing.

# Complete GitHub App runtime config, mirroring test_meta_endpoint.py's
# _APP_COMPLETE: one entry per requirement group `github_app_configured` checks.
_APP_COMPLETE: dict[str, object] = {
    "github_app_id": "12345",
    "github_app_slug": "acme-cloud",
    "github_app_client_id": "Iv1.app-client",
    "github_app_client_secret": "app-secret",
    "github_app_webhook_secret": "hook-secret",
    "github_app_private_key": "-----BEGIN RSA PRIVATE KEY-----",
}


def test_kubernetes_provider_is_configured_with_no_e2b_env() -> None:
    settings = _settings(
        debug=False,
        e2b_api_key="",
        e2b_template_name="",
        SANDBOX_PROVIDER="kubernetes",
    )
    assert settings.sandbox_provider == "kubernetes"
    assert settings.sandbox_provisioning_configured is True
    assert settings.sandbox_provisioning_partially_configured is False
    assert settings.sandbox_provisioning_config_error is None


def test_e2b_provider_sandbox_provisioning_matches_cloud_provisioning() -> None:
    # Default provider is "e2b"; the new provider-agnostic predicates must
    # agree exactly with the existing E2B-specific ones (no behavior change).
    configured = _settings(debug=False, e2b_api_key="e2b_key", e2b_template_name="tmpl")
    assert configured.sandbox_provisioning_configured == configured.cloud_provisioning_configured
    assert configured.sandbox_provisioning_configured is True

    partial = _settings(debug=False, e2b_api_key="e2b_key", e2b_template_name="")
    assert (
        partial.sandbox_provisioning_partially_configured
        == partial.cloud_provisioning_partially_configured
    )
    assert partial.sandbox_provisioning_partially_configured is True
    assert partial.sandbox_provisioning_config_error == partial.cloud_provisioning_config_error


def _capability_settings(**overrides: object) -> Settings:
    """Settings tuned for build_server_capabilities, reset to a known base.

    Mirrors test_meta_endpoint.py's _cfg(): every capability-relevant field is
    pinned to a known value first (ambient env/.env must not leak in), then
    overrides apply on top via direct attribute assignment so aliased fields
    (like sandbox_provider) can be set by their plain field name.
    """
    cfg = _settings()
    base: dict[str, object] = {
        "telemetry_mode": "self_managed",
        "cloud_billing_mode": "off",
        "debug": False,
        "sandbox_provider": "e2b",
        "e2b_api_key": "",
        "e2b_template_name": "",
        "github_app_id": "",
        "github_app_slug": "",
        "github_app_client_id": "",
        "github_app_client_secret": "",
        "github_app_webhook_secret": "",
        "github_app_private_key": "",
        "github_app_private_key_path": "",
    }
    base.update(overrides)
    for key, value in base.items():
        setattr(cfg, key, value)
    return cfg


def test_managed_cloud_kubernetes_requires_github_app_configuration() -> None:
    config = _capability_settings(sandbox_provider="kubernetes")

    caps = build_server_capabilities(config)

    assert caps.managedCloud.status == "operator_configuration_required"
    assert caps.managedCloud.repositoryAuthority == "github_app"


def test_managed_cloud_kubernetes_ready_with_full_github_app() -> None:
    config = _capability_settings(sandbox_provider="kubernetes", **_APP_COMPLETE)

    caps = build_server_capabilities(config)

    assert caps.managedCloud.status == "ready"
    assert caps.managedCloud.repositoryAuthority == "github_app"


def test_managed_cloud_e2b_absent_stays_disabled() -> None:
    # Existing E2B behavior, unchanged: no provisioning + no App -> disabled.
    config = _capability_settings(sandbox_provider="e2b")

    caps = build_server_capabilities(config)

    assert caps.managedCloud.status == "disabled"
    assert caps.managedCloud.repositoryAuthority is None


# --- Unknown sandbox_provider is rejected, not silently E2B (CQ-1) ----------
#
# Regression: any sandbox_provider other than "kubernetes" used to fall through
# to the E2B logic, so an operator typo (SANDBOX_PROVIDER=bogus) on a box that
# also has full E2B env would read as configured with no error -- only to raise
# inside get_sandbox_provider() at first real provision. The readiness layer
# must recognize an unknown provider value up front and report it as a named,
# actionable configuration error, independent of what E2B env happens to be set.


def test_unknown_provider_is_not_configured_even_with_full_e2b_env() -> None:
    settings = _settings(
        debug=False,
        e2b_api_key="e2b_key",
        e2b_template_name="tmpl",
        SANDBOX_PROVIDER="bogus",
    )
    assert settings.sandbox_provider == "bogus"
    assert settings.sandbox_provisioning_configured is False
    assert settings.sandbox_provisioning_partially_configured is False
    error = settings.sandbox_provisioning_config_error
    assert error is not None
    assert "bogus" in error


def test_unknown_provider_is_not_configured_without_e2b_env() -> None:
    settings = _settings(
        debug=False,
        e2b_api_key="",
        e2b_template_name="",
        SANDBOX_PROVIDER="bogus",
    )
    assert settings.sandbox_provider == "bogus"
    assert settings.sandbox_provisioning_configured is False
    assert settings.sandbox_provisioning_partially_configured is False
    error = settings.sandbox_provisioning_config_error
    assert error is not None
    assert "bogus" in error


def test_known_providers_are_unaffected_by_the_unknown_provider_check() -> None:
    e2b_ready = _settings(debug=False, e2b_api_key="e2b_key", e2b_template_name="tmpl")
    assert e2b_ready.sandbox_provisioning_configured is True
    assert e2b_ready.sandbox_provisioning_config_error is None

    kubernetes_ready = _settings(debug=False, SANDBOX_PROVIDER="kubernetes")
    assert kubernetes_ready.sandbox_provisioning_configured is True
    assert kubernetes_ready.sandbox_provisioning_partially_configured is False
    assert kubernetes_ready.sandbox_provisioning_config_error is None


def test_managed_cloud_unknown_provider_is_not_ready() -> None:
    config = _capability_settings(sandbox_provider="bogus", **_APP_COMPLETE)

    caps = build_server_capabilities(config)

    assert caps.managedCloud.status != "ready"
