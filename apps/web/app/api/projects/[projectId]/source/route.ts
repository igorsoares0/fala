import { NextResponse } from "next/server";
import { projectIdSchema } from "@fala/shared";
import { jsonError, withUser } from "@/lib/api";
import { getSourceUrl } from "@/lib/uploads";

/** GET → redirect to a signed URL of the project's video, for the editor's player. */
export async function GET(_request: Request, ctx: RouteContext<"/api/projects/[projectId]/source">) {
  return withUser(async (user) => {
    const projectId = projectIdSchema.safeParse((await ctx.params).projectId);
    const url = projectId.success ? await getSourceUrl(user.id, projectId.data) : null;
    if (!url) return jsonError(404, "No video.");
    // Not cached: the player re-requests it on reload and gets a fresh signature.
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, no-store" } });
  });
}
