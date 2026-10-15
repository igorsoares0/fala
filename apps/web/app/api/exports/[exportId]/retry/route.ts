import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { exportIdSchema } from "@fala/shared";
import { jsonError, withUser } from "@/lib/api";
import { retryExport } from "@/lib/exports";

/** POST → render a failed export again from its frozen snapshot. */
export async function POST(_request: NextRequest, ctx: RouteContext<"/api/exports/[exportId]/retry">) {
  return withUser(async (user) => {
    const exportId = exportIdSchema.safeParse((await ctx.params).exportId);
    if (!exportId.success) return jsonError(404, "This export doesn't exist anymore.");

    const result = await retryExport(user.id, exportId.data);
    if (!result.ok) return jsonError(result.status, result.error);
    return NextResponse.json({ export: result.export }, { headers: { "Cache-Control": "no-store" } });
  });
}
