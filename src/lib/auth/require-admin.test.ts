import { vi } from "vitest";
import { getAuthoritativeSession } from "@/lib/auth/server";
import { signInAs, TEST_USERS } from "@/test/session";
import { requireAdmin } from "./require-admin";

describe("requireAdmin", () => {
  it("returns the session for an admin", async () => {
    signInAs("admin");

    expect((await requireAdmin())?.user).toEqual(TEST_USERS.admin);
  });

  it.each([
    ["a signed-out visitor", null],
    ["a non-admin user", "user"],
  ] as const)("returns null for %s", async (_label, role) => {
    signInAs(role);

    expect(await requireAdmin()).toBeNull();
  });

  it("returns null when the session carries no role", async () => {
    vi.mocked(getAuthoritativeSession).mockResolvedValue({
      user: { id: "legacy", email: "legacy@rdc.test" },
      session: { id: "legacy-session" },
    } as never);

    expect(await requireAdmin()).toBeNull();
  });
});
