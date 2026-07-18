"""Kubernetes-backed sandbox provider.

Runs each cloud sandbox as a Pod + Service + PersistentVolumeClaim in a
single namespace, using the official `kubernetes` client against in-cluster
config. Structurally mirrors `proliferate.integrations.sandbox.e2b`: async
public methods wrap blocking calls via `asyncio.to_thread`, a lazy
`_load_client()` seam keeps module import free of any cluster access (so
unit tests can monkeypatch it without a real cluster), and provider-specific
failures are translated to the shared `SandboxProvider*Error` hierarchy at
the public-method boundary.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import re
import shlex
import time
import uuid
from dataclasses import dataclass
from typing import Any

from proliferate.config import settings
from proliferate.constants.sandbox.kubernetes import (
    K8S_APP_LABEL_KEY,
    K8S_CLAUDE_MOUNT_PATH,
    K8S_CLAUDE_SUBPATH,
    K8S_CODEX_MOUNT_PATH,
    K8S_CODEX_SUBPATH,
    K8S_CONTAINER_NAME,
    K8S_DEFAULT_COMMAND_TIMEOUT_SECONDS,
    K8S_DEFAULT_READY_TIMEOUT_SECONDS,
    K8S_DEFAULT_RUNTIME_USER,
    K8S_READY_POLL_INTERVAL_SECONDS,
    K8S_RUN_AS_ID,
    K8S_RUNTIME_BINARY_PATH,
    K8S_RUNTIME_PORT,
    K8S_RUNTIME_WORKDIR,
    K8S_SANDBOX_LABEL_KEY,
    K8S_SANDBOX_NAME_PREFIX,
    K8S_TEMPLATE_VERSION,
    K8S_USER_HOME,
    K8S_WORKSPACE_SUBPATH,
    K8S_WORKSPACE_VOLUME_NAME,
)
from proliferate.integrations.sandbox.base import (
    ProviderSandboxState,
    RuntimeEndpoint,
    SandboxHandle,
    SandboxProviderConfigurationError,
    SandboxProviderKind,
    SandboxProviderTargetUnavailableError,
    SandboxProviderUnavailableError,
    SandboxRuntimeContext,
)
from proliferate.utils.time import utcnow

logger = logging.getLogger("proliferate.cloud.kubernetes")

# Shell identifier syntax -- deliberately conservative (no leading digit, no
# punctuation) so a caller-supplied env key can never break out of the
# `export {key}=...` interpolation in `_compose_shell_command`. The value is
# still `shlex.quote`d separately.
_ENV_KEY_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

# `write_file` embeds the base64 payload directly in the exec argv (see
# `_write_file`) instead of streaming it over stdin, so it is bounded by the
# kernel's ARG_MAX. Production callers only ever write small generated
# scripts/TOML (see `sandbox_exec.py`), so this bound is never expected to
# trip in practice -- it exists to fail loudly instead of silently truncating
# or hanging if that ever changes.
_MAX_WRITE_FILE_BASE64_BYTES = 256 * 1024


class KubernetesRuntimeError(SandboxProviderConfigurationError):
    """Local Kubernetes configuration or client-contract failure."""


class KubernetesUnavailableError(SandboxProviderUnavailableError):
    """A configured Kubernetes provider is temporarily unavailable."""


class KubernetesTargetUnavailableError(SandboxProviderTargetUnavailableError):
    """The exact Kubernetes sandbox (Pod/PVC) no longer exists."""


@dataclass(frozen=True)
class _K8sSandbox:
    """Opaque connect/run/write handle: just enough to address the Pod."""

    name: str
    namespace: str


@dataclass(frozen=True)
class _CommandResult:
    """`run_command` / `write_file` exec result. Never raised on nonzero exit."""

    exit_code: int
    stdout: str
    stderr: str


def _load_client() -> Any:
    """Lazily construct an in-cluster CoreV1Api client.

    Kept lazy (import + `load_incluster_config()` both happen only when
    called) so importing this module never touches the cluster -- unit tests
    import cleanly and monkeypatch this function with a fake. Mirrors
    `e2b.py:_load_sdk`.
    """
    try:
        from kubernetes import client, config
    except ImportError as exc:  # pragma: no cover - depends on environment
        raise KubernetesRuntimeError(
            "kubernetes client is not installed in this environment. "
            "Install the server dependencies to enable Kubernetes sandbox provisioning."
        ) from exc
    config.load_incluster_config()
    return client.CoreV1Api()


def _load_client_module() -> Any:
    """Lazily return the `kubernetes.client` types module (V1Pod, etc.).

    Separate from `_load_client()` because building object specs never
    touches the cluster and tests exercise it against the real types (they
    only fake the CoreV1Api and the exec stream).
    """
    try:
        from kubernetes import client
    except ImportError as exc:  # pragma: no cover - depends on environment
        raise KubernetesRuntimeError(
            "kubernetes client is not installed in this environment. "
            "Install the server dependencies to enable Kubernetes sandbox provisioning."
        ) from exc
    return client


def _load_stream() -> Any:
    """Lazily return `kubernetes.stream.stream`, faked in exec-method tests."""
    try:
        from kubernetes.stream import stream
    except ImportError as exc:  # pragma: no cover - depends on environment
        raise KubernetesRuntimeError(
            "kubernetes stream module is not installed in this environment."
        ) from exc
    return stream


def _is_not_found(error: Exception) -> bool:
    # Duck-typed on `.status` rather than importing ApiException so both the
    # real `kubernetes.client.rest.ApiException` and a test's fake exception
    # class are recognized identically.
    return getattr(error, "status", None) == 404


def _translate_k8s_exception(error: Exception, *, operation: str) -> Exception | None:
    if isinstance(error, (TimeoutError, ConnectionError, OSError)):
        return KubernetesUnavailableError(f"Kubernetes {operation} is unavailable")
    try:
        from kubernetes.client.rest import ApiException  # type: ignore[import-untyped]
    except ImportError:
        return None
    if isinstance(error, ApiException):
        if error.status == 404:
            return KubernetesTargetUnavailableError(
                f"Kubernetes {operation} target is unavailable"
            )
        return KubernetesUnavailableError(f"Kubernetes {operation} is unavailable")
    return None


async def _run_k8s_call(operation: str, fn: Any, *args: Any) -> Any:
    try:
        return await asyncio.to_thread(fn, *args)
    except (KubernetesRuntimeError, KubernetesUnavailableError, KubernetesTargetUnavailableError):
        raise
    except Exception as error:
        translated = _translate_k8s_exception(error, operation=operation)
        if translated is None:
            raise
        raise translated from error


def _pod_ready(pod: Any) -> bool:
    status = getattr(pod, "status", None)
    if status is None or getattr(status, "phase", None) != "Running":
        return False
    for condition in getattr(status, "conditions", None) or []:
        if getattr(condition, "type", None) == "Ready":
            return getattr(condition, "status", None) == "True"
    return False


def _map_phase_to_state(phase: str | None) -> str:
    if phase in ("Succeeded", "Failed"):
        return "terminated"
    # Running, Pending (starting), Unknown, and any unrecognized phase are
    # all "running": the Pod object exists and has not reached a terminal
    # phase.
    return "running"


def _compose_shell_command(
    command: str,
    *,
    user: str | None,
    cwd: str | None,
    envs: dict[str, str] | None,
) -> str:
    wrapped = ""
    if cwd:
        wrapped += f"cd {shlex.quote(cwd)} && "
    if envs:
        for key, value in envs.items():
            if not _ENV_KEY_PATTERN.match(key):
                raise KubernetesRuntimeError(
                    f"Refusing to export environment variable with invalid name {key!r}: "
                    "must match ^[A-Za-z_][A-Za-z0-9_]*$"
                )
            wrapped += f"export {key}={shlex.quote(value)}; "
    wrapped += command
    if user and user != K8S_DEFAULT_RUNTIME_USER:
        # The pod already runs as the default runtime user; switching to a
        # different user requires `su` to be usable from the image's shell
        # (i.e. the image must allow non-root user switching).
        wrapped = f"su - {shlex.quote(user)} -c {shlex.quote(wrapped)}"
    return wrapped


def _drain_exec_stream(resp: Any, *, timeout_seconds: float) -> _CommandResult:
    """Read stdout/stderr until the stream closes, then read the exit code.

    Bounded by a monotonic deadline: `resp.is_open()` only turns False once
    the remote side ends the exec stream, so a remote command that never
    terminates would otherwise block the calling `to_thread` worker forever.
    The websocket is always closed on the way out (success, exit-code
    failure, or timeout) via `finally`.
    """
    stdout_chunks: list[str] = []
    stderr_chunks: list[str] = []
    deadline = time.monotonic() + timeout_seconds
    try:
        while resp.is_open():
            if time.monotonic() >= deadline:
                raise KubernetesUnavailableError(
                    f"Kubernetes exec did not complete within {timeout_seconds}s"
                )
            resp.update(timeout=1)
            if resp.peek_stdout():
                stdout_chunks.append(resp.read_stdout())
            if resp.peek_stderr():
                stderr_chunks.append(resp.read_stderr())
        try:
            exit_code = resp.returncode
        except (TypeError, KeyError, IndexError) as error:
            # The WSClient derives the exit code from the exec error channel
            # (`err['status']` / `err['details']['causes'][0]['message']`);
            # an abnormal close can leave that channel empty or malformed,
            # which raises here rather than yielding a real code. We cannot
            # report a bogus exit code, so this is infra-unavailable.
            raise KubernetesUnavailableError(
                "Kubernetes exec closed without a readable exit code"
            ) from error
    finally:
        resp.close()
    return _CommandResult(
        exit_code=int(exit_code) if exit_code is not None else 0,
        stdout="".join(stdout_chunks),
        stderr="".join(stderr_chunks),
    )


class KubernetesSandboxProvider:
    @property
    def kind(self) -> SandboxProviderKind:
        return SandboxProviderKind.kubernetes

    @property
    def template_version(self) -> str:
        return K8S_TEMPLATE_VERSION

    @property
    def runtime_port(self) -> int:
        return K8S_RUNTIME_PORT

    @property
    def runtime_endpoint_handles_cors(self) -> bool:
        return False

    @property
    def runtime_workdir(self) -> str:
        return K8S_RUNTIME_WORKDIR

    @property
    def runtime_binary_path(self) -> str:
        return K8S_RUNTIME_BINARY_PATH

    @property
    def user_home(self) -> str:
        return K8S_USER_HOME

    @property
    def preserves_processes_on_resume(self) -> bool:
        # Pausing deletes the Pod (only the PVC survives), so a resumed
        # sandbox starts a fresh container -- no in-memory process state
        # carries over the way E2B's pause/resume preserves it.
        return False

    # -- lifecycle -----------------------------------------------------

    async def create_sandbox(self, *, metadata: dict[str, str] | None = None) -> SandboxHandle:
        return await _run_k8s_call("sandbox create", self._create_sandbox, metadata)

    async def connect_running_sandbox(
        self,
        sandbox_id: str,
        *,
        timeout_seconds: int | None = None,
    ) -> Any:
        return await _run_k8s_call("sandbox connect", self._connect, sandbox_id, timeout_seconds)

    async def resume_sandbox(
        self,
        sandbox_id: str,
        *,
        timeout_seconds: int | None = None,
    ) -> Any:
        return await _run_k8s_call(
            "sandbox resume", self._resume_sandbox, sandbox_id, timeout_seconds
        )

    async def get_sandbox_state(self, sandbox_id: str) -> ProviderSandboxState | None:
        return await _run_k8s_call("sandbox state", self._get_sandbox_state, sandbox_id)

    async def list_sandbox_states(self) -> list[ProviderSandboxState]:
        return await _run_k8s_call("sandbox list", self._list_sandbox_states)

    async def resolve_runtime_endpoint(self, sandbox: Any) -> RuntimeEndpoint:
        return await _run_k8s_call("runtime endpoint", self._resolve_runtime_endpoint, sandbox)

    async def resolve_runtime_context(self, sandbox: Any) -> SandboxRuntimeContext:
        return await _run_k8s_call("runtime context", self._resolve_runtime_context, sandbox)

    async def pause_sandbox(self, sandbox_id: str) -> None:
        await _run_k8s_call("sandbox pause", self._pause_sandbox, sandbox_id)

    async def destroy_sandbox(self, sandbox_id: str) -> None:
        await _run_k8s_call("sandbox destroy", self._destroy_sandbox, sandbox_id)

    # -- exec ------------------------------------------------------------

    async def run_command(
        self,
        sandbox: Any,
        command: str,
        *,
        user: str | None = None,
        cwd: str | None = None,
        envs: dict[str, str] | None = None,
        background: bool = False,
        timeout_seconds: int | None = None,
    ) -> Any:
        return await _run_k8s_call(
            "command",
            self._run_command,
            sandbox,
            command,
            user,
            cwd,
            envs,
            background,
            timeout_seconds,
        )

    async def write_file(self, sandbox: Any, path: str, content: bytes | str) -> None:
        await _run_k8s_call("file write", self._write_file, sandbox, path, content)

    # -- internals: namespace / labels / object builders ------------------

    def _namespace(self) -> str:
        return settings.kubernetes_sandbox_namespace

    def _labels(self, name: str) -> dict[str, str]:
        return {K8S_APP_LABEL_KEY: name, K8S_SANDBOX_LABEL_KEY: name}

    def _build_pvc(self, k8s: Any, name: str, labels: dict[str, str]) -> Any:
        return k8s.V1PersistentVolumeClaim(
            metadata=k8s.V1ObjectMeta(name=name, namespace=self._namespace(), labels=labels),
            spec=k8s.V1PersistentVolumeClaimSpec(
                access_modes=["ReadWriteOnce"],
                resources=k8s.V1ResourceRequirements(
                    requests={"storage": settings.kubernetes_sandbox_storage_size}
                ),
                storage_class_name=settings.kubernetes_sandbox_storage_class,
            ),
        )

    def _build_pod(self, k8s: Any, name: str, labels: dict[str, str]) -> Any:
        container = k8s.V1Container(
            name=K8S_CONTAINER_NAME,
            image=settings.kubernetes_sandbox_image,
            command=["sleep", "infinity"],
            ports=[
                k8s.V1ContainerPort(name="runtime", container_port=K8S_RUNTIME_PORT),
            ],
            volume_mounts=[
                # The PVC backs three subdirectories of home, not the whole
                # home directory, via three subPath mounts off the SAME
                # PVC-backed volume. The sandbox image bakes the anyharness
                # binary, worker/supervisor, and pre-installed agents into
                # /home/user (see sandbox/Dockerfile); those live in the image
                # layer and are present on every fresh pod. Kubernetes does
                # NOT copy image content into a PVC the way a Docker named
                # volume would, so mounting the (empty, persistent) PVC at
                # /home/user would mask that baked runtime entirely --
                # /home/user/anyharness would not exist and connect would
                # fail with ENOENT on every sandbox. The workspace mount
                # (repo checkout) is stateful and needs to survive pause/
                # resume (pod delete -> recreate on the same PVC); worker/
                # runtime process state is ephemeral per-pod and
                # re-established by the connect path's relaunch, consistent
                # with `preserves_processes_on_resume=False`. The other two
                # mounts back the agent subscription-credential dirs
                # directly -- ~/.claude (claude's ~/.claude/.credentials.json)
                # and ~/.codex (codex's ~/.codex/auth.json) -- so a
                # `claude /login` / `codex login` done in the sandbox
                # survives pod pause/resume too. These are direct subPath
                # mounts of the real dirs, not symlinks to a separate
                # persisted location: symlinking left the target absent on a
                # fresh PVC, so ~/.claude was a dangling symlink and the
                # first `claude /login` could neither `mkdir` it (EEXIST on
                # the symlink name) nor write through it (ENOENT).
                k8s.V1VolumeMount(
                    name=K8S_WORKSPACE_VOLUME_NAME,
                    mount_path=K8S_RUNTIME_WORKDIR,
                    sub_path=K8S_WORKSPACE_SUBPATH,
                ),
                k8s.V1VolumeMount(
                    name=K8S_WORKSPACE_VOLUME_NAME,
                    mount_path=K8S_CLAUDE_MOUNT_PATH,
                    sub_path=K8S_CLAUDE_SUBPATH,
                ),
                k8s.V1VolumeMount(
                    name=K8S_WORKSPACE_VOLUME_NAME,
                    mount_path=K8S_CODEX_MOUNT_PATH,
                    sub_path=K8S_CODEX_SUBPATH,
                ),
            ],
            resources=k8s.V1ResourceRequirements(
                requests={
                    "cpu": settings.kubernetes_sandbox_cpu_request,
                    "memory": settings.kubernetes_sandbox_memory_request,
                },
                limits={
                    "cpu": settings.kubernetes_sandbox_cpu_limit,
                    "memory": settings.kubernetes_sandbox_memory_limit,
                },
            ),
        )
        pod_spec_kwargs: dict[str, Any] = {
            "containers": [container],
            "security_context": k8s.V1PodSecurityContext(
                run_as_user=K8S_RUN_AS_ID,
                run_as_group=K8S_RUN_AS_ID,
                fs_group=K8S_RUN_AS_ID,
            ),
            "volumes": [
                k8s.V1Volume(
                    name=K8S_WORKSPACE_VOLUME_NAME,
                    persistent_volume_claim=k8s.V1PersistentVolumeClaimVolumeSource(
                        claim_name=name
                    ),
                ),
            ],
            "restart_policy": "Always",
        }
        service_account = settings.kubernetes_sandbox_service_account.strip()
        if service_account:
            pod_spec_kwargs["service_account_name"] = service_account
        return k8s.V1Pod(
            metadata=k8s.V1ObjectMeta(name=name, namespace=self._namespace(), labels=labels),
            spec=k8s.V1PodSpec(**pod_spec_kwargs),
        )

    def _build_service(self, k8s: Any, name: str, labels: dict[str, str]) -> Any:
        return k8s.V1Service(
            metadata=k8s.V1ObjectMeta(name=name, namespace=self._namespace(), labels=labels),
            spec=k8s.V1ServiceSpec(
                type="ClusterIP",
                selector={K8S_APP_LABEL_KEY: name},
                ports=[k8s.V1ServicePort(port=K8S_RUNTIME_PORT, target_port=K8S_RUNTIME_PORT)],
            ),
        )

    # -- internals: reads (404 -> None) ------------------------------------

    def _read_pod(self, core_v1: Any, namespace: str, name: str) -> Any | None:
        try:
            return core_v1.read_namespaced_pod(name, namespace)
        except Exception as error:
            if _is_not_found(error):
                return None
            raise

    def _read_pvc(self, core_v1: Any, namespace: str, name: str) -> Any | None:
        try:
            return core_v1.read_namespaced_persistent_volume_claim(name, namespace)
        except Exception as error:
            if _is_not_found(error):
                return None
            raise

    def _read_service(self, core_v1: Any, namespace: str, name: str) -> Any | None:
        try:
            return core_v1.read_namespaced_service(name, namespace)
        except Exception as error:
            if _is_not_found(error):
                return None
            raise

    def _delete_ignore_missing(self, fn: Any, name: str, namespace: str) -> None:
        try:
            fn(name, namespace)
        except Exception as error:
            if _is_not_found(error):
                return
            raise

    def _delete_best_effort(self, fn: Any, name: str, namespace: str) -> None:
        # Used only for cleanup after a failed create: the original error is
        # what the caller needs to see, so any error here (including a
        # non-404) is logged and swallowed rather than propagated.
        try:
            fn(name, namespace)
        except Exception:
            logger.warning("k8s best-effort cleanup delete failed name=%s", name, exc_info=True)

    # -- internals: lifecycle sync implementations -------------------------

    def _create_sandbox(self, metadata: dict[str, str] | None) -> SandboxHandle:
        # `metadata` is accepted for Protocol/E2B-parity but not yet attached
        # to the K8s objects (no annotation mapping specified for M2).
        del metadata
        core_v1 = _load_client()
        k8s = _load_client_module()
        namespace = self._namespace()
        name = f"{K8S_SANDBOX_NAME_PREFIX}{uuid.uuid4().hex[:12]}"
        labels = self._labels(name)
        logger.info("k8s sandbox create started name=%s namespace=%s", name, namespace)
        pvc_created = False
        pod_created = False
        try:
            core_v1.create_namespaced_persistent_volume_claim(
                namespace, self._build_pvc(k8s, name, labels)
            )
            pvc_created = True
            core_v1.create_namespaced_pod(namespace, self._build_pod(k8s, name, labels))
            pod_created = True
            core_v1.create_namespaced_service(namespace, self._build_service(k8s, name, labels))
        except Exception:
            # A partial create leaves an orphaned PVC/Pod with no id ever
            # returned to the caller to reconcile against, so best-effort
            # tear down whatever already landed before propagating -- a
            # failed cleanup delete must not mask the original error.
            logger.warning(
                "k8s sandbox create failed, cleaning up partial objects name=%s "
                "pvc_created=%s pod_created=%s",
                name,
                pvc_created,
                pod_created,
            )
            if pod_created:
                self._delete_best_effort(core_v1.delete_namespaced_pod, name, namespace)
            if pvc_created:
                self._delete_best_effort(
                    core_v1.delete_namespaced_persistent_volume_claim, name, namespace
                )
            raise
        logger.info("k8s sandbox create finished name=%s", name)
        return SandboxHandle(
            provider=self.kind,
            sandbox_id=name,
            template_version=self.template_version,
        )

    def _connect(self, sandbox_id: str, timeout_seconds: int | None) -> _K8sSandbox:
        core_v1 = _load_client()
        namespace = self._namespace()
        effective_timeout = (
            timeout_seconds if timeout_seconds is not None else K8S_DEFAULT_READY_TIMEOUT_SECONDS
        )
        deadline = time.monotonic() + effective_timeout
        while True:
            pod = self._read_pod(core_v1, namespace, sandbox_id)
            if pod is not None and _pod_ready(pod):
                return _K8sSandbox(name=sandbox_id, namespace=namespace)
            if time.monotonic() >= deadline:
                raise KubernetesUnavailableError(
                    f"Kubernetes sandbox {sandbox_id} did not become ready "
                    f"within {effective_timeout}s"
                )
            time.sleep(K8S_READY_POLL_INTERVAL_SECONDS)

    def _resume_sandbox(self, sandbox_id: str, timeout_seconds: int | None) -> _K8sSandbox:
        core_v1 = _load_client()
        k8s = _load_client_module()
        namespace = self._namespace()
        labels = self._labels(sandbox_id)
        if self._read_pod(core_v1, namespace, sandbox_id) is None:
            logger.info("k8s sandbox resume recreating pod name=%s", sandbox_id)
            core_v1.create_namespaced_pod(namespace, self._build_pod(k8s, sandbox_id, labels))
        if self._read_service(core_v1, namespace, sandbox_id) is None:
            core_v1.create_namespaced_service(
                namespace, self._build_service(k8s, sandbox_id, labels)
            )
        return self._connect(sandbox_id, timeout_seconds)

    def _state_from_pod(self, sandbox_id: str, pod: Any) -> ProviderSandboxState:
        status = getattr(pod, "status", None)
        phase = getattr(status, "phase", None) if status is not None else None
        started_at = getattr(status, "start_time", None) if status is not None else None
        return ProviderSandboxState(
            external_sandbox_id=sandbox_id,
            state=_map_phase_to_state(phase),
            started_at=started_at,
            end_at=None,
            observed_at=utcnow(),
            metadata={},
        )

    def _paused_state(self, sandbox_id: str) -> ProviderSandboxState:
        return ProviderSandboxState(
            external_sandbox_id=sandbox_id,
            state="paused",
            started_at=None,
            end_at=None,
            observed_at=utcnow(),
            metadata={},
        )

    def _get_sandbox_state(self, sandbox_id: str) -> ProviderSandboxState | None:
        core_v1 = _load_client()
        namespace = self._namespace()
        pod = self._read_pod(core_v1, namespace, sandbox_id)
        if pod is not None:
            return self._state_from_pod(sandbox_id, pod)
        if self._read_pvc(core_v1, namespace, sandbox_id) is not None:
            return self._paused_state(sandbox_id)
        return None

    def _list_sandbox_states(self) -> list[ProviderSandboxState]:
        core_v1 = _load_client()
        namespace = self._namespace()
        states: list[ProviderSandboxState] = []
        seen: set[str] = set()
        pods = core_v1.list_namespaced_pod(namespace, label_selector=K8S_SANDBOX_LABEL_KEY)
        for pod in getattr(pods, "items", None) or []:
            name = getattr(getattr(pod, "metadata", None), "name", None)
            if not name:
                continue
            seen.add(name)
            states.append(self._state_from_pod(name, pod))
        pvcs = core_v1.list_namespaced_persistent_volume_claim(
            namespace, label_selector=K8S_SANDBOX_LABEL_KEY
        )
        for pvc in getattr(pvcs, "items", None) or []:
            name = getattr(getattr(pvc, "metadata", None), "name", None)
            if not name or name in seen:
                continue
            states.append(self._paused_state(name))
        return states

    def _resolve_runtime_endpoint(self, sandbox: _K8sSandbox) -> RuntimeEndpoint:
        return RuntimeEndpoint(
            runtime_url=f"http://{sandbox.name}.{sandbox.namespace}.svc.cluster.local:{K8S_RUNTIME_PORT}"
        )

    def _resolve_runtime_context(self, sandbox: Any) -> SandboxRuntimeContext:
        del sandbox
        return SandboxRuntimeContext(
            home_dir=K8S_USER_HOME,
            runtime_workdir=K8S_RUNTIME_WORKDIR,
            runtime_binary_path=K8S_RUNTIME_BINARY_PATH,
            # CODEX_HOME / CLAUDE_CONFIG_DIR point each agent's config and
            # credential writes at the persisted PVC subPath mounts (see
            # _build_pod) instead of wherever they'd otherwise resolve under
            # HOME. codex honors CODEX_HOME directly. claude honors
            # CLAUDE_CONFIG_DIR for ~/.claude, but ~/.claude.json (the
            # account marker) lives OUTSIDE ~/.claude and is NOT relocated by
            # CLAUDE_CONFIG_DIR, so it is not persisted by this design -- the
            # subscription token itself (~/.claude/.credentials.json) is
            # persisted, which is what matters for `claude /login` surviving
            # pause/resume. Whether CLAUDE_CONFIG_DIR can be made to
            # consolidate .claude.json too is deferred; verify at e2e.
            base_env={
                "HOME": K8S_USER_HOME,
                "CODEX_HOME": K8S_CODEX_MOUNT_PATH,
                "CLAUDE_CONFIG_DIR": K8S_CLAUDE_MOUNT_PATH,
            },
        )

    def _pause_sandbox(self, sandbox_id: str) -> None:
        core_v1 = _load_client()
        namespace = self._namespace()
        self._delete_ignore_missing(core_v1.delete_namespaced_pod, sandbox_id, namespace)
        self._delete_ignore_missing(core_v1.delete_namespaced_service, sandbox_id, namespace)

    def _destroy_sandbox(self, sandbox_id: str) -> None:
        core_v1 = _load_client()
        namespace = self._namespace()
        self._delete_ignore_missing(core_v1.delete_namespaced_pod, sandbox_id, namespace)
        self._delete_ignore_missing(core_v1.delete_namespaced_service, sandbox_id, namespace)
        self._delete_ignore_missing(
            core_v1.delete_namespaced_persistent_volume_claim, sandbox_id, namespace
        )

    # -- internals: exec sync implementations -------------------------------

    def _exec_stream(self, sandbox: _K8sSandbox, argv: list[str]) -> Any:
        # `stdin` is always False: both `run_command` and `write_file` embed
        # their entire payload in `argv` rather than streaming it, because
        # the kubernetes WSClient has no stdin half-close -- EOF only
        # arrives when the whole socket closes -- so a command reading
        # stdin to EOF (e.g. `base64 -d`) would otherwise deadlock forever
        # waiting for a close that the drain loop is itself waiting to
        # trigger. See `_write_file` for the argv-embedding this enables.
        stream_fn = _load_stream()
        core_v1 = _load_client()
        return stream_fn(
            core_v1.connect_get_namespaced_pod_exec,
            sandbox.name,
            sandbox.namespace,
            command=argv,
            stderr=True,
            stdin=False,
            stdout=True,
            tty=False,
            _preload_content=False,
        )

    def _run_command(
        self,
        sandbox: _K8sSandbox,
        command: str,
        user: str | None,
        cwd: str | None,
        envs: dict[str, str] | None,
        background: bool,
        timeout_seconds: int | None,
    ) -> _CommandResult:
        # `timeout_seconds` bounds the drain loop below (defaults to
        # K8S_DEFAULT_COMMAND_TIMEOUT_SECONDS when unset): the sole caller
        # (see sandbox_exec.py) awaits `run_command` with no timeout of its
        # own, so an unbounded drain here would hang that awaiter -- and the
        # `to_thread` worker under it -- forever on a non-terminating
        # command.
        effective_timeout_seconds = (
            timeout_seconds if timeout_seconds is not None else K8S_DEFAULT_COMMAND_TIMEOUT_SECONDS
        )
        wrapped = _compose_shell_command(command, user=user, cwd=cwd, envs=envs)
        if background:
            wrapped = f"nohup {wrapped} >/dev/null 2>&1 &"
            resp = self._exec_stream(sandbox, ["/bin/sh", "-lc", wrapped])
            # Backgrounding detaches the job immediately; the outer shell's
            # own exit code/output is not meaningful to the caller (unused
            # upstream), so drain to let it finish but return a fixed,
            # trivially-successful result rather than propagate it.
            _drain_exec_stream(resp, timeout_seconds=effective_timeout_seconds)
            return _CommandResult(exit_code=0, stdout="", stderr="")
        resp = self._exec_stream(sandbox, ["/bin/sh", "-lc", wrapped])
        return _drain_exec_stream(resp, timeout_seconds=effective_timeout_seconds)

    def _write_file(self, sandbox: _K8sSandbox, path: str, content: bytes | str) -> None:
        # The base64 payload is embedded directly in the exec argv (no
        # stdin) -- see `_exec_stream` for why: a stdin-fed `base64 -d`
        # would block forever waiting for an EOF the WSClient transport
        # cannot deliver without closing the whole stream first.
        data = content.encode("utf-8") if isinstance(content, str) else content
        encoded = base64.b64encode(data).decode("ascii")
        if len(encoded) > _MAX_WRITE_FILE_BASE64_BYTES:
            raise KubernetesUnavailableError(
                f"Kubernetes file write to {path} is {len(encoded)} base64 bytes, "
                f"exceeding the {_MAX_WRITE_FILE_BASE64_BYTES}-byte argv-embedded limit"
            )
        quoted_path = shlex.quote(path)
        script = (
            f'mkdir -p "$(dirname {quoted_path})" && '
            f"printf %s {shlex.quote(encoded)} | base64 -d > {quoted_path}"
        )
        resp = self._exec_stream(sandbox, ["/bin/sh", "-c", script])
        result = _drain_exec_stream(resp, timeout_seconds=K8S_DEFAULT_COMMAND_TIMEOUT_SECONDS)
        if result.exit_code != 0:
            raise KubernetesUnavailableError(
                f"Kubernetes file write to {path} failed with exit code "
                f"{result.exit_code}: {result.stderr}"
            )
