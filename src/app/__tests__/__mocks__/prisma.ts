/**
 * Mock implementation of Prisma for Jest tests.
 */
const mockPrisma = {
  game: { findFirst: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
  session: { 
    findFirst: jest.fn(), 
    findMany: jest.fn(), 
    findUnique: jest.fn(), 
    create: jest.fn().mockResolvedValue({ sessionId: 1 }), 
    update: jest.fn().mockResolvedValue({ sessionId: 1 }), 
    deleteMany: jest.fn() 
  },
  gameSet: { 
    create: jest.fn().mockResolvedValue({ setId: 1 }), 
    update: jest.fn().mockResolvedValue({ setId: 1 }), 
    deleteMany: jest.fn() 
  },
  match: { 
    create: jest.fn().mockResolvedValue({ matchId: 1 }), 
    deleteMany: jest.fn() 
  },
  playerSession: { 
    create: jest.fn().mockResolvedValue({ playerSessionId: 1, playerId: 1 }), 
    deleteMany: jest.fn() 
  },
  playerStat: { create: jest.fn(), createMany: jest.fn(), deleteMany: jest.fn() },
  gameStat: { findMany: jest.fn() },
  player: { findUnique: jest.fn(), findMany: jest.fn() },
  sessionEditRequest: { 
    create: jest.fn().mockResolvedValue({ id: 1 }), 
    findUnique: jest.fn(), 
    update: jest.fn().mockResolvedValue({ id: 1 }), 
    deleteMany: jest.fn() 
  },
  sessionRevision: { 
    create: jest.fn(), 
    findFirst: jest.fn(), 
    deleteMany: jest.fn() 
  },
  $transaction: jest.fn(async (callback) => await callback(mockPrisma)),
};

export const handlePrismaOperation = jest.fn((callback) =>
  callback(mockPrisma)
    .then((data: any) => ({ success: true, data }))
    .catch((error: Error) => ({ success: false, error: error.message }))
);

export default mockPrisma;
