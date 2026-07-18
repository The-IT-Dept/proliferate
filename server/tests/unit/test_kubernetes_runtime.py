"""Unit tests for KubernetesSandboxProvider.

Everything here runs against a FAKE CoreV1Api and a FAKE `stream()` injected
via `monkeypatch.setattr(k8s_runtime, "_load_client"/"_load_stream", ...)`.
No real cluster, no real websocket -- these must pass with no network access
at all. Follows `test_e2b_runtime.py`'s style: fakes record what was built
and tests assert on the recorded specs/calls.
"""

from __future__ import annotations

import asyncio
import base64
import shlex
from typing import Any

import pytest
from kubernetes import client as k8s_client

from proliferate.integrations.sandbox import base as sandbox_base
from proliferate.integrations.sandbox import kubernetes as k8s_runtime

NAMESPACE = "proliferate-sandboxes"


class _FakeApiException(Exception):
    """Duck-typed stand-in for kubernetes.client.rest.ApiException."""

    def __init__(self, status: int) -> None:
        super().__init__(f"fake api error status={status}")
        self.status = status


def _make_pod(
    name: str,
    *,
    phase: str | None,
    ready: bool = False,
    start_time: Any = None,
) -> k8s_client.V1Pod:
    conditions = []
    if phase is not None:
        conditions.append(
            k8s_client.V1PodCondition(type="Ready", status="True" if ready else "False")
        )
    return k8s_client.V1Pod(
        metadata=k8s_client.V1ObjectMeta(
            name=name,
            namespace=NAMESPACE,
            labels={"app": name, "proliferate.io/sandbox": name},
        ),
        status=k8s_client.V1PodStatus(phase=phase, conditions=conditions, start_time=start_time),
    )


def _make_pvc(name: str) -> k8s_client.V1PersistentVolumeClaim:
    return k8s_client.V1PersistentVolumeClaim(
        metadata=k8s_client.V1ObjectMeta(
            name=name,
            namespace=NAMESPACE,
            labels={"app": name, "proliferate.io/sandbox": name},
        ),
    )


def _make_service(name: str) -> k8s_client.V1Service:
    return k8s_client.V1Service(
        metadata=k8s_client.V1ObjectMeta(name=name, namespace=NAMESPACE),
    )


class _FakeCoreV1Api:
    """Records create/read/list/delete calls; 404s on missing objects."""

    def __init__(self) -> None:
        self.pods: dict[str, k8s_client.V1Pod] = {}
        self.pvcs: dict[str, k8s_client.V1PersistentVolumeClaim] = {}
        self.services: dict[str, k8s_client.V1Service] = {}
        self.created_pvc_bodies: list[Any] = []
        self.created_pod_bodies: list[Any] = []
        self.created_service_bodies: list[Any] = []
        self.deleted_pods: list[str] = []
        self.deleted_services: list[str] = []
        self.deleted_pvcs: list[str] = []

    def create_namespaced_persistent_volume_claim(self, namespace: str, body: Any) -> Any:
        del namespace
        self.created_pvc_bodies.append(body)
        self.pvcs[body.metadata.name] = body
        return body

    def create_namespaced_pod(self, namespace: str, body: Any) -> Any:
        del namespace
        self.created_pod_bodies.append(body)
        # Simulate the fake cluster scheduling the pod and it immediately
        # reaching Running+Ready, so connect_running_sandbox's poll resolves
        # on the first check without a real sleep.
        body.status = k8s_client.V1PodStatus(
            phase="Running",
            conditions=[k8s_client.V1PodCondition(type="Ready", status="True")],
        )
        self.pods[body.metadata.name] = body
        return body

    def create_namespaced_service(self, namespace: str, body: Any) -> Any:
        del namespace
        self.created_service_bodies.append(body)
        self.services[body.metadata.name] = body
        return body

    def read_namespaced_pod(self, name: str, namespace: str) -> Any:
        del namespace
        pod = self.pods.get(name)
        if pod is None:
            raise _FakeApiException(404)
        return pod

    def read_namespaced_persistent_volume_claim(self, name: str, namespace: str) -> Any:
        del namespace
        pvc = self.pvcs.get(name)
        if pvc is None:
            raise _FakeApiException(404)
        return pvc

    def read_namespaced_service(self, name: str, namespace: str) -> Any:
        del namespace
        svc = self.services.get(name)
        if svc is None:
            raise _FakeApiException(404)
        return svc

    def delete_namespaced_pod(self, name: str, namespace: str) -> None:
        del namespace
        self.deleted_pods.append(name)
        if name not in self.pods:
            raise _FakeApiException(404)
        del self.pods[name]

    def delete_namespaced_service(self, name: str, namespace: str) -> None:
        del namespace
        self.deleted_services.append(name)
        if name not in self.services:
            raise _FakeApiException(404)
        del self.services[name]

    def delete_namespaced_persistent_volume_claim(self, name: str, namespace: str) -> None:
        del namespace
        self.deleted_pvcs.append(name)
        if name not in self.pvcs:
            raise _FakeApiException(404)
        del self.pvcs[name]

    def list_namespaced_pod(self, namespace: str, label_selector: str | None = None) -> Any:
        del namespace, label_selector
        return k8s_client.V1PodList(items=list(self.pods.values()))

    def list_namespaced_persistent_volume_claim(
        self, namespace: str, label_selector: str | None = None
    ) -> Any:
        del namespace, label_selector
        return k8s_client.V1PersistentVolumeClaimList(items=list(self.pvcs.values()))

    def connect_get_namespaced_pod_exec(self, name: str, namespace: str, **kwargs: Any) -> None:
        raise AssertionError(
            "connect_get_namespaced_pod_exec should only be passed to stream(), "
            "never called directly"
        )


