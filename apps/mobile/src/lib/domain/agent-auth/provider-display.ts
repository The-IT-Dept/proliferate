/** Ported verbatim from product-client web's `lib/domain/agents/provider-display.ts`. */
export const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  claude: "Claude",
  codex: "Codex",
  cursor: "Cursor",
  opencode: "OpenCode",
};

export function getProviderDisplayName(kind: string): string {
  return PROVIDER_DISPLAY_NAMES[kind] ?? kind;
}
