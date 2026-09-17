// shared:auth-proxy v1
import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { SIGN_IN_PATH } from "@/lib/auth/config";

/**
 * Returns true when `path` is `/admin` or a nested admin route.
 */
export function isAdminPath(path: string): boolean {
  return path === "/admin" || path.startsWith("/admin/");
}

/**
 * Redirects signed-in users off `/signin` and requires an admin session for
 * `/admin` and nested admin routes.
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const requiresSession = path === SIGN_IN_PATH || isAdminPath(path);
  if (!requiresSession) return;

  const session = await auth.api.getSession({ headers: request.headers });

  if (session && path === SIGN_IN_PATH)
    return Response.redirect(new URL("/", request.url));

  if (isAdminPath(path) && (!session || session.user.role !== "admin"))
    return Response.redirect(new URL("/", request.url));
}

export const config = {
  matcher: [
    "/((?!api(?:/|$)|_next(?:/|$)|favicon\\.ico$|.*\\.(?:avif|gif|ico|jpe?g|png|svg|webp)$).*)",
  ],
};
