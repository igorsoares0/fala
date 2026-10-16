import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { presignRequestSchema, projectIdSchema } from "@fala/shared";
import { jsonError, withUser } from "@/lib/api";
import { startUpload } from "@/lib/uploads";

/** POST { mimeType, sizeBytes } → start a multipart upload of this project's source video: its part size and count. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/projects/[projectId]/uploads/presign">) {
  return withUser(async (user) => {
    const projectId = projectIdSchema.safeParse((await ctx.params).projectId);
    if (!projectId.success) return jsonError(404, "This project doesn't exist anymore.");

    const body = presignRequestSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return jsonError(400, "That file can't be uploaded. Use an MP4, MOV or WEBM up to 1 GB.");

    const result = await startUpload(user.id, projectId.data, body.data);
    if (!result.ok) return jsonError(result.status, result.error);
    return NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
  });
}
