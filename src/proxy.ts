import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

/**
 * Proxies requests to enforce basic authentication rules.
 *
 * - Redirects authenticated users away from the sign-in page.
 * - Redirects unauthenticated users away from admin/submission pages.
 *
 * @param {NextRequest} request - The incoming request object.
 * @returns {Promise<Response | void>} A redirect response or void to continue.
 */
export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  const path = request.nextUrl.pathname;

  if (session && path === "/signin")
    return Response.redirect(new URL("/", request.url));

  if ((path === "/admin" || path === "/submission") && !session)
    return Response.redirect(new URL("/", request.url));
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|.*\\.png$).*)",
    "/admin",
    "/submission",
  ],
};

// this will update the session expiry every time its called.
// export { auth as middleware } from "@/lib/auth"
