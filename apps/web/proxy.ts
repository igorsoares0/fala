import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Optimistic routing only: checks for the presence of a session cookie.
 * Real authorization happens in lib/dal.ts on every page, action and query.
 */
/** The public website: readable without an account (and by Paddle's review). */
const PUBLIC_PAGES = new Set(["/", "/terms", "/privacy", "/refunds"]);

export function proxy(request: NextRequest) {
  const hasSession = Boolean(getSessionCookie(request));
  const { pathname } = request.nextUrl;
  const isAuthPage = pathname === "/sign-in" || pathname === "/reset-password";

  if (PUBLIC_PAGES.has(pathname)) return NextResponse.next();
  if (!hasSession && !isAuthPage) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  if (hasSession && pathname === "/sign-in") {
    return NextResponse.redirect(new URL("/projects", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Everything except API routes (they answer 401 themselves, see lib/api.ts),
  // Next internals and static files.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
