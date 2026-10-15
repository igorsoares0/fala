import { NextResponse } from "next/server";
import { projectIdSchema } from "@fala/shared";
import { jsonError, withUser } from "@/lib/api";
import { retryTranscription } from "@/lib/transcription";

/** POST → transcribe the stored video again after a recoverable failure. */
export async function POST(_request: Request, ctx: RouteContext<"/api/projects/[projectId]/transcription/retry">) {
  return withUser(async (user) => {
    const projectId = projectIdSchema.safeParse((await ctx.params).projectId);
    if (!projectId.success) return jsonError(404, "This project doesn't exist anymore.");

    const result = await retryTranscription(user.id, projectId.data);
    if (!result.ok) return jsonError(result.status, result.error);
    return NextResponse.json({ status: "PROCESSING" }, { headers: { "Cache-Control": "no-store" } });
  });
}
