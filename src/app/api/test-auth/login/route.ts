// shared:test-auth-route v1
import { NextResponse } from "next/server";
import {
  createTesterSession,
  evaluateTestAuthRequest,
  TEST_AUTH_HEADER,
} from "@/lib/test-auth";

/** Chromium rejects __Secure-/__Host- names unless Secure is set. */
function httpSafeCookieName(name: string): string {
  if (name.startsWith("__Secure-")) return name.slice("__Secure-".length);
  if (name.startsWith("__Host-")) return name.slice("__Host-".length);
  return name;
}

export async function POST(request: Request) {
  const decision = evaluateTestAuthRequest(
    request.headers.get(TEST_AUTH_HEADER),
  );
  if (!decision.allow) {
    return NextResponse.json({ error: "Not found" }, { status: decision.status });
  }

  const { cookieName, cookieValue, cookieOptions, expiresAt, user } =
    await createTesterSession();
  const expose = process.env.EXPOSE_TESTING_API === "1";
  const safeName = expose ? httpSafeCookieName(cookieName) : cookieName;

  // When EXPOSE_TESTING_API=1, also return cookie fields so Playwright can
  // build storageState without relying on APIRequestContext Set-Cookie parsing
  // (unreliable for loopback / __Secure- stripping).
  const response = NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    ...(expose
      ? {
          cookie: {
            name: safeName,
            value: cookieValue,
            path: cookieOptions.path ?? "/",
          },
        }
      : {}),
  });

  if (expose) {
    response.cookies.set(safeName, cookieValue, {
      httpOnly: true,
      path: cookieOptions.path ?? "/",
      sameSite: "lax",
      secure: false,
      maxAge: 60 * 60 * 24 * 7,
    });
  } else {
    response.cookies.set(cookieName, cookieValue, {
      httpOnly: true,
      path: cookieOptions.path ?? "/",
      sameSite: "lax",
      secure: Boolean(cookieOptions.secure),
      expires: expiresAt,
    });
  }

  return response;
}
