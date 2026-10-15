import { NextResponse } from "next/server";
import { projectIdSchema } from "@fala/shared";
import { jsonError, withUser } from "@/lib/api";
import { getThumbnailUrl, THUMBNAIL_URL_TTL_SECONDS } from "@/lib/uploads";

/**
 * GET → redirect to a short-lived signed URL. Gives <img> a stable, ownership-checked
 * address while the bucket stays private. The browser may reuse the redirect only
 * while the signed URL is still valid.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/projects/[projectId]/thumbnail">) {
  return withUser(async (user) => {
    const projectId = projectIdSchema.safeParse((await ctx.params).projectId);
    const url = projectId.success ? await getThumbnailUrl(user.id, projectId.data) : null;
    if (!url) return jsonError(404, "No thumbnail.");

    return NextResponse.redirect(url, {
      status: 302,
      headers: { "Cache-Control": `private, max-age=${THUMBNAIL_URL_TTL_SECONDS - 60}` },
    });
  });
}
