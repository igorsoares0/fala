import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser, type CurrentUser } from "./dal";

/** Consistent JSON errors for Route Handlers: `{ error }` with a user-presentable message. */
export function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/**
 * Route Handler wrapper that requires a session. API routes answer 401 instead of
 * redirecting, so `fetch` callers can handle it (proxy.ts lets /api through).
 */
export async function withUser(handler: (user: CurrentUser) => Promise<Response>): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "Sign in to continue.");
  return handler(user);
}
