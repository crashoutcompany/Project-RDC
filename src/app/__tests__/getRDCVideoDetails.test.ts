jest.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));

jest.mock("@/lib/config", () => ({
  __esModule: true,
  default: {
    YOUTUBE_API_KEY: "test-youtube-key",
  },
}));

import { getRDCVideoDetails } from "../actions/action";
import { auth } from "@/lib/auth";
import prisma from "prisma/db";
import { errorCodes } from "@/lib/constants";

const mockGetSession = auth.api.getSession as unknown as jest.Mock;

const rdcVideoResponse = {
  items: [
    {
      id: "dQw4w9WgXcQ",
      snippet: {
        publishedAt: "2024-01-15T12:00:00Z",
        channelTitle: "RDC Live",
        title: "RDC plays Rocket League",
        thumbnails: {
          high: {
            url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
            width: 480,
            height: 360,
          },
        },
      },
      player: { embedHtml: "<iframe></iframe>" },
    },
  ],
};

describe("getRDCVideoDetails", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({
      user: { role: "admin", email: "admin@test.com" },
    });
    (prisma.session.findFirst as jest.Mock).mockResolvedValue(null);
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("requests snippet metadata so RDC Live videos can be linked", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => rdcVideoResponse,
    });

    const result = await getRDCVideoDetails(
      "dQw4w9WgXcQ",
      "Rocket League",
      "distinct-1",
    );

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const requestedUrl = new URL((global.fetch as jest.Mock).mock.calls[0][0]);
    expect(requestedUrl.searchParams.get("part")).toBe("snippet,player");
    expect(result.error).toBeUndefined();
    expect(result.video).toMatchObject({
      sessionName: "RDC plays Rocket League",
      sessionUrl: "https://youtube.com/watch?v=dQw4w9WgXcQ",
    });
  });

  it("does not treat missing snippet as a successful RDC Live video", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            id: "dQw4w9WgXcQ",
            player: { embedHtml: "<iframe></iframe>" },
          },
        ],
      }),
    });

    const result = await getRDCVideoDetails(
      "dQw4w9WgXcQ",
      "Rocket League",
      "distinct-1",
    );

    expect(result.video).toBeNull();
    expect(result.error).toBe("Please upload a video by RDC Live");
  });

  it("rejects unauthenticated callers", async () => {
    mockGetSession.mockResolvedValue(null);

    const result = await getRDCVideoDetails(
      "dQw4w9WgXcQ",
      "Rocket League",
      "distinct-1",
    );

    expect(result).toEqual({
      video: null,
      error: errorCodes.NotAuthenticated,
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
