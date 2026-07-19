import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerMobilePushDevice, unregisterMobilePushDevice } from "./register";

describe("registerMobilePushDevice", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the bearer-authenticated {expoPushToken, platform} body and resolves true on success", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    const result = await registerMobilePushDevice({
      apiBaseUrl: "https://proliferate.theitdept.au",
      accessToken: "at-1",
      expoPushToken: "ExponentPushToken[abc]",
      platform: "ios",
    });

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://proliferate.theitdept.au/users/me/push-devices");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer at-1");
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      expoPushToken: "ExponentPushToken[abc]",
      platform: "ios",
    });
  });

  it("tolerates a 404 (routes not deployed yet) — resolves false, does not throw", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));

    await expect(
      registerMobilePushDevice({
        apiBaseUrl: "https://proliferate.theitdept.au",
        accessToken: "at-1",
        expoPushToken: "tok",
        platform: "ios",
      }),
    ).resolves.toBe(false);
  });

  it("tolerates a network failure — resolves false, does not throw or reject", async () => {
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));

    await expect(
      registerMobilePushDevice({
        apiBaseUrl: "https://proliferate.theitdept.au",
        accessToken: "at-1",
        expoPushToken: "tok",
        platform: "android",
      }),
    ).resolves.toBe(false);
  });
});

describe("unregisterMobilePushDevice", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("DELETEs the token endpoint with a bearer token and resolves true on success", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    const result = await unregisterMobilePushDevice({
      apiBaseUrl: "https://proliferate.theitdept.au",
      accessToken: "at-1",
      expoPushToken: "ExponentPushToken[abc]",
    });

    expect(result).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://proliferate.theitdept.au/users/me/push-devices/ExponentPushToken%5Babc%5D",
    );
    expect(init.method).toBe("DELETE");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer at-1");
  });

  it("tolerates a non-2xx response — resolves false, does not throw", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));

    await expect(
      unregisterMobilePushDevice({
        apiBaseUrl: "https://proliferate.theitdept.au",
        accessToken: "at-1",
        expoPushToken: "tok",
      }),
    ).resolves.toBe(false);
  });

  it("tolerates a network failure — resolves false, does not throw or reject", async () => {
    fetchMock.mockRejectedValue(new TypeError("Network request failed"));

    await expect(
      unregisterMobilePushDevice({
        apiBaseUrl: "https://proliferate.theitdept.au",
        accessToken: "at-1",
        expoPushToken: "tok",
      }),
    ).resolves.toBe(false);
  });
});
