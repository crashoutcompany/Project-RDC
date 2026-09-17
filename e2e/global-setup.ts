// shared:playwright-auth-setup v1
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { request, type FullConfig } from "@playwright/test";

export const TESTER_STORAGE_STATE = "e2e/.auth/tester.json";

type StorageState = Awaited<
  ReturnType<Awaited<ReturnType<typeof request.newContext>>["storageState"]>
>;

function httpSafeCookieName(name: string): string {
  if (name.startsWith("__Secure-")) return name.slice("__Secure-".length);
  if (name.startsWith("__Host-")) return name.slice("__Host-".length);
  return name;
}

/** Normalize API-context cookies for Chromium browser storageState reuse. */
export function sanitizeStorageState(state: StorageState, hostname: string) {
  const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7;
  return {
    cookies: state.cookies
      .filter((cookie) => cookie.name && cookie.value)
      .map((cookie) => ({
        name: httpSafeCookieName(cookie.name),
        value: cookie.value,
        domain: cookie.domain || hostname,
        path: cookie.path || "/",
        expires: cookie.expires > 0 ? Math.floor(cookie.expires) : expires,
        httpOnly: Boolean(cookie.httpOnly),
        secure: false,
        sameSite: "Lax" as const,
      })),
    origins: state.origins ?? [],
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
  const hostname = new URL(baseURL).hostname;
  const api = await request.newContext({ baseURL });
  const response = await api.post("/api/test-auth/login", {
    headers: { authorization: `Bearer ${secret}` },
  });

  if (!response.ok())
    throw new Error(
      `Test login failed with ${response.status()}: ${await response.text()}`,
    );

  await mkdir(dirname(TESTER_STORAGE_STATE), { recursive: true });
  const state = await api.storageState();
  await writeFile(
    TESTER_STORAGE_STATE,
    JSON.stringify(sanitizeStorageState(state, hostname), null, 2),
  );
  await api.dispose();
}
