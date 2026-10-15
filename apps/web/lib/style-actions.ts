"use server";

import { projectIdSchema, projectStyleInputSchema } from "@fala/shared";
import { requireUser } from "@/lib/dal";
import type { ActionResult } from "@/lib/project-actions";
import { saveProjectStyle } from "@/lib/style";

/** Saves the editor's style. The client debounces and serializes calls; the latest state wins. */
export async function saveProjectStyleAction(projectId: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const id = projectIdSchema.safeParse(projectId);
  const style = projectStyleInputSchema.safeParse(input);
  if (!id.success) return { ok: false, error: "This project doesn't exist anymore." };
  if (!style.success) return { ok: false, error: "That style isn't valid." };

  const result = await saveProjectStyle(user.id, id.data, style.data);
  return result.ok ? { ok: true, data: undefined } : result;
}
