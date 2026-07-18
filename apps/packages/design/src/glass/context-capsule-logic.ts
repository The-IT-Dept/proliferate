import { isDarkTheme, type GlassTokens } from "./tokens";

/**
 * Pure logic behind ContextCapsule (design-system.md §2.3, §3.2, §5). Kept
 * free of react-native imports — see resolve-glass-tier.ts for why — so it
 * stays directly unit-testable; ContextCapsule.tsx re-exports it.
 */

export type ContextCapsuleStatus = "running" | "awaiting" | "idle" | "errored";

/**
 * `owner/repo` -> `repo`, joined with the branch via the mono middle-dot
 * separator used throughout mockups.html ("repo · branch"). §5: any git/
 * shell-addressable string renders in SF Mono, no exceptions — the capsule
 * is the signature example.
 */
export function formatContextCapsule(repo: string, branch: string): string {
  const repoName = repo.includes("/") ? (repo.split("/").pop() ?? repo) : repo;
  return `${repoName} · ${branch}`;
}

// §2.2 semantic tones. GlassTokens intentionally only carries the glass
// layer's own neutral/tint palette (§ Task 1), not the full success/warning/
// danger vocabulary, so the success/attention/danger tones the status dot
// needs are resolved locally here, keyed to the theme the given GlassTokens
// was built for (via isDarkTheme).
const success = { dark: "#40C977", light: "#1FA85C" };
const attention = { dark: "#F2C94C", light: "#B8860B" };
const danger = { dark: "#FA423E", light: "#E0302C" };

/**
 * Maps a capsule status to its dot color. Status vocabulary here
 * (running/awaiting/idle/errored) is a condensed view of the §2.3 tone
 * table (single source of truth): running is the `live` tone (success
 * green, with the breathing animation driven separately in
 * ContextCapsule.tsx), awaiting the attention (warning) tone, errored the
 * danger tone, and idle falls back to secondary text.
 */
export function statusDotColor(status: ContextCapsuleStatus, tokens: GlassTokens): string {
  const dark = isDarkTheme(tokens);
  switch (status) {
    case "running":
      return dark ? success.dark : success.light;
    case "awaiting":
      return dark ? attention.dark : attention.light;
    case "errored":
      return dark ? danger.dark : danger.light;
    case "idle":
      return tokens.text.secondary;
  }
}