class _FakeWSClient:
    """Fake `kubernetes.stream.ws_client.WSClient`."""

    def __init__(self, *, stdout: str = "", stderr: str = "", returncode: int = 0) -> None:
        self._stdout = stdout
        self._stderr = stderr
        self._returncode = returncode
        self._open = True
        self.written_stdin: list[str] = []
        self.closed = False

    def is_open(self) -> bool:
        return self._open

    def update(self, timeout: float | None = None) -> None:
        del timeout
        # All data + closure "arrives" on the first poll -- no real I/O.
        self._open = False

    def peek_stdout(self) -> bool:
        return bool(self._stdout)

    def read_stdout(self) -> str:
        value = self._stdout
        self._stdout = ""
        return value

    def peek_stderr(self) -> bool:
        return bool(self._stderr)

    def read_stderr(self) -> str:
        value = self._stderr
        self._stderr = ""
        return value

    @property
    def returncode(self) -> int:
        return self._returncode

    def close(self, **kwargs: Any) -> None:
        del kwargs
        self.closed = True

    def write_stdin(self, data: str) -> None:
        self.written_stdin.append(data)


def _make_fake_stream(captured: dict[str, Any], ws_client: Any) -> Any:
    def _stream(api_method: Any, *args: Any, **kwargs: Any) -> Any:
        captured["api_method"] = api_method
        captured["args"] = args
        captured["kwargs"] = kwargs
        return ws_client

    return _stream


def _configure_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(k8s_runtime.settings, "kubernetes_sandbox_namespace", NAMESPACE)
    monkeypatch.setattr(
        k8s_runtime.settings,
        "kubernetes_sandbox_image",
        "ghcr.io/the-it-dept/proliferate-sandbox:stable",
    )
    monkeypatch.setattr(k8s_runtime.settings, "kubernetes_sandbox_cpu_request", "500m")
    monkeypatch.setattr(k8s_runtime.settings, "kubernetes_sandbox_cpu_limit", "2")
    monkeypatch.setattr(k8s_runtime.settings, "kubernetes_sandbox_memory_request", "1Gi")
    monkeypatch.setattr(k8s_runtime.settings, "kubernetes_sandbox_memory_limit", "4Gi")
    monkeypatch.setattr(k8s_runtime.settings, "kubernetes_sandbox_storage_class", "proxmox-store")
    monkeypatch.setattr(k8s_runtime.settings, "kubernetes_sandbox_storage_size", "10Gi")
    monkeypatch.setattr(k8s_runtime.settings, "kubernetes_sandbox_service_account", "")


