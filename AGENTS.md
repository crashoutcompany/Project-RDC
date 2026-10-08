# Project RDC - AI Agent Guidelines

This document provides essential context and guidelines for AI coding assistants working on Project RDC. It covers project structure, conventions, and key patterns to ensure consistent and effective contributions.

## Project Overview

**Project RDC** is a Next.js application for tracking and displaying gaming statistics and achievements for RDC (Real Dreams Change the World) members across multiple games. The application allows users to browse game statistics, view member profiles, compare members, and submit new game session data through an admin interface.

## Tech Stack Summary

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **UI Library**: React 19
- **Database**: PostgreSQL (Neon) with Prisma ORM
- **Authentication**: Self-hosted Better Auth
- **Styling**: Tailwind CSS with shadcn/ui components
- **Data Fetching**: Server Actions pattern
- **Analytics**: PostHog
- **Charts**: Recharts
- **Forms**: React Hook Form with Zod validation
- **AI Services**: Azure Document Intelligence, Google Generative AI

## Key Conventions

### Code Style

- **JSDoc Comments**: Only document **meaningful** functions — non-obvious behavior, non-trivial contracts, security/auth boundaries, or tricky data transforms. Skip trivial pages, thin wrappers, skeletons, and anything the name + types already make clear. Prefer a short purpose note over exhaustive `@param` / `@returns` lists.
- **Conditionals**: Use single-statement if/else/loops without brackets for brevity:
  ```tsx
  if (bool) num = 10;
  else num = -10;
  ```
- **Type Safety**: Do not introduce new bugs or type errors
- **Path Aliases**: Configured in `components.json` - use `@/` prefix for imports

### Server Components & Actions

- **Server Actions**: Must include `"use server"` directive at the top
- **Server Components**: Use `"use cache"` directive where appropriate for caching
- **Error Handling**: Use `handlePrismaOperation` wrapper for database operations

## Project Structure Patterns

### Route Organization

- **Route Groups**: Routes are organized using Next.js route groups: `(routes)/(groups)`
- **Component Folders**: Route-specific components live in `_components` folders
- **Layout Files**: Shared layouts at route group level (`layout.tsx`)

### File Locations

- **Server Actions**: `src/app/actions/` - Contains all server action files
- **Database Utilities**: `prisma/lib/` - Database operation helpers
- **Prisma Client**: Import from `prisma/db.ts` (not from generated client directly)
- **Game Processors**: `src/lib/game-processors/` - Game-specific data processing logic
- **Stat Configs**: `src/lib/stat-configs.ts` - Stat configuration definitions
- **Constants**: `src/lib/constants.ts` - Shared constants and enums

### Component Organization

- **UI Components**: `src/components/ui/` - Reusable shadcn/ui components
- **Feature Components**: `src/components/` - Shared feature components
- **Route Components**: `_components/` folders within route directories

## Database Patterns

### Prisma Usage

- **Schema**: Defined in `prisma/schema.prisma`
- **Client Location**: Generated at `src/generated/prisma/`
- **Import Pattern**: Always import Prisma client from `prisma/db.ts`
- **Error Handling**: Wrap operations with `handlePrismaOperation` for consistent error handling

### Cache Management

- **Revalidation**: Use `revalidateTag` from `next/cache` after mutations
- **Cache Tags**: Tag queries appropriately for targeted invalidation

### Migrations & Seeding

- **Migrations**: Use `npx prisma migrate dev --name <name>` to create migrations
- **Seeding**: Seed script located at `prisma/seed.ts`
- **Reset**: `npx prisma migrate reset` resets and seeds database

## Common Patterns

### Game Processing

- Game-specific processors handle stat extraction and transformation
- Processors located in `src/lib/game-processors/`
- Each game has its own processor (e.g., `MarioKart8Processor.ts`, `RocketLeagueProcessor.ts`)

### Authentication

- Better Auth configuration lives in `src/lib/auth.ts`; shared factories live in
  `src/lib/auth/{create-auth,base-url,client,proxy}.ts`
- Read server sessions with `auth.api.getSession({ headers: await headers() })`
- Check for authenticated user before performing admin operations
- Admin routes and actions require `session.user.role === "admin"`
- The sign-in page is `/signin`
- Return error codes from `src/lib/constants` for consistent error handling

### How agents sign in

- Build and start with `EXPOSE_TESTING_API=1`. Never set that flag on Vercel Production.
- Set `TEST_AUTH_SECRET` and `POST /api/test-auth/login` with header
  `x-test-auth-secret: <secret>`.
- The route upserts the seeded admin tester and mints a real Better Auth session.
  Production always 404s.
- Playwright `e2e/global-setup.ts` writes `e2e/.auth/tester.json`.
- If Deployment Protection is on, also send
  `x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET`.

### Neon Managed Better Auth revisit

Revisit Neon Managed Better Auth only after all of: GA; SDK ≥1.0 with a changelog;
documented http-dev cookie story or configurable cookie names; API to seed a tester
per branch. Users already live in this Neon database, so a later switch is a schema
move, not a rewrite.

### Stat Tracking

- Stats are defined as enums in Prisma schema (`StatName` enum)
- Stat types include INT and STRING
- Game stats are associated with sessions, matches, and sets

## Important Notes

### Environment Variables

- Multiple environment files: `.env`, `.env.development.local`, `.env.production.local`
- `.env` used by Prisma and SSG builds
- `.env.development.local` used in development mode
- `.env.production.local` used for production builds

### Development Workflow

- **Toolchain**: Node.js 24 and pnpm 10
- **Dev Server**: `pnpm dev` (uses Turbopack)
- **Build**: `pnpm build` for production builds
- **Post-install**: Automatically runs `prisma generate --sql` after `pnpm install`
- **Testing**: Vitest with React Testing Library (`pnpm test`)

### Key Dependencies

- **UI**: React, Next.js, Tailwind CSS, shadcn/ui, Recharts
- **Forms**: React Hook Form, Zod
- **Auth**: Better Auth
- **Database**: Prisma, Neon (serverless Postgres)
- **Analytics**: PostHog

## Working with This Codebase

When making changes:

1. **Follow existing patterns** - Look at similar files for structure and conventions
2. **Maintain type safety** - Ensure TypeScript types are correct
3. **Add JSDoc only when it earns its keep** - Document meaningful/non-obvious functions, not every export
4. **Handle errors** - Use existing error handling patterns
5. **Invalidate cache** - Revalidate tags after data mutations
6. **Test authentication** - Verify auth checks for admin operations
7. **Check Prisma schema** - Ensure database operations match schema definitions


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
