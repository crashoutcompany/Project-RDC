// shared:auth-proxy v2

import { parseSetCookieHeader, toCookieOptions } from "better-auth/cookies";
import { NextRequest, NextResponse } from "next/server";

export type AuthAccessRule = "session" | `role:${string}`;

export type AuthPathRule = {
  path: string;
  access: AuthAccessRule;
};

type Session = {
  user: object;
  needsRefresh?: boolean;
};

type GetSessionResult =
  | Session
  | null
  | {
      headers: Headers;
      response: Session | null;
    };

type Auth = {
  api: {
    getSession(options: {
      headers: Headers;
      returnHeaders?: boolean;
      /** Better Auth refreshes durable session rows only on POST when deferSessionRefresh is on. */
      method?: "GET" | "POST";
    }): Promise<GetSessionResult>;
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

function hasBetterAuthSessionCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some(
      (cookie) =>
        cookie.name.includes("session_token") ||
        cookie.name.includes("session_data"),
    );
}

function applyAuthCookies(response: NextResponse, headers: Headers) {
  const setCookie = headers.get("set-cookie");
  if (!setCookie) return response;

  const parsed = parseSetCookieHeader(setCookie);
  parsed.forEach((value, key) => {
    if (!key) return;
    response.cookies.set(key, value.value, toCookieOptions(value));
  });
  return response;
}

function unwrapSessionResult(result: GetSessionResult): {
  session: Session | null;
  headers: Headers;
} {
  if (result && typeof result === "object" && "response" in result) {
    return {
      session: result.response,
      headers: result.headers,
    };
  }

  return {
    session: (result as Session | null) ?? null,
    headers: new Headers(),
  };
}

async function loadSession(auth: Auth, request: NextRequest) {
  // GET is read-only under deferSessionRefresh (may set needsRefresh).
  let loaded = unwrapSessionResult(
    await auth.api.getSession({
      headers: request.headers,
      returnHeaders: true,
      method: "GET",
    }),
  );

  // Durable expiry refresh + Set-Cookie only happen on POST.
  if (loaded.session?.needsRefresh) {
    loaded = unwrapSessionResult(
      await auth.api.getSession({
        headers: request.headers,
        returnHeaders: true,
        method: "POST",
      }),
    );
  }

  return loaded;
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
      // Public paths stay renderable for guests. If a session cookie is
      // present, refresh it here (not in RSC) so Set-Cookie can stick.
      if (!hasBetterAuthSessionCookie(request)) {
        return NextResponse.next();
      }

      const { headers: sessionHeaders } = await loadSession(auth, request);
      return applyAuthCookies(NextResponse.next(), sessionHeaders);
    }

    const { session, headers: sessionHeaders } = await loadSession(
      auth,
      request,
    );

    if (isSignInPath) {
      const response = session
        ? NextResponse.redirect(new URL(signedInPath, request.url))
        : NextResponse.next();
      return applyAuthCookies(response, sessionHeaders);
    }

    if (!access) {
      return applyAuthCookies(NextResponse.next(), sessionHeaders);
    }

    if (!session) {
      return applyAuthCookies(
        NextResponse.redirect(new URL(signInPath, request.url)),
        sessionHeaders,
      );
    }

    if (access.startsWith("role:")) {
      const requiredRole = access.slice("role:".length);
      const role = "role" in session.user ? session.user.role : undefined;
      if (role !== requiredRole) {
        return applyAuthCookies(
          new NextResponse(null, { status: 403 }),
          sessionHeaders,
        );
      }
    }

    return applyAuthCookies(NextResponse.next(), sessionHeaders);
  };
}
