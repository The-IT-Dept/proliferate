import { describe, expect, it } from "vitest";
import { formatContextCapsule, statusDotColor } from "./context-capsule-logic";
import { glassTokens } from "./tokens";

const dark = glassTokens("dark");
const light = glassTokens("light");

describe("formatContextCapsule", () => {
  it("drops the owner and joins repo · branch in SF Mono form", () => {
    expect(formatContextCapsule("The-IT-Dept/gstack", "main")).toBe("gstack · main");
  });

  it("passes through an owner-less repo name unchanged", () => {
    expect(formatContextCapsule("gstack", "feat/glass")).toBe("gstack · feat/glass");
  });
});

describe("statusDotColor", () => {
  it("colors running as the live tone (success green, §2.3) with a breathing dot, not the busy tint", () => {
    expect(statusDotColor("running", dark)).toBe("#40C977");
    expect(statusDotColor("running", light)).toBe("#1FA85C");
    expect(statusDotColor("running", dark)).not.toBe(dark.tint);
  });

  it("colors awaiting as the attention (warning) color", () => {
    expect(statusDotColor("awaiting", dark)).toBe("#F2C94C");
    expect(statusDotColor("awaiting", light)).toBe("#B8860B");
  });

  it("colors errored as the danger (red) color", () => {
    expect(statusDotColor("errored", dark)).toBe("#FA423E");
    expect(statusDotColor("errored", light)).toBe("#E0302C");
  });

  it("colors idle as secondary text", () => {
    expect(statusDotColor("idle", dark)).toBe(dark.text.secondary);
  });
});
