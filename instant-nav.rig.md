# instant-nav rig: Project-RDC

- BUILD: `EXPOSE_TESTING_API=1 npm run build && EXPOSE_TESTING_API=1 npm run start` (local production; port 3000)
- EXPOSE: `process.env.EXPOSE_TESTING_API === '1'` → `experimental.exposeTestingApiInProductionBuild`
- RUN: `BASE_URL=http://localhost:3000 npx playwright test` (or `npm run test:instant`)
- TEST USER: anonymous public visitor for public routes. Auth routes (admin/profile) use OAuth (GitHub/Google) via better-auth — no password e2e fixture; structural shell fixes applied, authenticated `instant()` coverage deferred until a storageState fixture exists
- DRIFT: signed-in vs anonymous (Admin/Profile nav items); seeded Neon DB content for games/members; PostHog flags none for shell markers
- LOOP: stop previous server on :3000 → `EXPOSE_TESTING_API=1 npm run build` → `EXPOSE_TESTING_API=1 npm run start` → Playwright → fix → rebuild. Fully agent-drivable locally. Fail on EADDRINUSE
- LIVENESS: n/a (local build && start; artifact is freshly built)
- WALLS: OAuth-only auth (no email/password test login); Prisma needs `.env` DATABASE_URL for build-time prerender of cached routes
