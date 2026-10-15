import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { exportIdSchema } from "@fala/shared";
import { jsonError, withUser } from "@/lib/api";
import { getExport } from "@/lib/exports";

/** GET → one export's status and progress. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/exports/[exportId]">) {
  return withUser(async (user) => {
    const exportId = exportIdSchema.safeParse((await ctx.params).exportId);
    const found = exportId.success ? await getExport(user.id, exportId.data) : null;
    if (!found) return jsonError(404, "This export doesn't exist anymore.");
    return NextResponse.json({ export: found }, { headers: { "Cache-Control": "no-store" } });
  });
}
