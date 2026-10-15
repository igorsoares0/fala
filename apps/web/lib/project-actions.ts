"use server";

import { refresh } from "next/cache";
import { defaultProjectName, projectIdSchema, projectNameSchema } from "@fala/shared";
import { requireUser } from "@/lib/dal";
import { createProject, deleteProject, renameProject } from "@/lib/projects";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** Creates a project named after the chosen file. The upload itself arrives in Phase 2. */
export async function createProjectAction(fileName: string): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const name = projectNameSchema.parse(defaultProjectName(String(fileName)));
  const project = await createProject(user.id, name);
  refresh();
  return { ok: true, data: { id: project.id } };
}

export async function renameProjectAction(projectId: string, name: string): Promise<ActionResult> {
  const user = await requireUser();
  const id = projectIdSchema.safeParse(projectId);
  const parsedName = projectNameSchema.safeParse(name);
  if (!id.success) return { ok: false, error: "This project doesn't exist anymore." };
  if (!parsedName.success) return { ok: false, error: parsedName.error.issues[0].message };

  const renamed = await renameProject(user.id, id.data, parsedName.data);
  if (!renamed) return { ok: false, error: "This project doesn't exist anymore." };
  refresh();
  return { ok: true, data: undefined };
}

export async function deleteProjectAction(projectId: string): Promise<ActionResult> {
  const user = await requireUser();
  const id = projectIdSchema.safeParse(projectId);
  if (!id.success) return { ok: false, error: "This project doesn't exist anymore." };

  const deleted = await deleteProject(user.id, id.data);
  if (!deleted) return { ok: false, error: "This project doesn't exist anymore." };
  refresh();
  return { ok: true, data: undefined };
}
