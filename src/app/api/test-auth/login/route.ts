// shared:test-auth-route v1
import { NextResponse } from "next/server";
import {
  createTesterSession,
  isTestAuthEnabled,
  isValidTestAuthSecret,
  readBearerToken,
} from "@/lib/test-auth";

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

  response.cookies.set(cookieName, cookieValue, {
    httpOnly: true,
    path: cookieOptions.path ?? "/",
    sameSite: "lax",
    secure: cookieOptions.secure,
    expires: expiresAt,
  });

  return response;
}
