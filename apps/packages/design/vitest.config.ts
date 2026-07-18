import { defineConfig } from "vitest/config";

/**
 * Node-environment vitest for the design package's pure, DOM/RN-free logic
 * modules (glass tokens, capability tier resolution, backing selection,
 * status-dot/capsule formatting). This repo has no RN-render test infra —
 * component files (.tsx) are exercised only through the pure functions they
 * delegate to; visual behavior is checked manually against mockups.html.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
