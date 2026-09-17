// shared:proxy v1

import { NextRequest, NextResponse } from "next/server";

export type AuthAccessRule = "session" | `role:${string}`;

export type AuthPathRule = {
  path: string;
  access: AuthAccessRule;
};

type Session = {
  user: object;
};

type Auth = {
  api: {
    getSession(options: { headers: Headers }): Promise<Session | null>;
  };
};

type AuthProxyOptions = {
  auth: Auth;
  publicPaths?: readonly string[];
  rules?: readonly AuthPathRule[];
  signInPath: string;
  signedInPath?: string;
};

function pathMatches(pathname: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (!pattern.endsWith("/*")) return pathname === pattern;

  const prefix = pattern.slice(0, -2);
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function resolvePathAccess(
  pathname: string,
  publicPaths: readonly string[],
  rules: readonly AuthPathRule[],
): AuthAccessRule | null {
  if (publicPaths.some((path) => pathMatches(pathname, path))) return null;
  return rules.find((rule) => pathMatches(pathname, rule.path))?.access ?? null;
}

export function createAuthProxy({
  auth,
  publicPaths = [],
  rules = [],
  signInPath,
  signedInPath = "/",
}: AuthProxyOptions) {
  return async function authProxy(request: NextRequest) {
    const pathname = request.nextUrl.pathname;
    const access = resolvePathAccess(pathname, publicPaths, rules);
    const isSignInPath = pathname === signInPath;

    if (!access && !isSignInPath) {
      return NextResponse.next();
    }

    const session = await auth.api.getSession({
      headers: request.headers,
    });

    if (isSignInPath) {
      return session
        ? NextResponse.redirect(new URL(signedInPath, request.url))
        : NextResponse.next();
    }

    if (!access) {
      return NextResponse.next();
    }

    if (!session) {
      return NextResponse.redirect(new URL(signInPath, request.url));
    }

    if (access.startsWith("role:")) {
      const requiredRole = access.slice("role:".length);
      const role = "role" in session.user ? session.user.role : undefined;
      if (role !== requiredRole) {
        return new NextResponse(null, { status: 403 });
      }
    }

    return NextResponse.next();
  };
}
