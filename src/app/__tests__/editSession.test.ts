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
import { errorCodes } from "@/lib/constants";

// Cast prisma to any to avoid complex mock typing issues in tests
const prismaMock = prisma as any;

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

// Mock auth
jest.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));

const mockGetSession = auth.api.getSession as unknown as jest.Mock<
  () => Promise<MockSession | null>
>;

// Setup options interface
interface SetupTestOptions {
  withSets?: boolean;
  editData?: Partial<FormValues>;
  dirtyFields?: Partial<Record<keyof FormValues, boolean>>;
  editStatus?: "PENDING" | "APPROVED" | "REJECTED";
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
  const session = {
    sessionId: 1,
    sessionName: "Original Session",
    sessionUrl: "https://original.url",
    thumbnail: "original-thumb.jpg",
    videoId: "original-123",
    gameId: 1,
    date: new Date("2025-01-01"),
    isApproved: false,
    createdBy: "test@example.com",
    sets: options.withSets ? [{ setId: 1, sessionId: 1, createdAt: new Date(), updatedAt: new Date() }] : [],
  };

  prismaMock.session.findUnique.mockResolvedValue(session);

  if (!options.editData && !options.editStatus) {
    return { session };
  }

  const editRequest = {
    id: 1,
    sessionId: session.sessionId,
    proposerId: mockUser.user!.id,
    proposedData: JSON.stringify({
      proposedData: { ...baseFormValues, ...options.editData },
      dirtyFields: options.dirtyFields || {},
    }),
    status: options.editStatus || "PENDING",
  };

  prismaMock.sessionEditRequest.findUnique.mockResolvedValue(editRequest);

  return { session, editRequest };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue(mockUser);
});

describe("approveEditRequest", () => {
  it("should return error if not authenticated", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const result = await approveEditRequest(1);
    expect(result.error).toBe(errorCodes.NotAuthenticated);
  });

  it("should update only modified top-level fields", async () => {
    const { session, editRequest } = await setupTest({
      editData: { sessionName: "New Name Only" },
      dirtyFields: { sessionName: true },
    });

    if (!editRequest) throw new Error("Edit request should be defined");

    const result = await approveEditRequest(editRequest.id);
    expect(result.error).toBeNull();

    expect(prisma.session.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { sessionId: session.sessionId },
      data: expect.objectContaining({
        sessionName: "New Name Only",
      })
    }));
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

    const editRequest = {
      id: 1,
      sessionId: session.sessionId,
      proposerId: mockUser.user!.id,
      proposedData: JSON.stringify({
        proposedData: twoSetsForm,
        dirtyFields: { sets: true },
      }),
      status: "PENDING",
    };

    prismaMock.sessionEditRequest.findUnique.mockResolvedValue(editRequest);
    prismaMock.gameSet.create.mockResolvedValue({ setId: 100 });
    prismaMock.match.create.mockResolvedValue({ matchId: 200 });
    prismaMock.playerSession.create.mockResolvedValue({ playerSessionId: 300, playerId: 1 });

    const result = await approveEditRequest(editRequest.id);
    expect(result.error).toBeNull();

    // Verify sets were deleted and recreated
    expect(prisma.gameSet.deleteMany).toHaveBeenCalledWith({
      where: { sessionId: session.sessionId }
    });
    expect(prisma.gameSet.create).toHaveBeenCalled();
  });

  it("should update existing sets when count remains same", async () => {
    const { session } = await setupTest({ withSets: true });

    // Update the existing set with new winners and stats
    const updatedSetForm: FormValues = {
      ...baseFormValues,
      sessionId: session.sessionId,
      sets: [
        {
          setId: 1, // Matches session.sets[0].setId
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

    const editRequest = {
      id: 1,
      sessionId: session.sessionId,
      proposerId: mockUser.user!.id,
      proposedData: JSON.stringify({
        proposedData: updatedSetForm,
        dirtyFields: { sets: true },
      }),
      status: "PENDING",
    };

    prismaMock.sessionEditRequest.findUnique.mockResolvedValue(editRequest);
    prismaMock.match.create.mockResolvedValue({ matchId: 200 });
    prismaMock.playerSession.create.mockResolvedValue({ playerSessionId: 300, playerId: 2 });

    const result = await approveEditRequest(editRequest.id);
    expect(result.error).toBeNull();

    // Verify existing set was updated
    expect(prisma.gameSet.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { setId: 1 }
    }));
    expect(prisma.match.deleteMany).toHaveBeenCalledWith({
      where: { setId: 1 }
    });
  });

  it("should create revision snapshot before applying changes", async () => {
    const { session, editRequest } = await setupTest({
      editData: { sessionName: "New Name" },
      dirtyFields: { sessionName: true },
    });

    if (!editRequest) throw new Error("Edit request should be defined");
    await approveEditRequest(editRequest.id);

    expect(prisma.sessionRevision.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        sessionId: session.sessionId,
        snapshot: expect.any(String),
      })
    }));
  });

  it("should mark edit request as approved with reviewer info", async () => {
    const { editRequest } = await setupTest({
      editData: { sessionName: "New Name" },
      dirtyFields: { sessionName: true },
    });

    if (!editRequest) throw new Error("Edit request should be defined");
    const note = "Changes look good";
    await approveEditRequest(editRequest.id, note);

    expect(prisma.sessionEditRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: editRequest.id },
      data: expect.objectContaining({
        status: "APPROVED",
        reviewerId: mockUser.user!.id,
        reviewNote: note,
      })
    }));
  });

  it("should handle missing edit request gracefully", async () => {
    prismaMock.sessionEditRequest.findUnique.mockResolvedValue(null);
    const result = await approveEditRequest(999999);
    expect(result.error).toBe("Error: Edit request not found");
  });

  it("should not approve already approved/rejected requests", async () => {
    const { editRequest } = await setupTest({ editStatus: "APPROVED" });

    if (!editRequest) throw new Error("Edit request should be defined");
    const result = await approveEditRequest(editRequest.id);
    expect(result.error).toBe("Error: Edit request is not pending");
  });
});
