import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  /** Uploads wait until the address is confirmed (see lib/uploads.ts). */
  emailVerified: boolean;
}

/**
 * Data Access Layer entry point: the only place that reads the session.
 * Reads request headers, so callers must render inside a <Suspense> boundary.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, name, email, emailVerified } = session.user;
  return { id, name, email, emailVerified };
});

/** Returns the signed-in user or redirects to the sign-in page. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}
