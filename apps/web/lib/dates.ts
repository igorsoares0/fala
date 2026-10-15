const DAY_MS = 24 * 60 * 60 * 1000;

const timeFormat = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** "today, 10:12" · "yesterday" · "Oct 12", relative to `now`. */
export function formatProjectDate(date: Date, now: Date = new Date()): string {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const time = date.getTime();
  if (time >= startOfToday) return `today, ${timeFormat.format(date)}`;
  if (time >= startOfToday - DAY_MS) return "yesterday";
  return dayFormat.format(date);
}

/** "today, 10:12" · "yesterday, 18:42" · "Oct 12": when an export finished. */
export function formatExportDate(date: Date, now: Date = new Date()): string {
  const label = formatProjectDate(date, now);
  return label === "yesterday" ? `yesterday, ${timeFormat.format(date)}` : label;
}
