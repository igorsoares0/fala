import "server-only";

/**
 * Structured JSON-line logs for the web app (spec §15.1), the same shape as the
 * worker's. Callers pass ids, counts and codes — never signed URLs, emails, object
 * keys or credentials; error text goes through `safeError`.
 */

type Fields = Record<string, string | number | boolean | null | undefined>;

function write(level: "info" | "warn" | "error", event: string, fields: Fields) {
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...fields });
  if (level === "info") console.info(line);
  else console.error(line);
}

export const log = {
  info: (event: string, fields: Fields = {}) => write("info", event, fields),
  warn: (event: string, fields: Fields = {}) => write("warn", event, fields),
  error: (event: string, fields: Fields = {}) => write("error", event, fields),
};

/** Error text safe to log: no URLs (which may be signed), no emails or object paths, bounded length. */
export function safeError(error: unknown): string {
  const raw = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return raw
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, "[url]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/users\/[^\s"']+/g, "[key]")
    .slice(0, 500);
}
