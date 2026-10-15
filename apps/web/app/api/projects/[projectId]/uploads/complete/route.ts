import { NextResponse } from "next/server";
import { projectIdSchema } from "@fala/shared";
import { jsonError, withUser } from "@/lib/api";
import { completeUpload } from "@/lib/uploads";

/** POST → the browser finished its PUT; verify the object and queue validation. */
export async function POST(_request: Request, ctx: RouteContext<"/api/projects/[projectId]/uploads/complete">) {
  return withUser(async (user) => {
    const projectId = projectIdSchema.safeParse((await ctx.params).projectId);
    if (!projectId.success) return jsonError(404, "This project doesn't exist anymore.");

    const result = await completeUpload(user.id, projectId.data);
    if (!result.ok) return jsonError(result.status, result.error);
    return NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
  });
}
