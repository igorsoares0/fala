/**
 * Pending markers: a content value that still needs input from Igor is written as
 * `TODO(igor): <what is needed>`. Any page holding one is built as noindex and left out
 * of the sitemap; `npm run pseo:pending` lists them all.
 */

export const PENDING_PREFIX = "TODO(igor):";

/**
 * Pending markers are shown on the page in development, to make review easy. In production
 * builds they are hidden: a missing image or section renders nothing, a missing value a dash.
 */
export const SHOW_PENDING = process.env.NODE_ENV !== "production";

export function isPending(value: unknown): boolean {
  return typeof value === "string" && value.trimStart().startsWith(PENDING_PREFIX);
}

/** What the marker asks for, without the prefix. */
export function pendingNote(value: string): string {
  return value.trimStart().slice(PENDING_PREFIX.length).trim();
}

export type PendingMarker = { field: string; note: string };

/** Every pending marker inside a content value, with the dotted path of its field. */
export function findPending(value: unknown, path: string[] = []): PendingMarker[] {
  if (typeof value === "string") {
    return value.includes(PENDING_PREFIX) ? [{ field: path.join("."), note: pendingNote(value.slice(value.indexOf(PENDING_PREFIX))) }] : [];
  }
  if (Array.isArray(value)) return value.flatMap((item, index) => findPending(item, [...path, String(index)]));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => findPending(item, [...path, key]));
  }
  return [];
}
