# instant-nav rig: Project-RDC

- BUILD: `npm run build:e2e && EXPOSE_TESTING_API=1 npm run start` (local production; port 3000). Never set `EXPOSE_TESTING_API=1` on Vercel — `VERCEL=1` also disables the expose flag in `next.config.ts`.
- EXPOSE: `EXPOSE_TESTING_API=1` and `VERCEL !== '1'` → `experimental.exposeTestingApiInProductionBuild`. Local + GitHub Actions only; never preview/production deploys.
- RUN: `npm run test:e2e` (builds with the marker, starts via Playwright `webServer`, runs against `PLAYWRIGHT_BASE_URL` / `http://127.0.0.1:3000`)
- TEST USER: public tests remain anonymous. When `TEST_AUTH_SECRET` is set, global setup calls `POST /api/test-auth/login` and saves a real seeded admin session to `e2e/.auth/tester.json` for authenticated tests.
- DRIFT: signed-in vs anonymous (Admin/Profile nav items); seeded Neon DB content for games/members; PostHog flags none for shell markers
- LOOP: stop previous server on :3000 → `npm run test:e2e` → fix → rebuild. Fully agent-drivable locally. Fail on EADDRINUSE. CI: `e2e-instant` in `.github/workflows/main.yml` creates/reuses Neon `preview/pr-{n}-{head_ref}` (PRs) or ephemeral `ci/e2e-{sha}` (push to main) and runs Playwright against inherited parent data — not `secrets.DATABASE_URL` (no migrate/seed; repo has no Prisma migration history)
- LIVENESS: n/a (local build && start; artifact is freshly built)
- WALLS: Prisma needs local `.env` or CI Neon branch URLs for build-time prerender; clean runners need `npx playwright install chromium --with-deps` (CI) or `npm run playwright:install` (local); CI needs `NEON_API_KEY`, `NEON_DATABASE`, `NEON_ROLE`, and var `NEON_PROJECT_ID`; Better Auth needs `BETTER_AUTH_SECRET`; authenticated E2E additionally needs `TEST_AUTH_SECRET`