@pytest.fixture
def fake_api(monkeypatch: pytest.MonkeyPatch) -> _FakeCoreV1Api:
    _configure_settings(monkeypatch)
    api = _FakeCoreV1Api()
    monkeypatch.setattr(k8s_runtime, "_load_client", lambda: api)
    return api


@pytest.fixture
def provider() -> k8s_runtime.KubernetesSandboxProvider:
    return k8s_runtime.KubernetesSandboxProvider()


# -- module import / config properties ------------------------------------


def test_module_import_does_not_touch_the_cluster() -> None:
    # If this test file collected at all, the module already imported
    # cleanly with no monkeypatching in place -- this just documents intent.
    provider = k8s_runtime.KubernetesSandboxProvider()
    assert provider.kind == sandbox_base.SandboxProviderKind.kubernetes


def test_provider_config_properties(provider: k8s_runtime.KubernetesSandboxProvider) -> None:
    assert provider.kind == sandbox_base.SandboxProviderKind.kubernetes
    assert provider.template_version == k8s_runtime.K8S_TEMPLATE_VERSION
    assert provider.runtime_port == 8457
    assert provider.runtime_endpoint_handles_cors is False
    assert provider.runtime_workdir == "/home/user/workspace"
    assert provider.runtime_binary_path == "/home/user/anyharness"
    assert provider.user_home == "/home/user"
    assert provider.preserves_processes_on_resume is False


# -- create_sandbox ----------------------------------------------------------


def test_create_sandbox_builds_pvc_pod_service_and_returns_handle(
    fake_api: _FakeCoreV1Api, provider: k8s_runtime.KubernetesSandboxProvider
) -> None:
    handle = asyncio.run(provider.create_sandbox())

    assert handle.provider == sandbox_base.SandboxProviderKind.kubernetes
    assert handle.sandbox_id.startswith("sbx-")
    assert len(handle.sandbox_id) == len("sbx-") + 12
    assert handle.template_version == k8s_runtime.K8S_TEMPLATE_VERSION

    name = handle.sandbox_id
    expected_labels = {"app": name, "proliferate.io/sandbox": name}

    assert len(fake_api.created_pvc_bodies) == 1
    pvc = fake_api.created_pvc_bodies[0]
    assert pvc.metadata.name == name
    assert pvc.metadata.labels == expected_labels
    assert pvc.spec.access_modes == ["ReadWriteOnce"]
    assert pvc.spec.resources.requests == {"storage": "10Gi"}
    assert pvc.spec.storage_class_name == "proxmox-store"

    assert len(fake_api.created_pod_bodies) == 1
    pod = fake_api.created_pod_bodies[0]
    assert pod.metadata.name == name
    assert pod.metadata.labels == expected_labels
    container = pod.spec.containers[0]
    assert container.image == "ghcr.io/the-it-dept/proliferate-sandbox:stable"
    assert container.command == ["sleep", "infinity"]
    assert container.volume_mounts[0].mount_path == "/home/user"
    assert container.resources.requests == {"cpu": "500m", "memory": "1Gi"}
    assert container.resources.limits == {"cpu": "2", "memory": "4Gi"}
    assert pod.spec.security_context.run_as_user == 1000
    assert pod.spec.security_context.run_as_group == 1000
    assert pod.spec.security_context.fs_group == 1000
    assert pod.spec.volumes[0].persistent_volume_claim.claim_name == name
    assert pod.spec.service_account_name is None

    assert len(fake_api.created_service_bodies) == 1
    service = fake_api.created_service_bodies[0]
    assert service.metadata.name == name
    assert service.spec.type == "ClusterIP"
    assert service.spec.selector == {"app": name}
    assert service.spec.ports[0].port == 8457


