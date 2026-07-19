import { describe, expect, it } from "vitest";
import type { AuthLinkedProvider, AuthProviderAvailability } from "@proliferate/cloud-sdk";
import type { CloudSecretsResponse } from "@proliferate/cloud-sdk";

import {
  mobileGoogleAccountLabel,
  mobilePersonalSecretsSummary,
} from "./mobile-settings-presentation";

function linked(overrides: Partial<AuthLinkedProvider> = {}): AuthLinkedProvider {
  return { provider: "google", connected: true, ...overrides };
}

function availability(overrides: Partial<AuthProviderAvailability> = {}): AuthProviderAvailability {
  return { provider: "google", enabled: true, ...overrides };
}

// Verbatim vocabulary pinned against web's buildAccountProviderViews
// (apps/packages/product-client/src/lib/domain/auth/account-profile-presentation.ts).
describe("mobileGoogleAccountLabel", () => {
  it("shows the linked account's email when a Google account is connected", () => {
    expect(
      mobileGoogleAccountLabel(
        [linked({ provider: "google", connected: true, accountEmail: "nick@example.com" })],
        [availability()],
      ),
    ).toBe("nick@example.com");
  });

  it("falls back to accountId, then 'Connected', when no email is present", () => {
    expect(
      mobileGoogleAccountLabel(
        [linked({ provider: "google", connected: true, accountEmail: null, accountId: "gid-1" })],
        [availability()],
      ),
    ).toBe("gid-1");
    expect(
      mobileGoogleAccountLabel(
        [linked({ provider: "google", connected: true, accountEmail: null, accountId: null })],
        [availability()],
      ),
    ).toBe("Connected");
  });

  it("ignores a linked-provider entry for a different provider", () => {
    expect(
      mobileGoogleAccountLabel(
        [linked({ provider: "github", connected: true, accountEmail: "nick@example.com" })],
        [availability()],
      ),
    ).toBe("Not connected");
  });

  it("shows 'Not connected' when Google is available but not linked", () => {
    expect(mobileGoogleAccountLabel([], [availability({ enabled: true })])).toBe("Not connected");
  });

  it("shows 'Not configured in this environment' when Google sign-in is disabled server-side", () => {
    expect(mobileGoogleAccountLabel([], [availability({ enabled: false })])).toBe(
      "Not configured in this environment",
    );
  });

  it("treats absent provider-availability as available (defaults to 'Not connected')", () => {
    expect(mobileGoogleAccountLabel([], [])).toBe("Not connected");
  });
});

function secrets(overrides: Partial<CloudSecretsResponse> = {}): CloudSecretsResponse {
  return {
    scopeKind: "personal",
    version: 1,
    envVars: [],
    files: [],
    materialization: null,
    ...overrides,
  };
}

describe("mobilePersonalSecretsSummary", () => {
  it("is 'Loading' while the query is in flight and there's no cached data yet", () => {
    expect(mobilePersonalSecretsSummary(undefined, true, false)).toBe("Loading");
  });

  it("is 'Could not load secrets' on failure", () => {
    expect(mobilePersonalSecretsSummary(undefined, false, true)).toBe("Could not load secrets");
  });

  it("is 'No secrets configured' when both envVars and files are empty", () => {
    expect(mobilePersonalSecretsSummary(secrets(), false, false)).toBe("No secrets configured");
  });

  it("singularizes a count of exactly one", () => {
    expect(
      mobilePersonalSecretsSummary(
        secrets({ envVars: [{ id: "1", name: "API_KEY", byteSize: 10, updatedAt: "now" }] }),
        false,
        false,
      ),
    ).toBe("1 env var");
  });

  it("pluralizes counts and joins env vars + files", () => {
    expect(
      mobilePersonalSecretsSummary(
        secrets({
          envVars: [
            { id: "1", name: "API_KEY", byteSize: 10, updatedAt: "now" },
            { id: "2", name: "TOKEN", byteSize: 10, updatedAt: "now" },
          ],
          files: [{ id: "1", path: "id_rsa", byteSize: 100, updatedAt: "now" }],
        }),
        false,
        false,
      ),
    ).toBe("2 env vars · 1 file");
  });
});
