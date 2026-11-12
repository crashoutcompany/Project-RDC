import { createHash, timingSafeEqual } from "node:crypto";

function sha256(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
 * Fail closed when the secret is missing.
 */
export function authorizeCronRequest(
  request: Request,
  secret: string | undefined,
): boolean {
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return timingSafeEqual(sha256(header), sha256(`Bearer ${secret}`));
}
