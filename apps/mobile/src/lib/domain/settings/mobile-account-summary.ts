import type { AuthUser } from "@proliferate/cloud-sdk";

/**
 * Relocated from `mobile-shell-navigation.ts` (deleted with the rest of the
 * custom nav) verbatim, including `initialsForName`'s single-word fallback
 * (first 2 characters) - deliberately distinct from
 * `mobile-settings-presentation.ts`'s `initialsForMobileSettingsName`
 * (first character of up to 2 words), which has different single-word
 * behavior and predates this file.
 */
export interface MobileAccountSummary {
  initials: string;
  name: string;
  handle: string;
}

export function buildMobileAccountSummary(user: AuthUser | null): MobileAccountSummary {
  const displayName = user?.display_name?.trim();
  const email = user?.email?.trim();
  const fallbackName = email?.split("@")[0] || "Proliferate";
  const name = displayName || fallbackName;
  return {
    initials: initialsForName(name),
    name,
    handle: email || "Signed in",
  };
}

function initialsForName(name: string): string {
  const parts = name
    .split(/\s+/u)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return (parts[0]?.slice(0, 2) || "P").toUpperCase();
}
