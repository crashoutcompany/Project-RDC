import { buildYouTubeVideosListUrl } from "@/lib/youtube";

describe("buildYouTubeVideosListUrl", () => {
  it("requests snippet and player in a single part value", () => {
    const url = new URL(
      buildYouTubeVideosListUrl("dQw4w9WgXcQ", "test-api-key"),
    );

    expect(url.origin + url.pathname).toBe(
      "https://youtube.googleapis.com/youtube/v3/videos",
    );
    expect(url.searchParams.get("part")).toBe("snippet,player");
    expect(url.searchParams.getAll("part")).toEqual(["snippet,player"]);
    expect(url.searchParams.get("id")).toBe("dQw4w9WgXcQ");
    expect(url.searchParams.get("key")).toBe("test-api-key");
  });
});
