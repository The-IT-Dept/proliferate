import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowRoot = new URL("../../.github/workflows/", import.meta.url);

async function workflow(name) {
  return readFile(new URL(name, workflowRoot), "utf8");
}

// The desktop release/title-propagation cases were removed with the desktop app
// (they read release-desktop.yml / _deploy-desktop.yml / apps/desktop/**, all
// deleted). The runtime build-stamping assertion is unrelated to desktop and
// stays.

test("runtime production builds stamp both version and deterministic source SHA", async () => {
  const source = await workflow("release-runtime.yml");
  const resolveStep = source.slice(
    source.indexOf("- name: Resolve build version"),
    source.indexOf("- name: Install musl-tools"),
  );

  assert.match(resolveStep, /PROLIFERATE_BUILD_VERSION=/);
  assert.match(resolveStep, /PROLIFERATE_BUILD_SHA=\$\(git rev-parse HEAD\)/);

  const crossConfig = await readFile(new URL("../../Cross.toml", import.meta.url), "utf8");
  assert.match(
    crossConfig,
    /passthrough\s*=\s*\[[^\]]*"PROLIFERATE_BUILD_VERSION"[^\]]*"PROLIFERATE_BUILD_SHA"[^\]]*\]/,
  );
});
