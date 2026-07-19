import { describe, expect, it } from "vitest";

import packageJson from "../../../../package.json" with { type: "json" };
import { MOBILE_APP_VERSION } from "./mobile-app-version";

// Drift guard (Group J, Part 2.4): MOBILE_APP_VERSION is a hand-maintained
// constant (see its doc comment for why — no expo-constants dependency yet)
// that must be kept in sync with apps/mobile/package.json's "version" (and,
// by that file's own contract, app.config.js's `version`). Without this
// test a bump to one could silently drift from the other — exactly what
// happened before (the footer previously hardcoded a stale "0.1.0").
describe("MOBILE_APP_VERSION", () => {
  it("matches apps/mobile/package.json's version", () => {
    expect(MOBILE_APP_VERSION).toBe(packageJson.version);
  });
});
