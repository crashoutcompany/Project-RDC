import { Prisma } from "@/generated/prisma/client";
import {
  describe,
  expect,
  beforeEach,
  afterEach,
  it,
  jest,
} from "@jest/globals";
import { approveEditRequest } from "../actions/editSession";
import { auth } from "@/lib/auth";
import type { FormValues } from "../(routes)/admin/_utils/form-helpers";
import prisma from "prisma/db";

/**
 * TODO: Fix this integration test
 * This test requires a real database connection using Prisma's Neon adapter.
 * The Neon adapter uses ESM modules that Jest can't parse without additional configuration.
 * Options to fix:
 * 1. Run with --experimental-vm-modules flag for ESM support
 * 2. Convert to unit test by fully mocking Prisma
 * 3. Use a separate test runner (e.g., Vitest) that supports ESM
 */

// Skip this entire test file until ESM support is configured
const SKIP_INTEGRATION_TESTS = true;

// Auth mock type matching better-auth Session type
interface MockSession {
  user: {
    id: string;
    email: string;
    name: string | null;
    role?: string;
  };
}

const mockUser: MockSession = {
  user: {
    id: "test-user-id",
    email: "test@example.com",
    name: "Test User",
    role: "admin",
  },
};

// Mock auth and cache
jest.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));

jest.mock("next/cache", () => ({
  revalidateTag: jest.fn(),
}));

jest.mock("next/server", () => ({
  after: jest.fn((fn: () => void) => fn()),
}));

jest.mock("next/headers", () => {
  const mockHeaders = new Headers();
  return {
    headers: jest.fn(() => Promise.resolve(mockHeaders)),
  };
});

const mockGetSession = auth.api.getSession as unknown as jest.Mock<
  () => Promise<MockSession | null>
>;

// Define session include with proper property casing
const sessionInclude = {
  include: {
    Game: true,
    sets: {
      include: {
        matches: {
          include: {
            playerSessions: {
              include: {
                playerStats: true,
              },
            },
            matchWinners: true,
          },
        },
        setWinners: true,
      },
    },
  },
} as const;

// Type definitions for the session with includes
type SessionWithIncludes = NonNullable<
  Prisma.SessionGetPayload<typeof sessionInclude>
>;

// Setup options interface
interface SetupTestOptions {
  withSets?: boolean;
  editData?: Partial<FormValues>;
  dirtyFields?: Partial<Record<keyof FormValues, boolean>>;
}

