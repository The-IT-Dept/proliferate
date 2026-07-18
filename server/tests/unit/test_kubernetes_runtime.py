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
from datetime import UTC, datetime
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
    """Fake `kubernetes.stream.ws_client.WSClient`.

    Three delivery modes, chosen by which constructor args are passed:

    - default (`stdout`/`stderr`/`returncode`): all output + closure
      "arrive" on the first `update()` call -- no real I/O, exercises the
      single-poll path most tests use.
    - `frames`: each `update()` call delivers one (stdout, stderr) chunk and
      the stream only closes once every frame has been delivered, exercising
      the multi-poll drain path (exit-code-after-close ordering across
      frames).
    - `stay_open=True`: `is_open()` never turns False and `update()` is a
      no-op -- models a command that never terminates, for exercising
      `run_command`'s timeout enforcement without any real sleep (the fake
      never blocks; the deadline is what ends the loop).
    """

    def __init__(
        self,
        *,
        stdout: str = "",
        stderr: str = "",
        returncode: int | None = 0,
        returncode_raises: BaseException | None = None,
        frames: list[tuple[str, str]] | None = None,
        stay_open: bool = False,
    ) -> None:
        self._frames = list(frames) if frames is not None else None
        self._pending_stdout = "" if self._frames is not None else stdout
        self._pending_stderr = "" if self._frames is not None else stderr
        self._returncode = returncode
        self._returncode_raises = returncode_raises
        self._stay_open = stay_open
        self._open = True
        self.closed = False
        self.update_calls = 0

    def is_open(self) -> bool:
        return self._open

    def update(self, timeout: float | None = None) -> None:
        del timeout
        self.update_calls += 1
        if self._stay_open:
            # Never closes -- the caller's deadline is what must end this.
            return
        if self._frames is not None:
            if self._frames:
                out, err = self._frames.pop(0)
                self._pending_stdout += out
                self._pending_stderr += err
            if not self._frames:
                self._open = False
            return
        # Default mode: all data + closure "arrives" on the first poll.
        self._open = False

    def peek_stdout(self) -> bool:
        return bool(self._pending_stdout)

    def read_stdout(self) -> str:
        value = self._pending_stdout
        self._pending_stdout = ""
        return value

    def peek_stderr(self) -> bool:
        return bool(self._pending_stderr)

    def read_stderr(self) -> str:
        value = self._pending_stderr
        self._pending_stderr = ""
        return value

    @property
    def returncode(self) -> int | None:
        if self._returncode_raises is not None:
            raise self._returncode_raises
        return self._returncode

    def close(self, **kwargs: Any) -> None:
        del kwargs
        self.closed = True


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
    assert container.ports[0].name == "runtime"
    assert container.ports[0].container_port == 8457
    # The PVC-backed volume mounts three times via subPath -- workspace and
    # the two persisted agent credential dirs -- never at /home/user itself:
    # the baked runtime (anyharness binary, worker/supervisor, pre-installed
    # agents) lives in the image layer under /home/user and must stay
    # visible on every fresh pod. Kubernetes does not copy image content
    # into a PVC, so mounting the (empty) PVC at /home/user would mask that
    # baked runtime entirely. All three mounts come off the single PVC
    # volume declared in pod.spec.volumes.
    assert len(container.volume_mounts) == 3
    assert container.volume_mounts[0].mount_path == "/home/user/workspace"
    assert container.volume_mounts[0].name == "workspace"
    assert container.volume_mounts[0].sub_path == "workspace"
    assert container.volume_mounts[1].mount_path == "/home/user/.claude"
    assert container.volume_mounts[1].name == "workspace"
    assert container.volume_mounts[1].sub_path == "claude"
    assert container.volume_mounts[2].mount_path == "/home/user/.codex"
    assert container.volume_mounts[2].name == "workspace"
    assert container.volume_mounts[2].sub_path == "codex"
    assert container.resources.requests == {"cpu": "500m", "memory": "1Gi"}
    assert container.resources.limits == {"cpu": "2", "memory": "4Gi"}
    assert pod.spec.security_context.run_as_user == 1000
    assert pod.spec.security_context.run_as_group == 1000
    assert pod.spec.security_context.fs_group == 1000
    assert len(pod.spec.volumes) == 1
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


