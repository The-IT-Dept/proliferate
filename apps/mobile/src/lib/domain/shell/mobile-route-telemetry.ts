import type { MobileTelemetryScreen } from "../../integrations/telemetry/posthog";

/**
 * Maps the current Expo Router pathname to the same screen-telemetry
 * vocabulary the app used before the Expo Router migration
 * (`MobileTelemetryScreen`: "home" | "work" | "automations" | "settings" |
 * "chat"). Pure so it's unit-testable without mounting the router.
 *
 * Route shape (see `app/`): the 4 tabs live at "/", "/workspaces",
 * "/automations", "/settings" ((tabs) is an Expo Router group, invisible in
 * the URL); the pushed workspace shell lives at "/workspace/{id}".
 */
export function mobileTelemetryScreenForPathname(pathname: string): MobileTelemetryScreen {
  if (pathname.startsWith("/workspace/")) {
    return "chat";
  }
  if (pathname.startsWith("/workspaces")) {
    return "work";
  }
  if (pathname.startsWith("/automations")) {
    return "automations";
  }
  if (pathname.startsWith("/settings")) {
    return "settings";
  }
  return "home";
}
