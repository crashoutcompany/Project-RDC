import { headers } from "next/headers";

import { auth as betterAuth } from "@/lib/auth";

type SessionQuery = {
  disableRefresh?: boolean;
  disableCookieCache?: boolean;
};

async function readSession(
  requestHeaders: Headers | undefined,
  query: SessionQuery,
) {
  return betterAuth.api.getSession({
    headers: requestHeaders ?? (await headers()),
    query,
  });
}

/** RSC-safe session read — never refreshes cookies (pair with the auth proxy). */
export async function getRscSession(requestHeaders?: Headers) {
  return readSession(requestHeaders, { disableRefresh: true });
}

/** Authoritative read for mutations — bypasses cookie cache, still no refresh. */
export async function getAuthoritativeSession(requestHeaders?: Headers) {
  return readSession(requestHeaders, {
    disableRefresh: true,
    disableCookieCache: true,
  });
}
