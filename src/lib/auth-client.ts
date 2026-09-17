import { createAuthClient } from "better-auth/react";

/**
 * Same-origin client: do not pin `NEXT_PUBLIC_APP_URL`.
 * That value is the Vercel deployment URL in prod, so rdcstats.com
 * would CORS-fail fetching `/api/auth/get-session` from project-rdc.vercel.app.
 */
export const authClient = createAuthClient();

