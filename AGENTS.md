# Project RDC - AI Agent Guidelines

This document provides essential context and guidelines for AI coding assistants working on Project RDC. It covers project structure, conventions, and key patterns to ensure consistent and effective contributions.

## Project Overview

**Project RDC** is a Next.js application for tracking and displaying gaming statistics and achievements for RDC (Real Dreams Change the World) members across multiple games. The application allows users to browse game statistics, view member profiles, compare members, and submit new game session data through an admin interface.

## Tech Stack Summary

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **UI Library**: React 19
- **Database**: PostgreSQL (Neon) with Prisma ORM
- **Authentication**: NextAuth.js
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
- **Client Location**: Custom location at `prisma/generated/`
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

- Admin functionality requires authentication checks using `auth()` from `@/auth`
- Check for authenticated user before performing admin operations
- Return error codes from `src/lib/constants` for consistent error handling

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

- **Dev Server**: `npm run dev` (uses Turbopack)
- **Build**: `npm run build` for production builds
- **Post-install**: Automatically runs `prisma generate --sql` after npm install
- **Testing**: Jest with React Testing Library (`npm test`)

### Key Dependencies

- **UI**: React, Next.js, Tailwind CSS, shadcn/ui, Recharts
- **Forms**: React Hook Form, Zod
- **Auth**: NextAuth.js
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

