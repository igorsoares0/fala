"use server";

import { z } from "zod";
import { db } from "@fala/db";
import { requireUser } from "@/lib/dal";

/** "Email me when an export finishes" (Account → Preferences). */
export async function setEmailOnExportAction(enabled: unknown): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const value = z.boolean().safeParse(enabled);
  if (!value.success) return { ok: false };
  await db.user.update({ where: { id: user.id }, data: { emailOnExport: value.data } });
  return { ok: true };
}
