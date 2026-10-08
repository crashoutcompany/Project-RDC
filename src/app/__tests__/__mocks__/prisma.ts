import { vi } from "vitest";

const mockPrisma = {
  game: { findFirst: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
  session: { 
    findFirst: vi.fn(), 
    findMany: vi.fn(), 
    findUnique: vi.fn(), 
    create: vi.fn().mockResolvedValue({ sessionId: 1 }), 
    update: vi.fn().mockResolvedValue({ sessionId: 1 }), 
    deleteMany: vi.fn() 
  },
  gameSet: { 
    create: vi.fn().mockResolvedValue({ setId: 1 }), 
    update: vi.fn().mockResolvedValue({ setId: 1 }), 
    deleteMany: vi.fn() 
  },
  match: { 
    create: vi.fn().mockResolvedValue({ matchId: 1 }), 
    deleteMany: vi.fn() 
  },
  playerSession: { 
    create: vi.fn().mockResolvedValue({ playerSessionId: 1, playerId: 1 }), 
    deleteMany: vi.fn() 
  },
  playerStat: { create: vi.fn(), createMany: vi.fn(), deleteMany: vi.fn() },
  gameStat: { findMany: vi.fn() },
  player: { findUnique: vi.fn(), findMany: vi.fn() },
  sessionEditRequest: { 
    create: vi.fn().mockResolvedValue({ id: 1 }), 
    findUnique: vi.fn(), 
    update: vi.fn().mockResolvedValue({ id: 1 }), 
    deleteMany: vi.fn() 
  },
  sessionRevision: { 
    create: vi.fn(), 
    findFirst: vi.fn(), 
    deleteMany: vi.fn() 
  },
  $transaction: vi.fn(async (callback) => await callback(mockPrisma)),
};

export const handlePrismaOperation = vi.fn((callback) =>
  callback(mockPrisma)
    .then((data: unknown) => ({ success: true, data }))
    .catch((error: Error) => ({ success: false, error: error.message }))
);

export default mockPrisma;
