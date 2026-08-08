# instant-nav rig: Project-RDC

- BUILD: `INSTANT_NAV_TEST_BUILD=1 npm run build && INSTANT_NAV_TEST_BUILD=1 npm run start` (local production; port 3000). Never set `INSTANT_NAV_TEST_BUILD=1` on Vercel — `VERCEL=1` also disables the expose flag in `next.config.ts`.
- EXPOSE: `INSTANT_NAV_TEST_BUILD=1` and `VERCEL !== '1'` → `experimental.exposeTestingApiInProductionBuild`. Local + GitHub Actions only; never preview/production deploys.
- RUN: `npm run test:instant` (builds with the marker, starts via Playwright `webServer`, runs against `BASE_URL` / `http://localhost:3000`)
- TEST USER: anonymous public visitor for public routes. Auth routes (admin/profile) use OAuth (GitHub/Google) via better-auth — no password e2e fixture; structural shell fixes applied, authenticated `instant()` coverage deferred until a storageState fixture exists
- DRIFT: signed-in vs anonymous (Admin/Profile nav items); seeded Neon DB content for games/members; PostHog flags none for shell markers
- LOOP: stop previous server on :3000 → `npm run test:instant` → fix → rebuild. Fully agent-drivable locally. Fail on EADDRINUSE. CI: `e2e-instant` in `.github/workflows/main.yml` creates/reuses Neon `preview/pr-{n}-{head_ref}` (PRs) or ephemeral `ci/e2e-{sha}` (push to main), migrates + seeds, then runs Playwright — not `secrets.DATABASE_URL`
- LIVENESS: n/a (local build && start; artifact is freshly built)
- WALLS: OAuth-only auth (no email/password test login); Prisma needs local `.env` or CI Neon branch URLs for build-time prerender; clean runners need `npx playwright install chromium --with-deps` (CI) or `npm run playwright:install` (local); CI needs `NEON_API_KEY`, `NEON_DATABASE`, `NEON_ROLE`, and var `NEON_PROJECT_ID`
