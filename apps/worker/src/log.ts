/**
 * Structured JSON-line logs (spec §15.1). Callers pass ids, counts and codes only —
 * never signed URLs, object keys, credentials or user file names.
 */

type Fields = Record<string, string | number | boolean | null | undefined>;

function write(level: "info" | "warn" | "error", event: string, fields: Fields) {
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...fields });
  if (level === "info") process.stdout.write(`${line}\n`);
  else process.stderr.write(`${line}\n`);
}

export const log = {
  info: (event: string, fields: Fields = {}) => write("info", event, fields),
  warn: (event: string, fields: Fields = {}) => write("warn", event, fields),
  error: (event: string, fields: Fields = {}) => write("error", event, fields),
};

const MAX_MESSAGE_LENGTH = 500;

/** Error text safe to persist and log: no URLs (which may be signed), no object paths, bounded length. */
export function sanitizeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return raw
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, "[url]")
    .replace(/users\/[^\s"']+/g, "[key]")
    .slice(0, MAX_MESSAGE_LENGTH);
}
