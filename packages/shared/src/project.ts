import { z } from "zod";

/** Project lifecycle states (spec §6.1). Job state is tracked separately. */
export const PROJECT_STATUSES = [
  "CREATED",
  "UPLOADING",
  "UPLOADED",
  "PROCESSING",
  "READY",
  "RENDERING",
  "COMPLETED",
  "FAILED",
  "DELETION_PENDING",
  "DELETED",
] as const;

export const projectStatusSchema = z.enum(PROJECT_STATUSES);

export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const PROJECT_NAME_MAX_LENGTH = 120;

export const projectNameSchema = z
  .string()
  .transform((value) => value.replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(1, "Give the project a name.")
      .max(PROJECT_NAME_MAX_LENGTH, `Keep it under ${PROJECT_NAME_MAX_LENGTH} characters.`),
  );

export const projectIdSchema = z.string().min(1).max(64);

const FALLBACK_PROJECT_NAME = "Untitled video";

/**
 * Derives a readable project name from an uploaded file name:
 * strips any directory and the extension, turns separators into spaces
 * and collapses whitespace. The file name is untrusted user input; the
 * result is only ever used as display text.
 */
export function defaultProjectName(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const withoutExtension = base.replace(/\.[^.]{1,8}$/, "");
  const cleaned = withoutExtension
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PROJECT_NAME_MAX_LENGTH)
    .trim();
  return cleaned.length > 0 ? cleaned : FALLBACK_PROJECT_NAME;
}
