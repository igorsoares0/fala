/**
 * How long stored files are kept (spec FR-16, §8.2). Exports can always be rendered
 * again; an original removed after long inactivity needs a new upload to export,
 * but its project and captions stay.
 */
export const EXPORT_RETENTION_DAYS = 30;
export const SOURCE_RETENTION_DAYS = 90;
/** The owner is emailed this many days before an original is removed. */
export const SOURCE_WARNING_DAYS = 7;

export const DAY_MS = 86_400_000;
