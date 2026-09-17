// shared:playwright-auth-setup v1
import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { request, type FullConfig } from "@playwright/test";

export const TESTER_STORAGE_STATE = "e2e/.auth/tester.json";

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
    headers: { authorization: `Bearer ${secret}` },
  });

  if (!response.ok())
    throw new Error(
      `Test login failed with ${response.status()}: ${await response.text()}`,
    );

  await mkdir(dirname(TESTER_STORAGE_STATE), { recursive: true });
  await api.storageState({ path: TESTER_STORAGE_STATE });
  await api.dispose();
}
