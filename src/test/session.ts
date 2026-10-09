import { vi } from "vitest";
import { getAuthoritativeSession } from "@/lib/auth/server";

export type TestRole = "admin" | "user";

export const TEST_USERS = {
  admin: { id: "admin-id", email: "admin@rdc.test", name: "Admin", role: "admin" },
  user: { id: "user-id", email: "user@rdc.test", name: "Member", role: "user" },
} as const;

/**
 * Sets the session that server actions read via `getAuthoritativeSession`
 * (mocked globally in vitest.setup.ts). `null` means signed out.
 */
export function signInAs(role: TestRole | null) {
  const session = role ? { user: TEST_USERS[role], session: { id: `${role}-session` } } : null;
  vi.mocked(getAuthoritativeSession).mockResolvedValue(session as never);
}
