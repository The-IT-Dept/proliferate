import { describe, expect, it } from "vitest";

import { mobileTelemetryScreenForPathname } from "./mobile-route-telemetry";

describe("mobileTelemetryScreenForPathname", () => {
  it("maps the Home tab's root path", () => {
    expect(mobileTelemetryScreenForPathname("/")).toBe("home");
  });

  it("maps the Workspaces tab", () => {
    expect(mobileTelemetryScreenForPathname("/workspaces")).toBe("work");
  });

  it("maps the Automations tab", () => {
    expect(mobileTelemetryScreenForPathname("/automations")).toBe("automations");
  });

  it("maps the Settings tab", () => {
    expect(mobileTelemetryScreenForPathname("/settings")).toBe("settings");
  });

  it("maps a pushed workspace route to chat", () => {
    expect(mobileTelemetryScreenForPathname("/workspace/ws1")).toBe("chat");
  });

  it("falls back to home for an unrecognized pathname", () => {
    expect(mobileTelemetryScreenForPathname("/something-else")).toBe("home");
  });
});
