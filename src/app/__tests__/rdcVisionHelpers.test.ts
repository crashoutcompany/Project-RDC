jest.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));

jest.mock("prisma/db", () => ({
  __esModule: true,
  default: {
    game: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock("@/app/actions/visionAction", () => ({
  analyzeScreenShot: jest.fn(),
}));

import { handleAnalyzeBtnClick } from "@/app/(routes)/admin/_utils/rdc-vision-helpers";
import { auth } from "@/lib/auth";
import { VisionResultCodes, errorCodes } from "@/lib/constants";
import { Player } from "@/generated/prisma/client";

const mockGetSession = auth.api.getSession as unknown as jest.Mock;

describe("handleAnalyzeBtnClick", () => {
  const players = [{ playerId: 1, playerName: "Ben" }] as Player[];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("denies unauthenticated users", async () => {
    mockGetSession.mockResolvedValue(null);

    const result = await handleAnalyzeBtnClick("base64", players, "Mario Kart 8");

    expect(result).toEqual({
      status: VisionResultCodes.Failed,
      message: errorCodes.NotAuthenticated,
    });
  });

  it("denies non-admin users", async () => {
    mockGetSession.mockResolvedValue({ user: { role: "user" } });

    const result = await handleAnalyzeBtnClick("base64", players, "Mario Kart 8");

    expect(result).toEqual({
      status: VisionResultCodes.Failed,
      message: errorCodes.NotAuthenticated,
    });
  });
});
