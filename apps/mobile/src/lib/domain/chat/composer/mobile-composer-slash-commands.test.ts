import { describe, expect, it } from "vitest";
import {
  filterMobileRunnableSessionSlashCommands,
  matchMobileSlashCommandQuery,
  normalizeMobileSlashCommandName,
} from "./mobile-composer-slash-commands";

// Ported verbatim from product-client's still-live
// `session-slash-command-policy.test.ts` — same allow/hide policy, same
// query-matching behavior. The command list itself is NOT static (see the
// module doc): these commands are the live agent session's own
// `available_commands_update` ACP payload (`AvailableSessionCommand[]` on
// `TranscriptState`), so this test constructs fixture payloads shaped like
// what a real Claude Code / Codex session reports rather than asserting a
// hardcoded catalog.
describe("normalizeMobileSlashCommandName", () => {
  it("normalizes command names without the slash prefix", () => {
    expect(normalizeMobileSlashCommandName("/review-branch")).toBe("review-branch");
    expect(normalizeMobileSlashCommandName("compact")).toBe("compact");
    expect(normalizeMobileSlashCommandName("/bad command")).toBeNull();
  });
});

describe("filterMobileRunnableSessionSlashCommands", () => {
  it("keeps safe native and custom commands while hiding native CLI-only commands", () => {
    const commands = filterMobileRunnableSessionSlashCommands([
      { name: "/login", description: "Sign in" },
      { name: "/bprocs", description: "Open background processes" },
      { name: "/init", description: "Create project instructions" },
      { name: "/config", description: "Open config" },
      { name: "/ship", description: "Custom project prompt", input: { hint: "scope" } },
      { name: "/mcp:server:prompt", description: "MCP prompt" },
      { name: "/review", description: "Review changes" },
      { name: "/review", description: "Duplicate review" },
    ]);

    expect(commands.map((command) => command.displayName)).toEqual([
      "/init",
      "/ship",
      "/mcp:server:prompt",
      "/review",
    ]);
    expect(commands.find((command) => command.name === "ship")?.inputHint).toBe("scope");
  });

  it("hides terminal/vim/CLI-workflow commands that don't apply on mobile", () => {
    const commands = filterMobileRunnableSessionSlashCommands([
      { name: "/terminal", description: "Open a terminal" },
      { name: "/vim", description: "Toggle vim mode" },
      { name: "/exit", description: "Exit" },
    ]);
    expect(commands).toEqual([]);
  });

  it("groups MCP prompt commands separately from ordinary commands", () => {
    const commands = filterMobileRunnableSessionSlashCommands([
      { name: "/compact", description: "Compact context" },
      { name: "/mcp:linear:create-issue", description: "Create a Linear issue" },
    ]);
    expect(commands.map((command) => command.group)).toEqual(["Commands", "MCP"]);
  });

  it("ignores malformed command entries instead of throwing", () => {
    const commands = filterMobileRunnableSessionSlashCommands([
      null,
      { description: "missing name" },
      { name: "" },
      { name: "  " },
      { name: "/compact", description: "Compact context" },
    ]);
    expect(commands).toEqual([
      {
        id: "compact",
        name: "compact",
        displayName: "/compact",
        description: "Compact context",
        inputHint: null,
        group: "Commands",
      },
    ]);
  });
});

describe("matchMobileSlashCommandQuery", () => {
  it("matches names, descriptions, and input hints", () => {
    const [command] = filterMobileRunnableSessionSlashCommands([
      { name: "/ship", description: "Prepare a release", input: { hint: "target branch" } },
    ]);

    expect(command).toBeDefined();
    expect(matchMobileSlashCommandQuery(command!, "shi")).toBe(true);
    expect(matchMobileSlashCommandQuery(command!, "release")).toBe(true);
    expect(matchMobileSlashCommandQuery(command!, "branch")).toBe(true);
    expect(matchMobileSlashCommandQuery(command!, "login")).toBe(false);
  });

  it("matches everything for an empty query", () => {
    const [command] = filterMobileRunnableSessionSlashCommands([
      { name: "/compact", description: "Compact context" },
    ]);
    expect(matchMobileSlashCommandQuery(command!, "")).toBe(true);
    expect(matchMobileSlashCommandQuery(command!, "   ")).toBe(true);
  });
});
