/**
 * Row 23 — the slash-command list source and filter policy.
 *
 * THE COMMAND LIST IS NOT STATIC. There is no hardcoded catalog of command
 * names/descriptions anywhere in this codebase or web's — ACP tells the
 * runtime which commands the connected agent (Claude Code, Codex, OpenCode,
 * ...) knows about via an `available_commands_update` event
 * (`anyharness/sdk/src/types/events.ts`'s `AvailableCommandsUpdateEvent`),
 * which the SDK reducer folds into `TranscriptState.availableCommands`
 * (`anyharness/sdk/src/reducer/transcript.ts`, case
 * `"available_commands_update"` -> `normalizeAvailableSessionCommands`).
 * Mobile already streams that same reducer state via
 * `useSessionTranscriptStream`/`useMobileChatData` (`stream.transcript`,
 * exposed as `transcript` — Group E1); this module only needs
 * `transcript.availableCommands: AvailableSessionCommand[]` threaded down to
 * the composer, same shape as web's `useRunnableSlashCommands`'s
 * `transcript?.availableCommands` (`use-active-session-transcript-state`).
 *
 * What IS static is the *safety policy* — which of the agent's own reported
 * commands a native client should actually let a user run vs. hide (CLI-only
 * things like `/vim`, `/terminal`, `/login`, `/config` don't apply outside a
 * terminal harness). That allow/hide policy is ported verbatim from
 * product-client's still-live `session-slash-command-policy.ts`
 * (`DESKTOP_SESSION_SLASH_COMMAND_POLICY_VERSION`) since `product-client`
 * isn't a mobile dependency (it's an app, not a published workspace
 * package — see `mobile-chat-composer-state.ts` for the established mirror
 * pattern this follows). The hidden-command reasoning is identical on
 * mobile: none of `/terminal`, `/vim`, `/mcp`, `/permissions`, etc. have a
 * mobile UI to open, arguably even more so than on desktop.
 */

export const MOBILE_SESSION_SLASH_COMMAND_POLICY_VERSION = 1;

const MOBILE_SAFE_NATIVE_COMMAND_NAMES = new Set([
  "compact",
  "init",
  "review",
  "review-branch",
  "review-commit",
]);

const MOBILE_HIDDEN_NATIVE_COMMAND_NAMES = new Set([
  "add-dir",
  "agents",
  "approvals",
  "auth",
  "bproc",
  "bprocs",
  "background",
  "background-processes",
  "browser",
  "bug",
  "clear",
  "config",
  "context",
  "cost",
  "default",
  "diff",
  "doctor",
  "exit",
  "extra-usage",
  "help",
  "heapdump",
  "history",
  "hooks",
  "ide",
  "keybindings-help",
  "login",
  "logout",
  "mcp",
  "memory",
  "migrate-installer",
  "model",
  "new",
  "output-style",
  "permissions",
  "plan",
  "pr_comments",
  "processes",
  "prompts",
  "quit",
  "release-notes",
  "resume",
  "status",
  "terminal",
  "terminal-setup",
  "terminals",
  "todos",
  "undo",
  "vim",
]);

const MOBILE_HIDDEN_NATIVE_COMMAND_PREFIXES = [
  "config:",
  "model:",
  "output-style:",
  "permissions:",
  "terminal:",
];

export type MobileSlashCommandGroup = "Commands" | "MCP";

export interface MobileSlashCommandViewModel {
  id: string;
  name: string;
  displayName: string;
  description: string;
  inputHint: string | null;
  group: MobileSlashCommandGroup;
}

export function filterMobileRunnableSessionSlashCommands(
  commands: readonly unknown[],
): MobileSlashCommandViewModel[] {
  const seenNames = new Set<string>();
  const items: MobileSlashCommandViewModel[] = [];

  for (const command of commands) {
    const normalized = normalizeAvailableSessionSlashCommand(command);
    if (!normalized) {
      continue;
    }

    if (!isMobileRunnableSessionSlashCommandName(normalized.name)) {
      continue;
    }

    const lookupName = slashCommandLookupName(normalized.name);
    if (seenNames.has(lookupName)) {
      continue;
    }
    seenNames.add(lookupName);
    items.push(normalized);
  }

  return items;
}

export function matchMobileSlashCommandQuery(
  command: MobileSlashCommandViewModel,
  query: string,
): boolean {
  const normalizedQuery = normalizeMobileSlashCommandQuery(query);
  if (!normalizedQuery) {
    return true;
  }

  return [
    command.name,
    command.description,
    command.inputHint ?? "",
  ].some((value) => value.toLowerCase().includes(normalizedQuery));
}

export function normalizeMobileSlashCommandQuery(query: string): string {
  return query.trim().replace(/^\/+/u, "").toLowerCase();
}

export function normalizeMobileSlashCommandName(name: string): string | null {
  const normalized = name.trim().replace(/^\/+/u, "");
  if (!normalized || /\s/u.test(normalized)) {
    return null;
  }
  return normalized;
}

function normalizeAvailableSessionSlashCommand(
  command: unknown,
): MobileSlashCommandViewModel | null {
  if (!isRecord(command) || typeof command.name !== "string") {
    return null;
  }

  const name = normalizeMobileSlashCommandName(command.name);
  if (!name) {
    return null;
  }

  const description = typeof command.description === "string"
    ? command.description
    : "";
  const inputHint = isRecord(command.input) && typeof command.input.hint === "string"
    ? command.input.hint
    : null;

  return {
    id: slashCommandLookupName(name),
    name,
    displayName: `/${name}`,
    description,
    inputHint,
    group: slashCommandGroup(name),
  };
}

function isMobileRunnableSessionSlashCommandName(name: string): boolean {
  const lookupName = slashCommandLookupName(name);
  if (isMcpPromptCommand(lookupName)) {
    return true;
  }
  if (MOBILE_SAFE_NATIVE_COMMAND_NAMES.has(lookupName)) {
    return true;
  }
  if (MOBILE_HIDDEN_NATIVE_COMMAND_NAMES.has(lookupName)) {
    return false;
  }
  return !MOBILE_HIDDEN_NATIVE_COMMAND_PREFIXES.some((prefix) => lookupName.startsWith(prefix));
}

function slashCommandGroup(name: string): MobileSlashCommandGroup {
  return isMcpPromptCommand(slashCommandLookupName(name)) ? "MCP" : "Commands";
}

function isMcpPromptCommand(lookupName: string): boolean {
  return lookupName.startsWith("mcp:");
}

function slashCommandLookupName(name: string): string {
  return name.toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
