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

  it("does not drop snippet when encoding query params", () => {
    // URLSearchParams.set overwrites duplicate keys; this is the failure mode
    // introduced when converting the videos.list URL to URLSearchParams.
    const broken = new URL("https://youtube.googleapis.com/youtube/v3/videos");
    broken.searchParams.set("part", "snippet");
    broken.searchParams.set("part", "player");

    expect(broken.searchParams.get("part")).toBe("player");
    expect(broken.searchParams.get("part")).not.toContain("snippet");

    const url = new URL(
      buildYouTubeVideosListUrl("abcdefghijk", "key"),
    );
    expect(url.searchParams.get("part")).toContain("snippet");
    expect(url.searchParams.get("part")).toContain("player");
  });
});
