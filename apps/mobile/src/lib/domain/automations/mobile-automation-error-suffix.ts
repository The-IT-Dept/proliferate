/**
 * Shared toast-message suffix for automation action failures (pause/resume/
 * run-now), used by both MobileAutomationsScreen and
 * MobileAutomationDetailScreen — was duplicated verbatim in each file
 * (Group J dedup).
 */
export function mobileAutomationErrorSuffix(error: unknown): string {
  return error instanceof Error && error.message ? `: ${error.message}` : ".";
}