def test_create_sandbox_cleans_up_pvc_and_pod_when_service_create_fails(
    fake_api: _FakeCoreV1Api,
    provider: k8s_runtime.KubernetesSandboxProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # A failure creating the Service (the last of the three objects) must
    # not orphan the PVC and Pod that already landed -- create_sandbox never
    # returned an id for the caller to reconcile against, so cleanup here is
    # the only thing standing between this and a permanently leaked PVC+Pod.
    def _failing_create_service(namespace: str, body: Any) -> Any:
        del namespace, body
        raise _FakeApiException(500)

    monkeypatch.setattr(fake_api, "create_namespaced_service", _failing_create_service)

    with pytest.raises(_FakeApiException):
        asyncio.run(provider.create_sandbox())

    assert len(fake_api.created_pvc_bodies) == 1
    assert len(fake_api.created_pod_bodies) == 1
    name = fake_api.created_pvc_bodies[0].metadata.name

    assert fake_api.deleted_pods == [name]
    assert fake_api.deleted_pvcs == [name]
    # Actually removed from the fake cluster state, not just attempted.
    assert name not in fake_api.pods
    assert name not in fake_api.pvcs
    # The service was never created, so there is nothing to clean up there.
    assert fake_api.deleted_services == []


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
    assert context.base_env == {
        "HOME": "/home/user",
        "CODEX_HOME": "/home/user/.codex",
        "CLAUDE_CONFIG_DIR": "/home/user/.claude",
    }


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


def test_get_sandbox_state_populates_started_at_from_pod_status(
    fake_api: _FakeCoreV1Api, provider: k8s_runtime.KubernetesSandboxProvider
) -> None:
    start_time = datetime(2026, 7, 18, 10, 30, 0, tzinfo=UTC)
    fake_api.pods["sbx-x"] = _make_pod("sbx-x", phase="Running", ready=True, start_time=start_time)

    state = asyncio.run(provider.get_sandbox_state("sbx-x"))

    assert state is not None
    assert state.started_at == start_time


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


def test_run_command_rejects_malicious_env_key_instead_of_interpolating_it(
    fake_api: _FakeCoreV1Api,
    provider: k8s_runtime.KubernetesSandboxProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # The env VALUE is shlex.quote'd, but a raw KEY would be interpolated
    # unescaped into `export {key}=...`; a key like this would otherwise
    # break out of the export statement and run an arbitrary command.
    captured: dict[str, Any] = {}
    ws = _FakeWSClient(returncode=0)
    monkeypatch.setattr(k8s_runtime, "_load_stream", lambda: _make_fake_stream(captured, ws))

    with pytest.raises(k8s_runtime.KubernetesRuntimeError):
        asyncio.run(provider.run_command(_sandbox(), "echo hi", envs={"X; touch /pwned": "1"}))

    # Rejected before ever reaching the transport -- nothing was executed.
    assert captured == {}


def test_run_command_accepts_a_valid_env_key(
    fake_api: _FakeCoreV1Api,
    provider: k8s_runtime.KubernetesSandboxProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}
    ws = _FakeWSClient(returncode=0)
    monkeypatch.setattr(k8s_runtime, "_load_stream", lambda: _make_fake_stream(captured, ws))

    asyncio.run(provider.run_command(_sandbox(), "echo hi", envs={"_FOO_9": "bar"}))

    assert captured["kwargs"]["command"] == ["/bin/sh", "-lc", "export _FOO_9=bar; echo hi"]


def test_run_command_enforces_timeout_and_closes_the_stream(
    fake_api: _FakeCoreV1Api,
    provider: k8s_runtime.KubernetesSandboxProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # `stay_open=True` models a remote command that never terminates: the
    # fake never blocks (no real I/O, no real sleep), so the only thing that
    # can end this test is `run_command` enforcing its own monotonic
    # deadline. `timeout_seconds=0` makes that deadline already-elapsed by
    # the time the drain loop takes its first reading, so this resolves
    # near-instantly with no sleeping of any kind.
    ws = _FakeWSClient(stay_open=True)
    monkeypatch.setattr(k8s_runtime, "_load_stream", lambda: _make_fake_stream({}, ws))

    with pytest.raises(k8s_runtime.KubernetesUnavailableError) as exc_info:
        asyncio.run(provider.run_command(_sandbox(), "sleep 9999", timeout_seconds=0))

    assert isinstance(exc_info.value, sandbox_base.SandboxProviderUnavailableError)
    # The websocket must be closed even though the loop exited via timeout,
    # not via the stream reporting itself closed.
    assert ws.closed is True


def test_run_command_drains_output_delivered_across_multiple_update_polls(
    fake_api: _FakeCoreV1Api,
    provider: k8s_runtime.KubernetesSandboxProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Output arriving over several `update()` polls (rather than all at once
    # on the first poll) exercises that stdout/stderr accumulate correctly
    # across frames and that the exit code is only read once the stream
    # actually reports closed, after the last frame.
    captured: dict[str, Any] = {}
    ws = _FakeWSClient(
        frames=[("chunk-1 ", ""), ("chunk-2 ", "warn "), ("chunk-3", "later")],
        returncode=3,
    )
    monkeypatch.setattr(k8s_runtime, "_load_stream", lambda: _make_fake_stream(captured, ws))

    result = asyncio.run(provider.run_command(_sandbox(), "echo hi"))

    assert result.stdout == "chunk-1 chunk-2 chunk-3"
    assert result.stderr == "warn later"
    assert result.exit_code == 3
    assert ws.update_calls == 3
    assert ws.closed is True


def test_run_command_raises_unavailable_when_returncode_is_unreadable(
    fake_api: _FakeCoreV1Api,
    provider: k8s_runtime.KubernetesSandboxProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Mirrors the real WSClient.returncode: on an abnormal close it derives
    # the exit code from the exec error channel and can raise TypeError
    # (`None['status']`) when that channel comes back empty. A bogus exit
    # code must never be reported, so this must surface as unavailable.
    ws = _FakeWSClient(returncode_raises=TypeError("'NoneType' object is not subscriptable"))
    monkeypatch.setattr(k8s_runtime, "_load_stream", lambda: _make_fake_stream({}, ws))

    with pytest.raises(k8s_runtime.KubernetesUnavailableError) as exc_info:
        asyncio.run(provider.run_command(_sandbox(), "echo hi"))

    assert isinstance(exc_info.value, sandbox_base.SandboxProviderUnavailableError)
    assert ws.closed is True


# -- write_file --------------------------------------------------------------
#
# `write_file` embeds the base64 payload directly in the exec argv instead
# of streaming it over stdin (see kubernetes.py:_exec_stream for why: the
# kubernetes WSClient has no stdin half-close, so a stdin-fed `base64 -d`
# would block forever waiting for an EOF the transport cannot deliver
# without closing the whole stream first -- exactly what the drain loop is
# waiting on, i.e. a deadlock). These tests model a realistic exec: the
# command runs and returns exit 0/nonzero, with NO reliance on stdin at all
# -- `_FakeWSClient` no longer even has a `write_stdin` method, so a
# regression back to the old stdin-based approach would fail with an
# AttributeError, not a false pass.


def _script_prefix(quoted_path: str) -> str:
    return f'mkdir -p "$(dirname {quoted_path})" && printf %s '


def _script_suffix(quoted_path: str) -> str:
    return f" | base64 -d > {quoted_path}"


def _extract_embedded_base64(script: str, path: str) -> str:
    quoted_path = shlex.quote(path)
    prefix = _script_prefix(quoted_path)
    suffix = _script_suffix(quoted_path)
    assert script.startswith(prefix)
    assert script.endswith(suffix)
    return script[len(prefix) : len(script) - len(suffix)]


def test_write_file_embeds_base64_of_bytes_content_in_argv_and_mkdirs_parent(
    fake_api: _FakeCoreV1Api,
    provider: k8s_runtime.KubernetesSandboxProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}
    ws = _FakeWSClient(returncode=0)
    monkeypatch.setattr(k8s_runtime, "_load_stream", lambda: _make_fake_stream(captured, ws))

    path = "/home/user/workspace/notes/a.txt"
    content = b"hello world"
    asyncio.run(provider.write_file(_sandbox(), path, content))

    command = captured["kwargs"]["command"]
    assert command[:2] == ["/bin/sh", "-c"]
    script = command[2]
    embedded = _extract_embedded_base64(script, path)
    assert base64.b64decode(embedded) == content
    # No stdin at all -- the whole payload travels in argv.
    assert captured["kwargs"]["stdin"] is False


def test_write_file_embeds_base64_of_str_content_in_argv(
    fake_api: _FakeCoreV1Api,
    provider: k8s_runtime.KubernetesSandboxProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, Any] = {}
    ws = _FakeWSClient(returncode=0)
    monkeypatch.setattr(k8s_runtime, "_load_stream", lambda: _make_fake_stream(captured, ws))

    path = "/home/user/workspace/a.txt"
    content = "hello"
    asyncio.run(provider.write_file(_sandbox(), path, content))

    script = captured["kwargs"]["command"][2]
    embedded = _extract_embedded_base64(script, path)
    assert base64.b64decode(embedded) == content.encode("utf-8")


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
    script = captured["kwargs"]["command"][2]
    assert script.startswith(f'mkdir -p "$(dirname {quoted})" && ')
    assert script.endswith(f" | base64 -d > {quoted}")
    embedded = _extract_embedded_base64(script, path)
    assert base64.b64decode(embedded) == b"hi"


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


def test_write_file_rejects_payload_exceeding_the_argv_size_guard(
    provider: k8s_runtime.KubernetesSandboxProvider,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _stream_loader_should_not_be_called() -> Any:
        raise AssertionError(
            "write_file must reject an oversized payload before touching the transport"
        )

    monkeypatch.setattr(k8s_runtime, "_load_stream", _stream_loader_should_not_be_called)

    # 300 KiB of raw bytes base64-encodes to ~400 KiB, comfortably past the
    # 256 KiB argv-embedded guard.
    oversized_content = b"a" * (300 * 1024)

    with pytest.raises(k8s_runtime.KubernetesUnavailableError) as exc_info:
        asyncio.run(
            provider.write_file(_sandbox(), "/home/user/workspace/big.bin", oversized_content)
        )

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
