const WEEKDAY_FORMATTER = new Intl.DateTimeFormat("en-US", { weekday: "long" });
const MONTH_FORMATTER = new Intl.DateTimeFormat("en-US", { month: "long" });

/**
 * The Home hero's date eyebrow (mockups.html frame A: "Friday 18 July") —
 * weekday, day-of-month, and month, deliberately without a year since the
 * eyebrow is a "today" marker rather than a date record.
 */
export function formatMobileHomeDateEyebrow(date: Date): string {
  return `${WEEKDAY_FORMATTER.format(date)} ${date.getDate()} ${MONTH_FORMATTER.format(date)}`;
}
