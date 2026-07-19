import { describe, expect, it } from "vitest";

import { resolveMobileNativeIntentPath } from "./mobile-native-intent-redirect";

describe("resolveMobileNativeIntentPath", () => {
  it("rewrites the plural custom-scheme workspace link to the singular file route", () => {
    expect(resolveMobileNativeIntentPath("proliferate://workspaces/ws1")).toBe("/workspace/ws1");
  });

  it("rewrites the singular workspace host used by the IA deep-link table", () => {
    expect(resolveMobileNativeIntentPath("proliferate://workspace/ws1?interaction=req-42")).toBe(
      "/workspace/ws1?interaction=req-42",
    );
  });

  it("carries sessionId and interaction through together", () => {
    expect(
      resolveMobileNativeIntentPath("proliferate://workspaces/ws1/sessions/sess-2?interaction=req-3"),
    ).toBe("/workspace/ws1?sessionId=sess-2&interaction=req-3");
  });

  it("rewrites the web universal-link form the same way", () => {
    expect(
      resolveMobileNativeIntentPath("https://proliferate.theitdept.au/cloud/workspaces/ws2?interaction=req-7"),
    ).toBe("/workspace/ws2?interaction=req-7");
  });

  it("rewrites the GitHub App callback to Settings with the source marker preserved", () => {
    expect(
      resolveMobileNativeIntentPath("proliferate://settings/environments?source=github_app_callback"),
    ).toBe("/settings?source=github_app_callback");
  });

  it("passes through an unrelated custom-scheme url unchanged (auth callback)", () => {
    const url = "proliferate://auth/callback?code=abc&state=xyz";
    expect(resolveMobileNativeIntentPath(url)).toBe(url);
  });

  it("passes through a plain https universal link that already matches a file route unchanged", () => {
    const url = "https://proliferate.theitdept.au/settings";
    expect(resolveMobileNativeIntentPath(url)).toBe(url);
  });

  it("passes through a malformed url unchanged rather than throwing", () => {
    expect(resolveMobileNativeIntentPath("not a url")).toBe("not a url");
  });
});
