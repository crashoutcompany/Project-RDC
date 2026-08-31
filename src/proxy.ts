import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";

/**
 * Returns true when `path` is `/admin` or a nested admin route.
 */
function isAdminPath(path: string): boolean {
  return path === "/admin" || path.startsWith("/admin/");
}

/**
 * Returns true when `path` is `/submission` or a nested submission route.
 */
function isSubmissionPath(path: string): boolean {
  return path === "/submission" || path.startsWith("/submission/");
}

/**
 * Redirects signed-in users off `/signin`. Requires an admin session for
 * `/admin` and nested admin routes; requires any session for `/submission`.
 */
export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  const path = request.nextUrl.pathname;
  const role =
    session && "role" in session.user
      ? (session.user as { role?: string }).role
      : undefined;

  if (session && path === "/signin")
    return Response.redirect(new URL("/", request.url));

  if (isAdminPath(path) && (!session || role !== "admin"))
    return Response.redirect(new URL("/", request.url));

  if (isSubmissionPath(path) && !session)
    return Response.redirect(new URL("/", request.url));
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.png$).*)"],
};
