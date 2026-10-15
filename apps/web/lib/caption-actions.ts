"use server";

import { z } from "zod";
import { projectIdSchema } from "@fala/shared";
import { saveCaptions, type SaveCaptionsResult } from "@/lib/captions";
import { requireUser } from "@/lib/dal";

const inputSchema = z.object({
  baseVersion: z.int().min(1),
  words: z.array(z.unknown()),
  blocks: z.array(z.unknown()),
});

/** Autosave target for the editor's captions. The client serializes calls and handles conflicts. */
export async function saveCaptionsAction(projectId: string, input: unknown): Promise<SaveCaptionsResult> {
  const user = await requireUser();
  const id = projectIdSchema.safeParse(projectId);
  const body = inputSchema.safeParse(input);
  if (!id.success || !body.success) return { ok: false, conflict: false, error: "These captions aren't valid." };
  // Deep validation (schema, duration, size) happens in saveCaptions.
  return saveCaptions(user.id, id.data, body.data as Parameters<typeof saveCaptions>[2]);
}
