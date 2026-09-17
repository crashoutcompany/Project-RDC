// shared:e2e-env v1

export type E2EEnvironment = {
  EXPOSE_TESTING_API?: string;
  VERCEL?: string;
};

export function isTestingApiExposed(
  env: E2EEnvironment = {
    EXPOSE_TESTING_API: process.env.EXPOSE_TESTING_API,
    VERCEL: process.env.VERCEL,
  },
): boolean {
  return env.EXPOSE_TESTING_API === "1" && env.VERCEL !== "1";
}
