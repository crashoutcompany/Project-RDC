// shared:test-auth-route v1
import { NextResponse } from "next/server";
import {
  createTesterSession,
  isTestAuthEnabled,
  isValidTestAuthSecret,
  readBearerToken,
} from "@/lib/test-auth";

/** Chromium rejects __Secure-/__Host- names unless Secure is set. */
function httpSafeCookieName(name: string): string {
  if (name.startsWith("__Secure-")) return name.slice("__Secure-".length);
  if (name.startsWith("__Host-")) return name.slice("__Host-".length);
  return name;
}

export async function POST(request: Request) {
  if (!isTestAuthEnabled())
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!isValidTestAuthSecret(readBearerToken(request)))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { cookieName, cookieValue, cookieOptions, expiresAt, user } =
    await createTesterSession();
  const response = NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
  });

  if (process.env.EXPOSE_TESTING_API === "1") {
    response.cookies.set(httpSafeCookieName(cookieName), cookieValue, {
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
      secure: cookieOptions.secure,
      expires: expiresAt,
    });
  }

  return response;
}
