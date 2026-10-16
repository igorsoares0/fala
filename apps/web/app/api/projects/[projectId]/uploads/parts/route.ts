import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { projectIdSchema, uploadPartsRequestSchema } from "@fala/shared";
import { jsonError, withUser } from "@/lib/api";
import { signUploadParts } from "@/lib/uploads";

/** POST { partNumbers } → presigned PUT URLs for a batch of parts of the upload in progress. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/projects/[projectId]/uploads/parts">) {
  return withUser(async (user) => {
    const projectId = projectIdSchema.safeParse((await ctx.params).projectId);
    if (!projectId.success) return jsonError(404, "This project doesn't exist anymore.");

    const body = uploadPartsRequestSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return jsonError(400, "Invalid part numbers.");

    const result = await signUploadParts(user.id, projectId.data, body.data.partNumbers);
    if (!result.ok) return jsonError(result.status, result.error);
    return NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } });
  });
}
