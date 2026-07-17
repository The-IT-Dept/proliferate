# syntax=docker/dockerfile:1

# sandbox/Dockerfile
#
# In-cluster Kubernetes sandbox image: the pod a KubernetesSandboxProvider execs
# the AnyHarness runtime into. This is the in-cluster analog of the E2B
# template baked by scripts/build-template.mjs (buildTemplateDefinition()) and
# MUST stay in lockstep with that function for anything that affects runtime
# behaviour — apt packages, Node/Rust install, binary destinations/modes, and
# (most importantly) the agent-install runtime home. See sandbox/README.md.
#
# Build context: this Dockerfile is NOT built against the repo root. It expects
# four prebuilt files at the context root:
#   anyharness, proliferate-worker, proliferate-supervisor,
#   proliferate-git-credential-helper
# .github/workflows/sandbox-image.yml compiles the three Rust binaries and
# assembles that context before invoking `docker build`.
#
# The image is deliberately idle (CMD sleep infinity) — it must never start the
# runtime itself; the control-plane server execs anyharness serve into the
# running pod on port 8457.

FROM ubuntu:24.04

# Use bash with pipefail for every RUN below so a failed `curl | sh` install
# (e.g. rustup, nodesource) fails the build instead of silently succeeding on
# the downstream shell's exit code.
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# --- sandbox user: uid/gid 1000, home /home/user, login shell ---------------
# ubuntu:24.04 ships a default `ubuntu` user+group at uid/gid 1000; drop it
# first so groupadd/useradd below don't fail with "GID/UID 1000 already in
# use" (which, under the pipefail SHELL, would kill the build on the very
# first RUN after FROM).
RUN userdel -r ubuntu 2>/dev/null || true; groupdel ubuntu 2>/dev/null || true; \
    groupadd --gid 1000 user \
    && useradd --uid 1000 --gid 1000 --create-home --shell /bin/bash user

# --- base OS packages (matches buildTemplateDefinition() aptInstall) --------
RUN apt-get update \
    && apt-get install --no-install-recommends -y \
        bash \
        build-essential \
        ca-certificates \
        curl \
        git \
        libssl-dev \
        pkg-config \
        xz-utils \
    && rm -rf /var/lib/apt/lists/*

# --- Node 22 (nodesource) -----------------------------------------------------
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
RUN apt-get install --no-install-recommends -y nodejs \
    && rm -rf /var/lib/apt/lists/*
RUN rm -f /usr/local/bin/node /usr/local/bin/npm /usr/local/bin/npx \
    && ln -sf /usr/bin/node /usr/local/bin/node \
    && ln -sf /usr/bin/npm /usr/local/bin/npm \
    && ln -sf /usr/bin/npx /usr/local/bin/npx

# --- Rust (minimal rustup, installed as `user`) ------------------------------
USER user
RUN export HOME=/home/user && curl https://sh.rustup.rs -sSf | sh -s -- -y --profile minimal
USER root
RUN ln -sf /home/user/.cargo/bin/cargo /usr/local/bin/cargo \
    && ln -sf /home/user/.cargo/bin/rustc /usr/local/bin/rustc \
    && ln -sf /home/user/.cargo/bin/rustup /usr/local/bin/rustup

# --- prebuilt runtime binaries, from the build context root -----------------
RUN mkdir -p /home/user/.proliferate/bin
COPY --chmod=0755 anyharness /home/user/anyharness
COPY --chmod=0755 proliferate-worker /home/user/.proliferate/bin/proliferate-worker
COPY --chmod=0755 proliferate-supervisor /home/user/.proliferate/bin/proliferate-supervisor
COPY --chmod=0700 proliferate-git-credential-helper /home/user/.proliferate/bin/proliferate-git-credential-helper

RUN mkdir -p /home/user/workspace \
    && chown -R user:user /home/user

# --- sanity check: fails the build if a binary is the wrong arch ------------
USER user
RUN node --version \
    && npm --version \
    && cargo --version \
    && git --version \
    && /home/user/anyharness --version \
    && /home/user/.proliferate/bin/proliferate-worker --version \
    && /home/user/.proliferate/bin/proliferate-supervisor --version

# --- agent install ------------------------------------------------------------
# HOME must be exported in this SAME RUN: a bare `USER user` does not update
# $HOME, and the serving runtime resolves $HOME/.proliferate/anyharness at
# launch (see the comment above ANYHARNESS_RUNTIME_HOME in
# scripts/build-template.mjs). Installing to the wrong home leaves agents
# where the serving runtime never looks -> zero launchable agents.
RUN set -eu \
    && export HOME=/home/user \
    && /home/user/anyharness install-agents --runtime-home /home/user/.proliferate/anyharness --agent claude --agent codex

# --- cleanup: drop build caches and unused build-target sources -------------
RUN rm -rf /home/user/.cargo/git /home/user/.cargo/registry /home/user/.npm/_cacache \
    /home/user/.proliferate/anyharness/agents/codex/agent_process/source-build-target

USER user
WORKDIR /home/user/workspace
ENV HOME=/home/user

# Idle by design: the control-plane server execs the runtime into this pod
# (anyharness serve --require-bearer-auth --host 0.0.0.0 --port 8457). This
# image must never start it itself.
CMD ["sleep", "infinity"]