const baseFormValues: FormValues = {
  sessionId: 1,
  game: "Mario Kart 8",
  sessionName: "Updated Session",
  sessionUrl: "https://www.youtube.com/updated",
  thumbnail: "updated-thumb.jpg",
  videoId: "updated-123",
  date: new Date("2025-01-01"),
  players: [{ playerId: 1, playerName: "Mark" }],
  sets: [
    {
      setId: 1,
      setWinners: [{ playerId: 1, playerName: "Mark" }],
      matches: [
        {
          matchWinners: [{ playerId: 1, playerName: "Mark" }],
          playerSessions: [
            {
              playerId: 1,
              playerSessionName: "Player 1",
              playerStats: [
                { statId: 1, stat: "MK8_POS" as const, statValue: "1" },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const setupTest = async (options: SetupTestOptions = {}) => {
  const session = (await prisma.session.create({
    data: {
      sessionName: "Original Session",
      sessionUrl: "https://original.url",
      thumbnail: "original-thumb.jpg",
      videoId: "original-123",
      // set FK directly to avoid nested connect typing issues
      gameId: 1,
      date: new Date("2025-01-01"),
      isApproved: false,
      createdBy: "test@example.com",
      ...(options.withSets && {
        sets: {
          create: {
            // GameSet does not have a direct Game relation in schema; don't set it here
            setWinners: { connect: [{ playerId: 1 }] },
            matches: {
              create: [
                {
                  matchWinners: { connect: [{ playerId: 1 }] },
                  playerSessions: {
                    create: [
                      {
                        player: { connect: { playerId: 1 } },
                        playerStats: {
                          create: {
                            player: { connect: { playerId: 1 } },
                            game: { connect: { gameId: 1 } },
                            gameStat: { connect: { statId: 1 } },
                            value: "100",
                            date: new Date("2025-01-01"),
                          },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      }),
    },
    include: sessionInclude.include,
  })) as unknown as SessionWithIncludes;

  if (!options.editData) {
    return { session };
  }

  const editRequest = await prisma.sessionEditRequest.create({
    data: {
      sessionId: session.sessionId,
      proposerId: mockUser.user!.id,
      proposedData: JSON.stringify({
        proposedData: { ...baseFormValues, ...options.editData },
        dirtyFields: options.dirtyFields || {},
      }),
      status: "PENDING",
    },
  });

  return { session, editRequest };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(mockUser);
});

afterEach(async () => {
  await prisma.sessionEditRequest.deleteMany();
  await prisma.sessionRevision.deleteMany();
  await prisma.playerStat.deleteMany();
  await prisma.playerSession.deleteMany();
  await prisma.match.deleteMany();
  await prisma.gameSet.deleteMany();
  await prisma.session.deleteMany();
});

describe("approveEditRequest", () => {
  it("should return error if not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const result = await approveEditRequest(1);
    expect(result.error).toBe("Not authenticated");
  });

  it("should update only modified top-level fields", async () => {
    const { session, editRequest } = await setupTest({
      editData: { sessionName: "New Name Only" },
      dirtyFields: { sessionName: true },
    });

    if (!editRequest) throw new Error("Edit request should be defined");

    const result = await approveEditRequest(editRequest.id);
    expect(result.error).toBeNull();

    const updatedSession = await prisma.session.findUnique({
      where: { sessionId: session.sessionId },
    });

    // Only sessionName should be updated
    expect(updatedSession).toMatchObject({
      sessionName: "New Name Only",
      sessionUrl: session.sessionUrl,
      thumbnail: session.thumbnail,
      videoId: session.videoId,
    });
  });

  it("should handle complete set replacement when count changes", async () => {
    const { session } = await setupTest({ withSets: true });

    // Create edit request with two sets
    const twoSetsForm: FormValues = {
      ...baseFormValues,
      sessionId: session.sessionId,
      sets: [
        ...baseFormValues.sets,
        {
          setId: 2,
          setWinners: [{ playerId: 2, playerName: "Des" }],
          matches: [
            {
              matchWinners: [{ playerId: 2, playerName: "Des" }],
              playerSessions: [
                {
                  playerId: 2,
                  playerSessionName: "Player 2",
                  playerStats: [
                    { statId: 1, stat: "MK8_POS" as const, statValue: "2" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const editRequest = await prisma.sessionEditRequest.create({
      data: {
        sessionId: session.sessionId,
        proposerId: mockUser.user!.id,
        proposedData: JSON.stringify({
          proposedData: twoSetsForm,
          dirtyFields: { sets: true },
        }),
        status: "PENDING",
      },
    });

    const result = await approveEditRequest(editRequest.id);
    expect(result.error).toBeNull();

    const updatedSession = await prisma.session.findUnique({
      where: { sessionId: session.sessionId },
      include: {
        sets: {
          include: {
            setWinners: true,
            matches: {
              include: {
                matchWinners: true,
                playerSessions: {
                  include: {
                    playerStats: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Verify two sets exist with correct structure
    expect(updatedSession?.sets).toHaveLength(2);
    expect(updatedSession?.sets[0].setWinners).toHaveLength(1);
    expect(updatedSession?.sets[1].setWinners).toHaveLength(1);
    expect(
      updatedSession?.sets[1].matches[0].playerSessions[0].playerStats,
    ).toHaveLength(1);
  });

  it("should update existing sets when count remains same", async () => {
    const { session } = await setupTest({ withSets: true });

    // Update the existing set with new winners and stats
    const updatedSetForm: FormValues = {
      ...baseFormValues,
      sessionId: session.sessionId,
      sets: [
        {
          setId: session.sets[0].setId,
          setWinners: [{ playerId: 2, playerName: "Des" }],
          matches: [
            {
              matchWinners: [{ playerId: 2, playerName: "Des" }],
              playerSessions: [
                {
                  playerId: 2,
                  playerSessionName: "Player 2",
                  playerStats: [
                    { statId: 1, stat: "MK8_POS" as const, statValue: "3" },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const editRequest = await prisma.sessionEditRequest.create({
      data: {
        sessionId: session.sessionId,
        proposerId: mockUser.user!.id,
        proposedData: JSON.stringify({
          proposedData: updatedSetForm,
          dirtyFields: { sets: true },
        }),
        status: "PENDING",
      },
    });

    const result = await approveEditRequest(editRequest.id);
    expect(result.error).toBeNull();

    const updatedSession = await prisma.session.findUnique({
      where: { sessionId: session.sessionId },
      include: {
        sets: {
          include: {
            setWinners: true,
            matches: {
              include: {
                matchWinners: true,
                playerSessions: {
                  include: {
                    playerStats: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Verify set was updated with new data
    expect(updatedSession?.sets).toHaveLength(1);
    expect(updatedSession?.sets[0].setWinners[0].playerId).toBe(2);
    expect(updatedSession?.sets[0].matches[0].matchWinners[0].playerId).toBe(2);
    expect(
      updatedSession?.sets[0].matches[0].playerSessions[0].playerStats[0].value,
    ).toBe("3");
  });

  it("should create revision snapshot before applying changes", async () => {
    const { session, editRequest } = await setupTest({
      editData: { sessionName: "New Name" },
      dirtyFields: { sessionName: true },
    });

    if (!editRequest) throw new Error("Edit request should be defined");
    await approveEditRequest(editRequest.id);

    const revision = await prisma.sessionRevision.findFirst({
      where: { sessionId: session.sessionId },
      orderBy: { createdAt: "desc" },
    });

    expect(revision).toBeTruthy();
    const snapshotData = JSON.parse(revision!.snapshot as string);
    expect(snapshotData.sessionName).toBe(session.sessionName);
  });

  it("should mark edit request as approved with reviewer info", async () => {
    const { editRequest } = await setupTest({
      editData: { sessionName: "New Name" },
      dirtyFields: { sessionName: true },
    });

    if (!editRequest) throw new Error("Edit request should be defined");
    const note = "Changes look good";
    await approveEditRequest(editRequest.id, note);

    const updatedRequest = await prisma.sessionEditRequest.findUnique({
      where: { id: editRequest.id },
    });

    expect(updatedRequest).toMatchObject({
      status: "APPROVED",
      reviewerId: mockUser.user!.id,
      reviewNote: note,
      appliedBy: mockUser.user!.email,
    });
    expect(updatedRequest?.reviewedAt).toBeTruthy();
    expect(updatedRequest?.appliedAt).toBeTruthy();
  });

  it("should handle missing edit request gracefully", async () => {
    const result = await approveEditRequest(999999);
    expect(result.error).toBe("Edit request not found");
  });

  it("should not approve already approved/rejected requests", async () => {
    const { session } = await setupTest();

    const editRequest = await prisma.sessionEditRequest.create({
      data: {
        sessionId: session.sessionId,
        proposerId: mockUser.user!.id,
        proposedData: JSON.stringify({
          proposedData: baseFormValues,
          dirtyFields: { sessionName: true },
        }),
        status: "APPROVED", // Already approved
      },
    });

    const result = await approveEditRequest(editRequest.id);
    expect(result.error).toBe("Edit request is not pending");
  });
});
