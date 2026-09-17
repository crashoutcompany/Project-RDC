export const SIGN_IN_PATH = "/signin";

export type SocialProvider = "github" | "google";

export const AUTH_ORIGINS = {
  local: "http://localhost:3000",
  production: "https://rdcstats.com",
  productionWww: "https://www.rdcstats.com",
  vercelProject: "https://project-rdc.vercel.app",
  vercelPreviewWildcard: "https://*.vercel.app",
} as const;
