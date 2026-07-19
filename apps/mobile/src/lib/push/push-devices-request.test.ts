import { describe, expect, it } from "vitest";

import {
  buildRegisterPushDeviceBody,
  pushDeviceRegisterUrl,
  pushDeviceUnregisterUrl,
} from "./push-devices-request";

describe("pushDeviceRegisterUrl", () => {
  it("builds the POST /users/me/push-devices endpoint under the given API base URL", () => {
    expect(pushDeviceRegisterUrl("https://proliferate.theitdept.au")).toBe(
      "https://proliferate.theitdept.au/users/me/push-devices",
    );
  });

  it("trims a trailing slash on the base URL", () => {
    expect(pushDeviceRegisterUrl("https://proliferate.theitdept.au/")).toBe(
      "https://proliferate.theitdept.au/users/me/push-devices",
    );
  });
});

describe("pushDeviceUnregisterUrl", () => {
  it("builds the DELETE /users/me/push-devices/{expoPushToken} endpoint", () => {
    expect(pushDeviceUnregisterUrl("https://proliferate.theitdept.au", "abc123")).toBe(
      "https://proliferate.theitdept.au/users/me/push-devices/abc123",
    );
  });

  it("percent-encodes an Expo push token containing brackets and colons", () => {
    expect(
      pushDeviceUnregisterUrl(
        "https://proliferate.theitdept.au",
        "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
      ),
    ).toBe(
      "https://proliferate.theitdept.au/users/me/push-devices/ExponentPushToken%5Bxxxxxxxxxxxxxxxxxxxxxx%5D",
    );
  });

  it("trims a trailing slash on the base URL", () => {
    expect(pushDeviceUnregisterUrl("https://proliferate.theitdept.au/", "tok")).toBe(
      "https://proliferate.theitdept.au/users/me/push-devices/tok",
    );
  });
});

describe("buildRegisterPushDeviceBody", () => {
  it("builds exactly the {expoPushToken, platform} shape the server's extra=forbid model requires", () => {
    expect(buildRegisterPushDeviceBody("ExponentPushToken[abc]", "ios")).toEqual({
      expoPushToken: "ExponentPushToken[abc]",
      platform: "ios",
    });
  });

  it("carries android through unchanged", () => {
    expect(buildRegisterPushDeviceBody("tok", "android")).toEqual({
      expoPushToken: "tok",
      platform: "android",
    });
  });
});
