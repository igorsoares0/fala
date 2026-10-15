import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { exportIdSchema } from "@fala/shared";
import { jsonError, withUser } from "@/lib/api";
import { exportDownloadUrl } from "@/lib/exports";

/** GET → redirect to a short-lived signed URL that downloads the MP4. The URL is never stored or logged. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/exports/[exportId]/download">) {
  return withUser(async (user) => {
    const exportId = exportIdSchema.safeParse((await ctx.params).exportId);
    const url = exportId.success ? await exportDownloadUrl(user.id, exportId.data) : null;
    if (!url) return jsonError(404, "This export isn't available to download.");
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
  });
}
