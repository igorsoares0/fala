"use server";

import { projectIdSchema, trimSchema } from "@fala/shared";
import { requireUser } from "@/lib/dal";
import type { ActionResult } from "@/lib/project-actions";
import { saveTrim } from "@/lib/trim";

/** Saves the editor's trim. The client debounces and serializes calls; the latest state wins. */
export async function saveTrimAction(projectId: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const id = projectIdSchema.safeParse(projectId);
  const trim = trimSchema.safeParse(input);
  if (!id.success) return { ok: false, error: "This project doesn't exist anymore." };
  if (!trim.success) return { ok: false, error: "That trim isn't valid." };

  const result = await saveTrim(user.id, id.data, trim.data);
  return result.ok ? { ok: true, data: undefined } : result;
}
