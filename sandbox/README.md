# Proliferate sandbox image

`ghcr.io/the-it-dept/proliferate-sandbox` is the container image a Kubernetes
pod runs as a Proliferate cloud sandbox: the in-cluster equivalent of the E2B
template that `scripts/build-template.mjs` bakes for the E2B provider. It
packages the same OS toolchain, the same three AnyHarness/worker/supervisor
binaries, and the same pre-installed agent set (`claude`, `codex`) at the same
fixed paths under `/home/user`, so the control-plane server can `exec` the
runtime into either provider's pod identically. The image itself stays idle
(`CMD ["sleep", "infinity"]`) — it never starts the runtime; the server execs
`anyharness serve` into the running pod.

`sandbox/Dockerfile` is built by `.github/workflows/sandbox-image.yml`, which
compiles `anyharness`, `proliferate-worker`, and `proliferate-supervisor` for
`x86_64-unknown-linux-musl`, assembles a build context with those binaries plus
`install/proliferate-git-credential-helper`, and pushes `:<version>` and
`:stable` tags on a `sandbox-v*` tag push or manual dispatch.

**This Dockerfile must stay in sync with `scripts/build-template.mjs`**
(`buildTemplateDefinition()`). Any change to that function's apt packages,
Node/Rust install, binary destinations/modes, or the agent-install command —
especially the `HOME=/home/user` export required before `install-agents` —
needs a matching change here, or the two sandbox providers will drift and one
of them will silently break.
