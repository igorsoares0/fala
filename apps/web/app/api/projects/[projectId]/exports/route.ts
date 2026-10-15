import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createExportRequestSchema, projectIdSchema } from "@fala/shared";
import { jsonError, withUser } from "@/lib/api";
import { createExport, listExports } from "@/lib/exports";

const noStore = { "Cache-Control": "no-store" };

/** GET → the project's exports, newest first. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/projects/[projectId]/exports">) {
  return withUser(async (user) => {
    const projectId = projectIdSchema.safeParse((await ctx.params).projectId);
    const exports = projectId.success ? await listExports(user.id, projectId.data) : null;
    if (!exports) return jsonError(404, "This project doesn't exist anymore.");
    return NextResponse.json({ exports }, { headers: noStore });
  });
}

/** POST { resolution, captionVersion } → freeze the captions and style and queue the render. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/projects/[projectId]/exports">) {
  return withUser(async (user) => {
    const projectId = projectIdSchema.safeParse((await ctx.params).projectId);
    if (!projectId.success) return jsonError(404, "This project doesn't exist anymore.");

    const body = createExportRequestSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return jsonError(400, "Choose 720p or 1080p.");

    const result = await createExport(user.id, projectId.data, body.data);
    if (!result.ok) return NextResponse.json({ error: result.error, reason: result.reason }, { status: result.status });
    return NextResponse.json({ export: result.export }, { status: 201, headers: noStore });
  });
}