def test_create_sandbox_sets_service_account_when_configured(
    fake_api: _FakeCoreV1Api,
    provider: k8s_runtime.KubernetesSandboxProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(k8s_runtime.settings, "kubernetes_sandbox_service_account", "sandbox-sa")

    asyncio.run(provider.create_sandbox())

    pod = fake_api.created_pod_bodies[0]
    assert pod.spec.service_account_name == "sandbox-sa"


# -- resolve_runtime_endpoint / resolve_runtime_context -----------------------


def test_resolve_runtime_endpoint_returns_in_cluster_service_dns_url(
    provider: k8s_runtime.KubernetesSandboxProvider,
) -> None:
    sandbox = k8s_runtime._K8sSandbox(name="sbx-abc123def456", namespace=NAMESPACE)

    endpoint = asyncio.run(provider.resolve_runtime_endpoint(sandbox))

    assert endpoint.runtime_url == (f"http://sbx-abc123def456.{NAMESPACE}.svc.cluster.local:8457")


def test_resolve_runtime_context_uses_static_k8s_paths(
    provider: k8s_runtime.KubernetesSandboxProvider,
) -> None:
    context = asyncio.run(provider.resolve_runtime_context(object()))

    assert context.home_dir == "/home/user"
    assert context.runtime_workdir == "/home/user/workspace"
    assert context.runtime_binary_path == "/home/user/anyharness"
    assert context.base_env == {"HOME": "/home/user"}


# -- get_sandbox_state: phase -> state mapping --------------------------------


@pytest.mark.parametrize(
    ("phase", "ready", "expected_state"),
    [
        ("Running", True, "running"),
        ("Pending", False, "running"),
        ("Succeeded", False, "terminated"),
        ("Failed", False, "terminated"),
    ],
)
def test_get_sandbox_state_maps_pod_phase(
    fake_api: _FakeCoreV1Api,
    provider: k8s_runtime.KubernetesSandboxProvider,
    phase: str,
    ready: bool,
    expected_state: str,
) -> None:
    fake_api.pods["sbx-x"] = _make_pod("sbx-x", phase=phase, ready=ready)

    state = asyncio.run(provider.get_sandbox_state("sbx-x"))

    assert state is not None
    assert state.external_sandbox_id == "sbx-x"
    assert state.state == expected_state


def test_get_sandbox_state_pod_absent_pvc_present_is_paused(
    fake_api: _FakeCoreV1Api, provider: k8s_runtime.KubernetesSandboxProvider
) -> None:
    fake_api.pvcs["sbx-x"] = _make_pvc("sbx-x")

    state = asyncio.run(provider.get_sandbox_state("sbx-x"))

    assert state is not None
    assert state.state == "paused"
    assert state.external_sandbox_id == "sbx-x"


def test_get_sandbox_state_absent_both_is_none(
    fake_api: _FakeCoreV1Api, provider: k8s_runtime.KubernetesSandboxProvider
) -> None:
    state = asyncio.run(provider.get_sandbox_state("sbx-nonexistent"))

    assert state is None


# -- list_sandbox_states -------------------------------------------------------


def test_list_sandbox_states_includes_pods_and_orphan_pvcs(
    fake_api: _FakeCoreV1Api, provider: k8s_runtime.KubernetesSandboxProvider
) -> None:
    fake_api.pods["sbx-a"] = _make_pod("sbx-a", phase="Running", ready=True)
    fake_api.pvcs["sbx-a"] = _make_pvc("sbx-a")  # has a pod: not an orphan
    fake_api.pvcs["sbx-b"] = _make_pvc("sbx-b")  # no pod: paused/orphaned

    states = asyncio.run(provider.list_sandbox_states())

    by_id = {s.external_sandbox_id: s.state for s in states}
    assert by_id == {"sbx-a": "running", "sbx-b": "paused"}


# -- connect_running_sandbox ---------------------------------------------------


def test_connect_running_sandbox_returns_opaque_handle_when_ready(
    fake_api: _FakeCoreV1Api, provider: k8s_runtime.KubernetesSandboxProvider
) -> None:
    fake_api.pods["sbx-x"] = _make_pod("sbx-x", phase="Running", ready=True)

    sandbox = asyncio.run(provider.connect_running_sandbox("sbx-x", timeout_seconds=5))

    assert isinstance(sandbox, k8s_runtime._K8sSandbox)
    assert sandbox.name == "sbx-x"
    assert sandbox.namespace == NAMESPACE


def test_connect_running_sandbox_times_out_when_never_ready(
    fake_api: _FakeCoreV1Api, provider: k8s_runtime.KubernetesSandboxProvider
) -> None:
    fake_api.pods["sbx-x"] = _make_pod("sbx-x", phase="Pending", ready=False)

    with pytest.raises(k8s_runtime.KubernetesUnavailableError) as exc_info:
        asyncio.run(provider.connect_running_sandbox("sbx-x", timeout_seconds=0))

    assert isinstance(exc_info.value, sandbox_base.SandboxProviderUnavailableError)


# -- resume_sandbox: idempotent -------------------------------------------------


def test_resume_sandbox_recreates_missing_pod_against_existing_pvc(
    fake_api: _FakeCoreV1Api, provider: k8s_runtime.KubernetesSandboxProvider
) -> None:
    fake_api.pvcs["sbx-x"] = _make_pvc("sbx-x")  # pod is absent; PVC survives a pause

    sandbox = asyncio.run(provider.resume_sandbox("sbx-x", timeout_seconds=5))

    assert sandbox.name == "sbx-x"
    assert len(fake_api.created_pod_bodies) == 1
    recreated_pod = fake_api.created_pod_bodies[0]
    assert recreated_pod.spec.volumes[0].persistent_volume_claim.claim_name == "sbx-x"
    # Service was also missing, so resume ensures it too.
    assert len(fake_api.created_service_bodies) == 1
    assert fake_api.created_service_bodies[0].metadata.name == "sbx-x"


def test_resume_sandbox_is_idempotent_when_pod_and_service_already_exist(
    fake_api: _FakeCoreV1Api, provider: k8s_runtime.KubernetesSandboxProvider
) -> None:
    fake_api.pods["sbx-x"] = _make_pod("sbx-x", phase="Running", ready=True)
    fake_api.services["sbx-x"] = _make_service("sbx-x")

    sandbox = asyncio.run(provider.resume_sandbox("sbx-x", timeout_seconds=5))

    assert sandbox.name == "sbx-x"
    assert fake_api.created_pod_bodies == []
    assert fake_api.created_service_bodies == []


# -- pause_sandbox / destroy_sandbox --------------------------------------------


def test_pause_sandbox_deletes_pod_and_service_but_keeps_pvc(
    fake_api: _FakeCoreV1Api, provider: k8s_runtime.KubernetesSandboxProvider
) -> None:
    fake_api.pods["sbx-x"] = _make_pod("sbx-x", phase="Running", ready=True)
    fake_api.services["sbx-x"] = _make_service("sbx-x")
    fake_api.pvcs["sbx-x"] = _make_pvc("sbx-x")

    asyncio.run(provider.pause_sandbox("sbx-x"))

    assert "sbx-x" not in fake_api.pods
    assert "sbx-x" not in fake_api.services
    assert "sbx-x" in fake_api.pvcs


def test_destroy_sandbox_deletes_pod_service_and_pvc(
    fake_api: _FakeCoreV1Api, provider: k8s_runtime.KubernetesSandboxProvider
) -> None:
    fake_api.pods["sbx-x"] = _make_pod("sbx-x", phase="Running", ready=True)
    fake_api.services["sbx-x"] = _make_service("sbx-x")
    fake_api.pvcs["sbx-x"] = _make_pvc("sbx-x")

    asyncio.run(provider.destroy_sandbox("sbx-x"))

    assert "sbx-x" not in fake_api.pods
    assert "sbx-x" not in fake_api.services
    assert "sbx-x" not in fake_api.pvcs


def test_pause_and_destroy_tolerate_already_missing_objects(
    fake_api: _FakeCoreV1Api, provider: k8s_runtime.KubernetesSandboxProvider
) -> None:
    # Nothing exists for "sbx-ghost" -- deleting must not raise (idempotent).
    asyncio.run(provider.pause_sandbox("sbx-ghost"))
    asyncio.run(provider.destroy_sandbox("sbx-ghost"))


# -- run_command -----------------------------------------------------------


def _sandbox() -> k8s_runtime._K8sSandbox:
    return k8s_runtime._K8sSandbox(name="sbx-x", namespace=NAMESPACE)


def test_run_command_returns_result_and_does_not_raise_on_nonzero_exit(
    fake_api: _FakeCoreV1Api,
    provider: k8s_runtime.KubernetesSandboxProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}
    ws = _FakeWSClient(stdout="command output", stderr="some stderr", returncode=7)
    monkeypatch.setattr(k8s_runtime, "_load_stream", lambda: _make_fake_stream(captured, ws))

    result = asyncio.run(provider.run_command(_sandbox(), "echo hi"))

    assert result.exit_code == 7
    assert result.stdout == "command output"
    assert result.stderr == "some stderr"
    assert captured["kwargs"]["command"] == ["/bin/sh", "-lc", "echo hi"]
    assert captured["kwargs"]["stdin"] is False
    assert captured["kwargs"]["stderr"] is True
    assert captured["kwargs"]["stdout"] is True
    assert captured["kwargs"]["tty"] is False
    assert captured["kwargs"]["_preload_content"] is False
    assert captured["args"] == ("sbx-x", NAMESPACE)


def test_run_command_composes_cwd_and_envs_into_shell_command(
    fake_api: _FakeCoreV1Api,
    provider: k8s_runtime.KubernetesSandboxProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}
    ws = _FakeWSClient(returncode=0)
    monkeypatch.setattr(k8s_runtime, "_load_stream", lambda: _make_fake_stream(captured, ws))

    asyncio.run(
        provider.run_command(
            _sandbox(),
            "echo hi",
            cwd="/tmp/workspace",
            envs={"FOO": "bar", "BAZ": "qux"},
        )
    )

    assert captured["kwargs"]["command"] == [
        "/bin/sh",
        "-lc",
        "cd /tmp/workspace && export FOO=bar; export BAZ=qux; echo hi",
    ]


def test_run_command_wraps_user_switch_with_su(
    fake_api: _FakeCoreV1Api,
    provider: k8s_runtime.KubernetesSandboxProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}
    ws = _FakeWSClient(returncode=0)
    monkeypatch.setattr(k8s_runtime, "_load_stream", lambda: _make_fake_stream(captured, ws))

    asyncio.run(provider.run_command(_sandbox(), "echo hi", user="root"))

    expected = f"su - root -c {shlex.quote('echo hi')}"
    assert captured["kwargs"]["command"] == ["/bin/sh", "-lc", expected]


def test_run_command_does_not_su_for_the_default_runtime_user(
    fake_api: _FakeCoreV1Api,
    provider: k8s_runtime.KubernetesSandboxProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}
    ws = _FakeWSClient(returncode=0)
    monkeypatch.setattr(k8s_runtime, "_load_stream", lambda: _make_fake_stream(captured, ws))

    asyncio.run(
        provider.run_command(_sandbox(), "echo hi", user=k8s_runtime.K8S_DEFAULT_RUNTIME_USER)
    )

    assert captured["kwargs"]["command"] == ["/bin/sh", "-lc", "echo hi"]


def test_run_command_background_wraps_with_nohup_and_returns_fixed_result(
    fake_api: _FakeCoreV1Api,
    provider: k8s_runtime.KubernetesSandboxProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}
    # Even if the transport reports a nonzero exit/output, background always
    # returns the fixed (0, "", "") result -- it is unused upstream.
    ws = _FakeWSClient(stdout="ignored", stderr="ignored", returncode=1)
    monkeypatch.setattr(k8s_runtime, "_load_stream", lambda: _make_fake_stream(captured, ws))

    result = asyncio.run(provider.run_command(_sandbox(), "echo hi", background=True))

    assert result.exit_code == 0
    assert result.stdout == ""
    assert result.stderr == ""
    assert captured["kwargs"]["command"] == ["/bin/sh", "-lc", "nohup echo hi >/dev/null 2>&1 &"]


def test_run_command_raises_on_transport_failure(
    fake_api: _FakeCoreV1Api,
    provider: k8s_runtime.KubernetesSandboxProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _failing_stream(*_args: Any, **_kwargs: Any) -> Any:
        raise OSError("connection refused")

    monkeypatch.setattr(k8s_runtime, "_load_stream", lambda: _failing_stream)

    with pytest.raises(k8s_runtime.KubernetesUnavailableError) as exc_info:
        asyncio.run(provider.run_command(_sandbox(), "echo hi"))

    assert isinstance(exc_info.value, sandbox_base.SandboxProviderUnavailableError)


# -- write_file --------------------------------------------------------------


def test_write_file_base64_round_trips_bytes_and_mkdirs_parent(
    fake_api: _FakeCoreV1Api,
    provider: k8s_runtime.KubernetesSandboxProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}
    ws = _FakeWSClient(returncode=0)
    monkeypatch.setattr(k8s_runtime, "_load_stream", lambda: _make_fake_stream(captured, ws))

    asyncio.run(
        provider.write_file(_sandbox(), "/home/user/workspace/notes/a.txt", b"hello world")
    )

    path = "/home/user/workspace/notes/a.txt"
    assert captured["kwargs"]["command"] == [
        "/bin/sh",
        "-c",
        f'mkdir -p "$(dirname {path})" && base64 -d > {path}',
    ]
    assert captured["kwargs"]["stdin"] is True
    assert ws.written_stdin == [base64.b64encode(b"hello world").decode("ascii")]


def test_write_file_accepts_str_content(
    fake_api: _FakeCoreV1Api,
    provider: k8s_runtime.KubernetesSandboxProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}
    ws = _FakeWSClient(returncode=0)
    monkeypatch.setattr(k8s_runtime, "_load_stream", lambda: _make_fake_stream(captured, ws))

    asyncio.run(provider.write_file(_sandbox(), "/home/user/workspace/a.txt", "hello"))

    assert ws.written_stdin == [base64.b64encode(b"hello").decode("ascii")]


def test_write_file_shell_quotes_a_path_with_special_characters(
    fake_api: _FakeCoreV1Api,
    provider: k8s_runtime.KubernetesSandboxProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}
    ws = _FakeWSClient(returncode=0)
    monkeypatch.setattr(k8s_runtime, "_load_stream", lambda: _make_fake_stream(captured, ws))

    path = "/home/user/workspace/needs quoting/file.txt"
    asyncio.run(provider.write_file(_sandbox(), path, "hi"))

    quoted = shlex.quote(path)
    assert captured["kwargs"]["command"] == [
        "/bin/sh",
        "-c",
        f'mkdir -p "$(dirname {quoted})" && base64 -d > {quoted}',
    ]


def test_write_file_raises_provider_unavailable_on_nonzero_exit(
    fake_api: _FakeCoreV1Api,
    provider: k8s_runtime.KubernetesSandboxProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ws = _FakeWSClient(stdout="", stderr="disk full", returncode=1)
    monkeypatch.setattr(k8s_runtime, "_load_stream", lambda: _make_fake_stream({}, ws))

    with pytest.raises(k8s_runtime.KubernetesUnavailableError) as exc_info:
        asyncio.run(provider.write_file(_sandbox(), "/home/user/workspace/a.txt", "hi"))

    assert isinstance(exc_info.value, sandbox_base.SandboxProviderUnavailableError)


# -- _load_client / _load_stream seams stay lazy -------------------------------


def test_load_client_is_not_called_at_import_time(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[str] = []
    monkeypatch.setattr(
        k8s_runtime,
        "_load_client",
        lambda: calls.append("called") or (_ for _ in ()).throw(AssertionError("should not run")),
    )
    # Merely constructing the provider (module already imported) must not
    # touch the seam.
    k8s_runtime.KubernetesSandboxProvider()
    assert calls == []
