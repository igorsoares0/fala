"use server";

import { frameSchema, projectIdSchema } from "@fala/shared";
import { requireUser } from "@/lib/dal";
import { saveFrame } from "@/lib/frame";
import type { ActionResult } from "@/lib/project-actions";

/** Saves the editor's frame. The client debounces and serializes calls; the latest state wins. */
export async function saveFrameAction(projectId: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const id = projectIdSchema.safeParse(projectId);
  const frame = frameSchema.safeParse(input);
  if (!id.success) return { ok: false, error: "This project doesn't exist anymore." };
  if (!frame.success) return { ok: false, error: "That format isn't valid." };

  const result = await saveFrame(user.id, id.data, frame.data);
  return result.ok ? { ok: true, data: undefined } : result;
}
