import { getAuthoritativeSession } from "@/lib/auth/server";

type AuthSession = NonNullable<
  Awaited<ReturnType<typeof getAuthoritativeSession>>
>;

export type AdminUser = AuthSession["user"] & { role?: string };

/**
 * The one admin gate for server actions. Reads the session authoritatively
 * (no cookie cache) and returns it only for an admin; signed-out callers and
 * non-admins both get `null`, so callers deny with a single check.
 */
export async function requireAdmin(): Promise<AuthSession | null> {
  const session = await getAuthoritativeSession();
  if ((session?.user as AdminUser | undefined)?.role !== "admin") return null;
  return session;
}
