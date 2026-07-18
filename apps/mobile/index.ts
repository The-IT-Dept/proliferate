import { registerRootComponent } from "expo";

import { getMobileTelemetryConfig } from "./src/lib/integrations/telemetry/config";
import { initializeMobilePostHog } from "./src/lib/integrations/telemetry/posthog";
import App from "./src/App";

const telemetryConfig = getMobileTelemetryConfig();
initializeMobilePostHog({
  environment: telemetryConfig.environment,
  release: telemetryConfig.release,
  posthog: telemetryConfig.posthog,
});

registerRootComponent(App);
