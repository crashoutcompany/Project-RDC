import { vi } from "vitest";

/**
 * Shared Prisma stand-in aliased over `prisma/db` (see vitest.config.ts).
 * Defaults live in the `vi.fn(impl)` so `mockReset` restores them between
 * tests; per-test `mockResolvedValue` overrides never leak.
 */
const mockPrisma = {
  game: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  session: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(async () => ({ sessionId: 1 })),
    update: vi.fn(async () => ({ sessionId: 1 })),
    deleteMany: vi.fn(),
  },
  gameSet: {
    create: vi.fn(async () => ({ setId: 1 })),
    update: vi.fn(async () => ({ setId: 1 })),
    deleteMany: vi.fn(),
  },
  match: {
    create: vi.fn(async () => ({ matchId: 1 })),
    deleteMany: vi.fn(),
  },
  playerSession: {
    create: vi.fn(async () => ({ playerSessionId: 1, playerId: 1 })),
    deleteMany: vi.fn(),
  },
  playerStat: { create: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
  gameStat: { findMany: vi.fn(async () => []), findFirst: vi.fn(), create: vi.fn() },
  player: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  sessionEditRequest: {
    create: vi.fn(async () => ({ id: 1 })),
    findMany: vi.fn(async () => []),
    findUnique: vi.fn(),
    update: vi.fn(async () => ({ id: 1 })),
    deleteMany: vi.fn(),
  },
  sessionRevision: {
    create: vi.fn(),
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
  },
  feedback: { create: vi.fn() },
  $transaction: vi.fn(
    async (callback: (tx: typeof mockPrisma) => Promise<unknown>) =>
      callback(mockPrisma),
  ),
};

export const handlePrismaOperation = vi.fn(
  async (callback: (prisma: typeof mockPrisma) => Promise<unknown>) => {
    try {
      return { success: true, data: await callback(mockPrisma) };
    } catch (error) {
      return { success: false, error: (error as Error).message, data: null };
    }
  },
);

export default mockPrisma;
