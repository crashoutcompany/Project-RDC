// shared:playwright-auth-setup v1
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { request, type FullConfig } from "@playwright/test";

export const TESTER_STORAGE_STATE = "e2e/.auth/tester.json";

type LoginCookie = {
  name: string;
  value: string;
  path?: string;
};

type LoginResponse = {
  user?: { id: string; email: string; role?: string | null };
  cookie?: LoginCookie;
};

function httpSafeCookieName(name: string): string {
  if (name.startsWith("__Secure-")) return name.slice("__Secure-".length);
  if (name.startsWith("__Host-")) return name.slice("__Host-".length);
  return name;
}

/** Build Chromium-safe storageState from the test-auth login cookie payload. */
export function storageStateFromLoginCookie(
  cookie: LoginCookie,
  baseURL: string,
) {
  const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7;
  const { hostname } = new URL(baseURL);
  return {
    cookies: [
      {
        name: httpSafeCookieName(cookie.name),
        value: cookie.value,
        url: baseURL,
        path: cookie.path || "/",
        expires,
        httpOnly: true,
        secure: false,
        sameSite: "Lax" as const,
      },
    ],
    origins: [] as { origin: string; localStorage: [] }[],
  };
}

export default async function globalSetup(config: FullConfig) {
  const secret = process.env.TEST_AUTH_SECRET;
  await rm(TESTER_STORAGE_STATE, { force: true });
  if (!secret) return;

  const baseURL =
    config.projects[0]?.use.baseURL ??
    process.env.PLAYWRIGHT_BASE_URL ??
    "http://127.0.0.1:3000";
  const api = await request.newContext({ baseURL });
  const response = await api.post("/api/test-auth/login", {
    headers: { "x-test-auth-secret": secret },
  });

  if (!response.ok())
    throw new Error(
      `Test login failed with ${response.status()}: ${await response.text()}`,
    );

  const body = (await response.json()) as LoginResponse;
  if (!body.cookie?.name || !body.cookie?.value)
    throw new Error(
      "Test login response missing cookie payload for Playwright storageState",
    );
  if (body.user?.role !== "admin")
    throw new Error(
      `Test login did not mint an admin session (role=${body.user?.role ?? "missing"})`,
    );

  await mkdir(dirname(TESTER_STORAGE_STATE), { recursive: true });
  await writeFile(
    TESTER_STORAGE_STATE,
    JSON.stringify(storageStateFromLoginCookie(body.cookie, baseURL), null, 2),
  );
  await api.dispose();
}
