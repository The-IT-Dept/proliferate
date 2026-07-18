"""Kubernetes sandbox constants.

Fixed runtime contract shared with the E2B provider (parity with the
`proliferate-sandbox` image): HOME, workdir, runtime binary path, and the
runtime port the Worker/anyharness stack listens on. See
`proliferate.constants.sandbox.e2b` for the E2B-side equivalents these must
stay aligned with.
"""

# Runtime contract (E2B parity).
K8S_RUNTIME_PORT = 8457
K8S_USER_HOME = "/home/user"
K8S_RUNTIME_WORKDIR = "/home/user/workspace"
K8S_RUNTIME_BINARY_PATH = "/home/user/anyharness"

# Opaque template/version marker recorded on the SandboxHandle. Unlike E2B
# (which names a published template), a K8s sandbox's "template" is just the
# pod image; this constant is a static, human-readable tag for that image
# generation. It is not read from config -- bumping the sandbox image build
# is what should bump it.
K8S_TEMPLATE_VERSION = "k8s-v1"

# Object naming / labeling. Pod, PVC, and Service for one sandbox all share
# this name; the label is applied to the Pod and the PVC so both can be
# listed by it (list_sandbox_states) and so a PVC without a matching Pod can
# be recognized as a paused sandbox.
K8S_SANDBOX_NAME_PREFIX = "sbx-"
K8S_SANDBOX_LABEL_KEY = "proliferate.io/sandbox"
K8S_APP_LABEL_KEY = "app"

# Pod internals.
K8S_CONTAINER_NAME = "sandbox"
# Named "workspace" (not "home"): the PVC backs only /home/user/workspace,
# not the whole home directory -- see the mount_path comment in
# kubernetes.py::_build_pod for why.
K8S_WORKSPACE_VOLUME_NAME = "workspace"
K8S_RUN_AS_ID = 1000
K8S_DEFAULT_RUNTIME_USER = "user"

# Polling (connect_running_sandbox / resume_sandbox wait-for-Ready).
K8S_DEFAULT_READY_TIMEOUT_SECONDS = 120
K8S_READY_POLL_INTERVAL_SECONDS = 2.0

# Default bound on the exec drain loop (run_command / write_file) when the
# caller passes no `timeout_seconds`. E2B has no single per-command default
# (E2B_TIMEOUT_SECONDS in e2b.py bounds sandbox create/connect, not exec) so
# this is a standalone sane cap: without it, an exec whose remote command
# never terminates would otherwise block the `to_thread` worker forever,
# since the kubernetes WSClient only reports closed once the server ends the
# stream.
K8S_DEFAULT_COMMAND_TIMEOUT_SECONDS = 300
