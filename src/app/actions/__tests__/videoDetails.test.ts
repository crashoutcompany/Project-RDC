import { vi } from "vitest";
import prisma from "prisma/db";
import { signInAs } from "@/test/session";
import { getRDCVideoDetails } from "../action";

const db = vi.mocked(prisma, { deep: true });

const VIDEO_ID = "dQw4w9WgXcQ";

const youtubeResponse = (channelTitle: string) =>
  Response.json({
    items: [
      {
        id: VIDEO_ID,
        snippet: {
          channelTitle,
          title: "RDC Mario Kart",
          publishedAt: "2024-05-01T00:00:00Z",
          thumbnails: { high: { url: "high.jpg", width: 480, height: 360 } },
        },
      },
    ],
  });

let fetchMock: ReturnType<typeof stubFetch>;
const stubFetch = () => vi.spyOn(globalThis, "fetch");

beforeEach(() => {
  signInAs("admin");
  db.session.findFirst.mockResolvedValue(null);
  fetchMock = stubFetch();
});

describe("getRDCVideoDetails", () => {
  it("maps an RDC Live upload to a new session draft", async () => {
    fetchMock.mockResolvedValue(youtubeResponse("RDC Live"));

    const result = await getRDCVideoDetails(VIDEO_ID, "Mario Kart 8", "anon");

    expect(result).toEqual({
      error: undefined,
      video: {
        sessionUrl: `https://youtube.com/watch?v=${VIDEO_ID}`,
        sessionName: "RDC Mario Kart",
        date: new Date("2024-05-01T00:00:00Z"),
        thumbnail: { url: "high.jpg", width: 480, height: 360 },
      },
    });
  });

  it("rejects videos from other channels", async () => {
    fetchMock.mockResolvedValue(youtubeResponse("Someone Else"));

    expect(await getRDCVideoDetails(VIDEO_ID, "Mario Kart 8", "anon")).toEqual({
      video: null,
      error: "Please upload a video by RDC Live",
    });
  });

  it("rejects malformed ids without calling YouTube or the database", async () => {
    expect(await getRDCVideoDetails("../../etc", "Mario Kart 8", "anon")).toEqual({
      video: null,
      error: "Invalid YouTube video ID.",
    });
    expect(db.session.findFirst).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("flags a video already recorded for the same game", async () => {
    const existing = { sessionId: 1, Game: { gameName: "Mario Kart 8" } };
    db.session.findFirst.mockResolvedValue(existing as never);

    expect(await getRDCVideoDetails(VIDEO_ID, "Mario Kart 8", "anon")).toEqual({
      video: existing,
      error: "Video already exists",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reuses a video recorded for a different game", async () => {
    const existing = { sessionId: 1, Game: { gameName: "Rocket League" } };
    db.session.findFirst.mockResolvedValue(existing as never);

    expect(await getRDCVideoDetails(VIDEO_ID, "Mario Kart 8", "anon")).toEqual({
      video: existing,
      error: undefined,
    });
  });

  it("returns a retryable error when YouTube fails", async () => {
    fetchMock.mockResolvedValue(Response.json({ error: "quota" }, { status: 403 }));

    expect(await getRDCVideoDetails(VIDEO_ID, "Mario Kart 8", "anon")).toEqual({
      video: null,
      error: "Something went wrong. Please try again.",
    });
  });
});
